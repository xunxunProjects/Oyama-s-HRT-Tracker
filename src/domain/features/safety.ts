import { Route } from '../types';
import type { DoseEvent, LabResult, SimulationResult } from '../types';
import { getDoseAdvisory } from '../advisories';
import { convertToNgDl, convertToPgMl, isT_LabUnit } from '../labs';

export type SafetySeverity = 'notice' | 'high' | 'critical';

export type SafetyAlertKind = 'e2_extreme' | 't_extreme' | 'e2_lab' | 't_lab' | 'cumulative_dose';

export interface SafetyAlert {
    id: string;
    kind: SafetyAlertKind;
    severity: SafetySeverity;
    value: number;
    threshold: number;
    atH: number;
}

export const SAFETY_THRESHOLDS = {
    e2: { notice: 300, high: 1000, critical: 5000 },
    t: { notice: 1000, high: 1500, critical: 3000 },
    cumulativeHighDoseDays: { notice: 7, high: 14, critical: 30 },
} as const;

const SEVERITY_RANK: Record<SafetySeverity, number> = {
    notice: 0,
    high: 1,
    critical: 2,
};

const thresholdFor = (
    severity: SafetySeverity,
    thresholds: { notice: number; high: number; critical: number },
): number => {
    if (severity === 'critical') return thresholds.critical;
    if (severity === 'high') return thresholds.high;
    return thresholds.notice;
};

export function severityFor(
    value: number,
    thresholds: { notice: number; high: number; critical: number },
    noticeInclusive = false,
): SafetySeverity | null {
    if (!Number.isFinite(value)) return null;
    if (value >= thresholds.critical) return 'critical';
    if (value >= thresholds.high) return 'high';
    if (noticeInclusive ? value >= thresholds.notice : value > thresholds.notice) return 'notice';
    return null;
}

export function cumulativeSeverity(days: number): SafetySeverity | null {
    return severityFor(days, SAFETY_THRESHOLDS.cumulativeHighDoseDays, true);
}

export function localDayKey(timeH: number): string {
    const d = new Date(timeH * 3_600_000);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const maxPoint = (
    values: number[] | undefined,
    times: number[] | undefined,
    fallbackH: number,
): { value: number; atH: number } | null => {
    if (!values || values.length === 0) return null;

    let best = -Infinity;
    let atH = fallbackH;
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (!Number.isFinite(value)) continue;
        if (value > best) {
            best = value;
            atH = times?.[i] ?? fallbackH;
        }
    }

    return Number.isFinite(best) ? { value: best, atH } : null;
};

export function extremeSimulationAlerts(
    sim: SimulationResult | null | undefined,
    nowH: number,
): SafetyAlert[] {
    if (!sim) return [];

    const alerts: SafetyAlert[] = [];
    const peakE2 = maxPoint(sim.concPGmL_E2, sim.timeH, nowH);
    if (peakE2) {
        const severity = severityFor(peakE2.value, SAFETY_THRESHOLDS.e2);
        if (severity) {
            alerts.push({
                id: `e2_extreme:${localDayKey(nowH)}`,
                kind: 'e2_extreme',
                severity,
                value: peakE2.value,
                threshold: thresholdFor(severity, SAFETY_THRESHOLDS.e2),
                atH: peakE2.atH,
            });
        }
    }

    const peakT = maxPoint(sim.concNGdL_T, sim.timeH, nowH);
    if (peakT) {
        const severity = severityFor(peakT.value, SAFETY_THRESHOLDS.t);
        if (severity) {
            alerts.push({
                id: `t_extreme:${localDayKey(nowH)}`,
                kind: 't_extreme',
                severity,
                value: peakT.value,
                threshold: thresholdFor(severity, SAFETY_THRESHOLDS.t),
                atH: peakT.atH,
            });
        }
    }

    return alerts;
}

const latestLabGroup = (
    labs: LabResult[],
    nowH: number,
    maxAgeH: number,
): { value: number; atH: number; id: string } | null => {
    const recent = labs.filter((lab) => lab.timeH >= nowH - maxAgeH && lab.timeH <= nowH);
    if (recent.length === 0) return null;

    let latestH = -Infinity;
    for (const lab of recent) latestH = Math.max(latestH, lab.timeH);

    const latest = recent.filter((lab) => lab.timeH === latestH);
    const converted = latest.map((lab) => {
        const value = isT_LabUnit(lab.unit)
            ? convertToNgDl(lab.concValue, lab.unit)
            : convertToPgMl(lab.concValue, lab.unit);
        return Number.isFinite(value) ? value : null;
    });
    const values = converted.filter((value): value is number => value !== null);
    if (values.length === 0) return null;

    return {
        value: values.reduce((sum, value) => sum + value, 0) / values.length,
        atH: latestH,
        id: latest[latest.length - 1].id,
    };
};

