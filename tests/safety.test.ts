import { describe, expect, it } from 'vitest';
import {
    Ester,
    Route,
    SAFETY_THRESHOLDS,
    countHighDoseDays,
    cumulativeDoseAlert,
    cumulativeSeverity,
    evaluateSafety,
    extremeLabAlerts,
    extremeSimulationAlerts,
    highestSeverity,
    localDayKey,
    selectModalAlert,
    severityFor,
    type DoseEvent,
    type LabResult,
    type SafetyAlert,
    type SimulationResult,
} from '../logic';

const NOW_H = 480_000;

const sim = (e2: number, t: number, atH = NOW_H): SimulationResult =>
    ({
        timeH: [atH - 1, atH],
        concPGmL_E2: [0, e2],
        concNGdL_T: [0, t],
    }) as unknown as SimulationResult;

const lab = (id: string, timeH: number, concValue: number, unit: LabResult['unit']): LabResult => ({
    id,
    timeH,
    concValue,
    unit,
});

const dose = (id: string, timeH: number, doseMG: number): DoseEvent => ({
    id,
    route: Route.oral,
    ester: Ester.E2,
    doseMG,
    timeH,
    extras: {},
});

const injection = (id: string, timeH: number, doseMG: number, ester: Ester): DoseEvent => ({
    id,
    route: Route.injection,
    ester,
    doseMG,
    timeH,
    extras: {},
});

describe('severityFor', () => {
    it('keeps notice strict and high/critical inclusive for E2', () => {
        expect(severityFor(300, SAFETY_THRESHOLDS.e2)).toBeNull();
        expect(severityFor(301, SAFETY_THRESHOLDS.e2)).toBe('notice');
        expect(severityFor(1000, SAFETY_THRESHOLDS.e2)).toBe('high');
        expect(severityFor(5000, SAFETY_THRESHOLDS.e2)).toBe('critical');
    });

    it('uses separate T thresholds', () => {
        expect(severityFor(1000, SAFETY_THRESHOLDS.t)).toBeNull();
        expect(severityFor(1001, SAFETY_THRESHOLDS.t)).toBe('notice');
        expect(severityFor(1500, SAFETY_THRESHOLDS.t)).toBe('high');
        expect(severityFor(3000, SAFETY_THRESHOLDS.t)).toBe('critical');
    });
});

describe('cumulativeSeverity', () => {
    it('counts high-dose days inclusively', () => {
        expect(cumulativeSeverity(6)).toBeNull();
        expect(cumulativeSeverity(7)).toBe('notice');
        expect(cumulativeSeverity(14)).toBe('high');
        expect(cumulativeSeverity(30)).toBe('critical');
    });
});

describe('localDayKey', () => {
    it('groups by local calendar day', () => {
        expect(localDayKey(NOW_H)).toBe(localDayKey(NOW_H + 1));
        expect(localDayKey(NOW_H)).not.toBe(localDayKey(NOW_H + 24));
    });
});

describe('extremeSimulationAlerts', () => {
    it('reports critical E2 and T peaks with one local-day id each', () => {
        const alerts = extremeSimulationAlerts(sim(5000, 3000), NOW_H);
        expect(alerts).toHaveLength(2);

        const e2 = alerts.find((a) => a.kind === 'e2_extreme');
        const t = alerts.find((a) => a.kind === 't_extreme');
        expect(e2).toMatchObject({
            id: `e2_extreme:${localDayKey(NOW_H)}`,
            severity: 'critical',
            value: 5000,
            threshold: SAFETY_THRESHOLDS.e2.critical,
            atH: NOW_H,
        });
        expect(t).toMatchObject({
            id: `t_extreme:${localDayKey(NOW_H)}`,
            severity: 'critical',
            value: 3000,
            threshold: SAFETY_THRESHOLDS.t.critical,
            atH: NOW_H,
        });
    });

    it('stays quiet below the notice thresholds', () => {
        expect(extremeSimulationAlerts(sim(299, 999), NOW_H)).toEqual([]);
    });
});

describe('extremeLabAlerts', () => {
    it('reports a recent critical E2 lab', () => {
        const alerts = extremeLabAlerts([lab('e2', NOW_H - 1, 5000, 'pg/ml')], NOW_H);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({
            id: 'e2_lab:e2',
            kind: 'e2_lab',
            severity: 'critical',
            value: 5000,
            atH: NOW_H - 1,
        });
    });

    it('ignores labs older than 30 days', () => {
        expect(extremeLabAlerts([lab('old', NOW_H - 31 * 24, 5000, 'pg/ml')], NOW_H)).toEqual([]);
    });

    it('reports critical T in ng/dL and nmol/L', () => {
        const inNgDl = extremeLabAlerts([lab('t-ng', NOW_H - 1, 3000, 'ng/dl')], NOW_H);
        expect(inNgDl).toHaveLength(1);
        expect(inNgDl[0]).toMatchObject({ kind: 't_lab', severity: 'critical' });

        const inNmol = extremeLabAlerts([lab('t-nmol', NOW_H - 1, 3000 / 28.842, 'nmol/l')], NOW_H);
        expect(inNmol).toHaveLength(1);
        expect(inNmol[0]).toMatchObject({ kind: 't_lab', severity: 'critical' });
        expect(inNmol[0].value).toBeCloseTo(3000, 6);
    });

    it('judges the latest value per hormone, not an older critical value', () => {
        const alerts = extremeLabAlerts(
            [lab('old', NOW_H - 10 * 24, 6000, 'pg/ml'), lab('new', NOW_H - 1, 100, 'pg/ml')],
            NOW_H,
        );
        expect(alerts).toEqual([]);
    });

    it('averages same-time labs for one hormone', () => {
        const alerts = extremeLabAlerts(
            [lab('a', NOW_H - 1, 4000, 'pg/ml'), lab('b', NOW_H - 1, 6000, 'pg/ml')],
            NOW_H,
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0].value).toBe(5000);
    });
});