export function extremeLabAlerts(
    labResults: LabResult[],
    nowH: number,
    maxAgeH = 30 * 24,
): SafetyAlert[] {
    const alerts: SafetyAlert[] = [];
    const e2Labs = labResults.filter((lab) => !isT_LabUnit(lab.unit));
    const tLabs = labResults.filter((lab) => isT_LabUnit(lab.unit));

    const e2 = latestLabGroup(e2Labs, nowH, maxAgeH);
    if (e2) {
        const severity = severityFor(e2.value, SAFETY_THRESHOLDS.e2);
        if (severity) {
            alerts.push({
                id: `e2_lab:${e2.id}`,
                kind: 'e2_lab',
                severity,
                value: e2.value,
                threshold: thresholdFor(severity, SAFETY_THRESHOLDS.e2),
                atH: e2.atH,
            });
        }
    }

    const t = latestLabGroup(tLabs, nowH, maxAgeH);
    if (t) {
        const severity = severityFor(t.value, SAFETY_THRESHOLDS.t);
        if (severity) {
            alerts.push({
                id: `t_lab:${t.id}`,
                kind: 't_lab',
                severity,
                value: t.value,
                threshold: thresholdFor(severity, SAFETY_THRESHOLDS.t),
                atH: t.atH,
            });
        }
    }

    return alerts;
}

/**
 * Counts local calendar days that contain a dose high enough to trip the
 * existing dose advisory. Daily doses are judged from that day alone so one
 * large dose is one day, not the whole 14-day advisory window. An injection's
 * weekly rate needs cadence from earlier doses, so a day with an injection is
 * also judged against the injection history up to that day.
 */
export function countHighDoseDays(events: DoseEvent[], nowH: number, windowDays = 90): number {
    if (windowDays <= 0) return 0;

    const fromH = nowH - windowDays * 24;
    const byDay = new Map<string, DoseEvent[]>();
    const injections = events.filter((event) => event.route === Route.injection);
    for (const event of events) {
        if (event.timeH < fromH || event.timeH > nowH) continue;
        const key = localDayKey(event.timeH);
        const dayEvents = byDay.get(key);
        if (dayEvents) dayEvents.push(event);
        else byDay.set(key, [event]);
    }

    let count = 0;
    for (const dayEvents of byDay.values()) {
        const dayNowH = Math.max(...dayEvents.map((event) => event.timeH));
        if (getDoseAdvisory(dayEvents, dayNowH)) {
            count++;
        } else if (
            dayEvents.some((event) => event.route === Route.injection) &&
            getDoseAdvisory(injections, dayNowH)
        ) {
            count++;
        }
    }
    return count;
}

export function cumulativeDoseAlert(events: DoseEvent[], nowH: number): SafetyAlert | null {
    const days = countHighDoseDays(events, nowH);
    const severity = cumulativeSeverity(days);
    if (!severity) return null;

    return {
        id: `cumulative:${Math.floor(nowH / (30 * 24))}`,
        kind: 'cumulative_dose',
        severity,
        value: days,
        threshold: thresholdFor(severity, SAFETY_THRESHOLDS.cumulativeHighDoseDays),
        atH: nowH,
    };
}

export function evaluateSafety({
    events,
    simulation,
    labResults,
    nowH,
}: {
    events: DoseEvent[];
    simulation: SimulationResult | null | undefined;
    labResults: LabResult[];
    nowH: number;
}): SafetyAlert[] {
    const alerts = [
        ...extremeSimulationAlerts(simulation, nowH),
        ...extremeLabAlerts(labResults, nowH),
        cumulativeDoseAlert(events, nowH),
    ].filter((alert): alert is SafetyAlert => alert !== null);

    return alerts.sort(
        (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.atH - a.atH,
    );
}

export function selectModalAlert(
    alerts: SafetyAlert[],
    dismissed: Record<string, number>,
): SafetyAlert | null {
    const candidates = alerts
        .filter((alert) => alert.severity === 'critical' && !dismissed[alert.id])
        .sort((a, b) => b.atH - a.atH);
    return candidates[0] ?? null;
}

export function highestSeverity(alerts: SafetyAlert[]): SafetySeverity | null {
    let highest: SafetySeverity | null = null;
    for (const alert of alerts) {
        if (highest === null || SEVERITY_RANK[alert.severity] > SEVERITY_RANK[highest]) {
            highest = alert.severity;
        }
    }
    return highest;
}