describe('countHighDoseDays', () => {
    it('counts a single high dose once, not every day in the rolling window', () => {
        expect(countHighDoseDays([dose('one', NOW_H - 3 * 24, 20)], NOW_H, 90)).toBe(1);
    });

    it('counts 40 daily high-dose days', () => {
        const events = Array.from({ length: 40 }, (_, i) => dose(`d${i}`, NOW_H - i * 24, 20));
        expect(countHighDoseDays(events, NOW_H, 90)).toBe(40);
    });

    it('counts excessive injected estradiol cadence with every single dose below the guard', () => {
        const events = Array.from({ length: 8 }, (_, i) =>
            injection(`ev${i}`, NOW_H - i * 7 * 24, 25, Ester.EV),
        );
        expect(countHighDoseDays(events, NOW_H, 90)).toBe(7);
    });

    it('counts excessive injected testosterone cadence', () => {
        const events = Array.from({ length: 8 }, (_, i) =>
            injection(`tc${i}`, NOW_H - i * 7 * 24, 300, Ester.TC),
        );
        expect(countHighDoseDays(events, NOW_H, 90)).toBe(7);
    });
});

describe('cumulativeDoseAlert', () => {
    it('reports 40 high-dose days as critical with a 30-day bucket id', () => {
        const events = Array.from({ length: 40 }, (_, i) => dose(`d${i}`, NOW_H - i * 24, 20));
        const alert = cumulativeDoseAlert(events, NOW_H);
        expect(alert).toMatchObject({
            id: `cumulative:${Math.floor(NOW_H / (30 * 24))}`,
            kind: 'cumulative_dose',
            severity: 'critical',
            value: 40,
            threshold: SAFETY_THRESHOLDS.cumulativeHighDoseDays.critical,
            atH: NOW_H,
        });
    });

    it('stays quiet at 6 high-dose days', () => {
        const events = Array.from({ length: 6 }, (_, i) => dose(`d${i}`, NOW_H - i * 24, 20));
        expect(cumulativeDoseAlert(events, NOW_H)).toBeNull();
    });
});

describe('evaluateSafety', () => {
    it('merges simulation, lab, and cumulative alerts', () => {
        const events = Array.from({ length: 40 }, (_, i) => dose(`d${i}`, NOW_H - i * 24, 20));
        const alerts = evaluateSafety({
            events,
            simulation: sim(5000, 3000),
            labResults: [lab('e2', NOW_H - 1, 5000, 'pg/ml')],
            nowH: NOW_H,
        });

        expect(alerts.map((a) => a.kind).sort()).toEqual(
            ['cumulative_dose', 'e2_extreme', 'e2_lab', 't_extreme'].sort(),
        );
    });
});

describe('selectModalAlert', () => {
    const alerts: SafetyAlert[] = [
        { id: 'notice', kind: 'e2_lab', severity: 'notice', value: 400, threshold: 300, atH: NOW_H - 3 },
        { id: 'old-critical', kind: 'e2_extreme', severity: 'critical', value: 6000, threshold: 5000, atH: NOW_H - 2 },
        { id: 'new-critical', kind: 't_extreme', severity: 'critical', value: 4000, threshold: 3000, atH: NOW_H - 1 },
    ];

    it('selects the newest critical alert that has not been dismissed', () => {
        expect(selectModalAlert(alerts, {})?.id).toBe('new-critical');
        expect(selectModalAlert(alerts, { 'new-critical': NOW_H })?.id).toBe('old-critical');
        expect(selectModalAlert(alerts, { 'new-critical': NOW_H, 'old-critical': NOW_H })).toBeNull();
    });

    it('never selects a non-critical alert', () => {
        expect(selectModalAlert(alerts.filter((a) => a.severity !== 'critical'), {})).toBeNull();
    });
});

describe('highestSeverity', () => {
    it('returns the highest severity or null for an empty list', () => {
        expect(highestSeverity([])).toBeNull();
        expect(
            highestSeverity([
                { id: 'n', kind: 'e2_lab', severity: 'notice', value: 400, threshold: 300, atH: NOW_H },
                { id: 'h', kind: 'e2_lab', severity: 'high', value: 1200, threshold: 1000, atH: NOW_H },
                { id: 'c', kind: 't_lab', severity: 'critical', value: 4000, threshold: 3000, atH: NOW_H },
            ]),
        ).toBe('critical');
    });
});
