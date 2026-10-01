import {
    DoseEvent, Route, Ester, ExtraKey, LabResult, SimulationResult,
    CalibrationMethod, CalibrationHistoryMode,
    runSimulation, computeCalibration, isTestosteroneEster, isKnownEster, UNMODELLED_DRUGS,
} from '../../logic';

/**
 * A regimen: one drug by one route at a steady interval. The forward-looking
 * features (the what-if, blood test timing, supply run-out) start from these.
 *
 * They come from the person's own medication plan when there is one (see
 * plan.ts). Only with no plan at all are they read off the log instead, from
 * the doses that recur at a steady interval.
 */

/**
 * What a regimen works on. Raloxifene stands apart: it is neither estradiol nor
 * an anti-androgen. 'other' is a drug code this build doesn't know, logged by
 * a newer version: it must never be taken for the estradiol regimen.
 */
export type Hormone = 'E2' | 'T' | 'AA' | 'SERM' | 'other';

export interface Regimen {
    /** route | ester | dose | the extras that change what the dose does */
    key: string;
    route: Route;
    ester: Ester;
    doseMG: number;
    extras: Partial<Record<ExtraKey, number>>;
    hormone: Hormone;
    /** Typical gap between doses, from the median of recent gaps. */
    intervalH: number;
    /** Most recent dose actually taken. */
    lastH: number;
    /** Next due: the earliest dose already scheduled in the log, else last + interval. May be in the past (overdue). */
    nextH: number;
    /** Doses already logged for the future. */
    scheduledH: number[];
    /** First dose of the current unbroken run of this regimen. */
    sinceH: number;
    /** From the plan: its doses are matched by drug and route alone, since a logged amount can drift from the planned one. */
    loose?: boolean;
}

const DETECT_WINDOW_H = 42 * 24;
const MIN_DOSES = 3;

export const hormoneOf = (ester: Ester): Hormone =>
    !isKnownEster(ester) ? 'other'
    : ester === Ester.RLX ? 'SERM'
    : ester === Ester.CPA || UNMODELLED_DRUGS.has(ester) ? 'AA'
    : isTestosteroneEster(ester) ? 'T' : 'E2';

const signature = (e: Pick<DoseEvent, 'route' | 'ester' | 'doseMG' | 'extras'>) => [
    e.route, e.ester, e.doseMG.toFixed(3),
    e.extras[ExtraKey.sublingualTier] ?? '', e.extras[ExtraKey.sublingualTheta] ?? '',
    e.extras[ExtraKey.gelSite] ?? '', e.extras[ExtraKey.releaseRateUGPerDay] ?? '',
].join('|');

const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** A run counts as stopped once it has gone this long without a dose. */
export const lapseH = (intervalH: number) => intervalH * 2.5 + 12;

/** Whether a logged dose belongs to a regimen. */
export const regimenMatches = (r: Regimen, e: DoseEvent) =>
    (r.loose ? e.route === r.route && e.ester === r.ester : signature(e) === r.key);

export function detectRegimens(events: DoseEvent[], nowH: number): Regimen[] {
    const groups = new Map<string, DoseEvent[]>();
    for (const e of events) {
        if (e.route === Route.patchRemove) continue;
        const k = signature(e);
        const list = groups.get(k);
        if (list) list.push(e); else groups.set(k, [e]);
    }

    const out: Regimen[] = [];
    for (const [key, list] of groups) {
        const sorted = [...list].sort((a, b) => a.timeH - b.timeH);
        const past = sorted.filter(e => e.timeH <= nowH);
        const recent = past.filter(e => e.timeH >= nowH - DETECT_WINDOW_H);
        if (recent.length < MIN_DOSES) continue;

        const gaps: number[] = [];
        for (let i = 1; i < recent.length; i++) gaps.push(recent[i].timeH - recent[i - 1].timeH);
        // Logged times wobble by minutes; the schedule behind them is in whole
        // hours (half hours for anything more often than daily). Unrounded, a
        // 168.1 h median walks a weekly schedule half an hour later per quarter.
        const rawInterval = median(gaps);
        const intervalH = rawInterval >= 24 ? Math.round(rawInterval) : Math.round(rawInterval * 2) / 2;
        if (!(intervalH > 1)) continue;

        const lastH = past[past.length - 1].timeH;
        if (nowH - lastH > lapseH(intervalH)) continue;

        let sinceH = lastH;
        for (let i = past.length - 2; i >= 0; i--) {
            if (past[i + 1].timeH - past[i].timeH > lapseH(intervalH)) break;
            sinceH = past[i].timeH;
        }

        const scheduledH = sorted.filter(e => e.timeH > nowH).map(e => e.timeH);
        const sample = past[past.length - 1];
        out.push({
            key,
            route: sample.route,
            ester: sample.ester,
            doseMG: sample.doseMG,
            extras: { ...sample.extras },
            hormone: hormoneOf(sample.ester),
            intervalH,
            lastH,
            nextH: scheduledH[0] ?? lastH + intervalH,
            scheduledH,
            sinceH,
        });
    }
    // A switch leaves the old regimen looking merely paused until it lapses:
    // one whose last dose came before another of the same hormone began has
    // been replaced, not missed. Two that overlap in time (an injection with a
    // sublingual top-up) are both current and both stay.
    const current = out.filter(r => !out.some(o => o !== r && o.hormone === r.hormone && o.sinceH > r.lastH));
    return current.sort((a, b) => a.nextH - b.nextH);
}

/**
 * Doses of `r` carried on from after its last logged one (taken or scheduled)
 * up to `untilH`, keeping its rhythm but never landing before `fromH`: a
 * planned regimen can be weeks behind its last logged dose, and those missed
 * slots did not happen.
 */
function continuation(r: Regimen, untilH: number, fromH = -Infinity): DoseEvent[] {
    const out: DoseEvent[] = [];
    const lastLogged = Math.max(r.lastH, ...r.scheduledH);
    for (let t = lastLogged + r.intervalH; t <= untilH; t += r.intervalH) {
        if (t < fromH) continue;
        out.push({ id: `proj-${r.key}-${t}`, route: r.route, ester: r.ester, timeH: t, doseMG: r.doseMG, extras: r.extras });
    }
    return out;
}

export interface PlanSpec {
    route: Route;
    ester: Ester;
    doseMG: number;
    extras: Partial<Record<ExtraKey, number>>;
    intervalH: number;
    startH: number;
    /** Stop the current regimens of the same hormone from startH, rather than adding this on top. */
    replace: boolean;
}

export interface Series {
    timeH: number[];
    value: number[];
}

export interface Stats {
    trough: number;
    peak: number;
    average: number;
    /** Share of the stat window spent inside the target range; null without a target. */
    inRange: number | null;
}

export interface Scenario {
    /** The expected curve: every dose on time, the person's fitted calibration. */
    series: Series;
    stats: Stats;
    /** 10th to 90th percentile across the Monte Carlo runs, on an hourly grid from now to the horizon. */
    band: { timeH: number[]; lo: number[]; hi: number[] } | null;
    /** The same percentiles for the three numbers, across runs. */
    range: { trough: [number, number]; peak: [number, number]; average: [number, number] } | null;
    /** The span the numbers were read over: the last steady cycle of the horizon. */
    statFromH: number;
    statToH: number;
    runs: number;
    /** Hours after `steadyFromH` until the cycles stop changing (within 5%); null when the horizon ends first. */
    steadyAfterH: number | null;
    /** Where that count starts: the plan's first dose, or the running regimen's first dose when the plan just continues it. */
    steadyFromH: number;
}

export interface ForecastInput {
    events: DoseEvent[];
    weight: number;
    labResults: LabResult[];
    calibrationMethod: CalibrationMethod;
    calibrationHistoryMode: CalibrationHistoryMode;
    isTransmasc: boolean;
    nowH: number;
    horizonH: number;
    /** The fitted model's own log error (CalibrationResult.fitErrPct), or null with no blood tests. */
    fitErrPct: number | null;
    target: { low: number; high: number } | null;
}

export interface Adherence {
    /** Share of scheduled doses that never got logged. */
    missRate: number;
    /** Spread of logged times around the schedule, in hours (one standard deviation). */
    jitterSdH: number;
}

/**
 * How this person actually keeps to a schedule, measured from their own log:
 * gaps that span two intervals are a missed dose, and how far each dose lands
 * from its slot is the timing spread.
 */
export function adherenceOf(r: Regimen, events: DoseEvent[]): Adherence {
    const times = events.filter(e => regimenMatches(r, e) && e.timeH >= r.sinceH && e.timeH <= r.lastH).map(e => e.timeH).sort((a, b) => a - b);
    if (times.length < 2) return { missRate: 0, jitterSdH: 0 };
    let slots = 0;
    const offsets: number[] = [];
    for (let i = 1; i < times.length; i++) {
        const k = Math.max(1, Math.round((times[i] - times[i - 1]) / r.intervalH));
        slots += k;
        offsets.push(times[i] - times[i - 1] - k * r.intervalH);
    }
    const missRate = Math.max(0, Math.min(0.5, 1 - (times.length - 1) / slots));
    const mean = offsets.reduce((a, x) => a + x, 0) / offsets.length;
    const variance = offsets.reduce((a, x) => a + (x - mean) ** 2, 0) / offsets.length;
    // A gap is the difference of two independent slot offsets, so its spread is √2 × one dose's.
    return { missRate, jitterSdH: Math.sqrt(variance / 2) };
}

const RUNS = 48;
const MC_HISTORY_H = 120 * 24; // older doses change the future by < 0.01%

/** Deterministic per scenario, so the band holds still while nothing changes. */
function seededRandom(seedText: string) {
    let h = 2166136261;
    for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
    let a = h >>> 0;
    const rand = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    return { rand, gauss };
}

const percentile = (sorted: number[], p: number) => {
    const i = (sorted.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

function interp(timeH: number[], value: number[], h: number): number {
    if (h <= timeH[0]) return value[0];
    const n = timeH.length;
    if (h >= timeH[n - 1]) return value[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (timeH[m] <= h) lo = m; else hi = m; }
    const u = (h - timeH[lo]) / (timeH[hi] - timeH[lo]);
    return value[lo] + (value[hi] - value[lo]) * u;
}

function statsOn(timeH: number[], value: number[], fromH: number, toH: number, target: { low: number; high: number } | null = null): Stats | null {
    let trough = Infinity, peak = -Infinity, area = 0, span = 0, inside = 0;
    for (let i = 0; i < timeH.length; i++) {
        if (timeH[i] < fromH || timeH[i] > toH) continue;
        trough = Math.min(trough, value[i]);
        peak = Math.max(peak, value[i]);
        if (i > 0 && timeH[i - 1] >= fromH) {
            const dt = timeH[i] - timeH[i - 1];
            area += (value[i] + value[i - 1]) / 2 * dt;
            span += dt;
            if (target) {
                const mid = (value[i] + value[i - 1]) / 2;
                if (mid >= target.low && mid <= target.high) inside += dt;
            }
        }
    }
    if (!Number.isFinite(trough)) return null;
    return { trough, peak, average: span > 0 ? area / span : (trough + peak) / 2, inRange: target && span > 0 ? inside / span : null };
}

/**
 * When a schedule settles: the first full cycle whose trough and peak are
 * both within 5% of the last full cycle's. That last cycle can't vouch for
 * itself, so a schedule still moving at the horizon reports null.
 */
function steadyAfter(timeH: number[], value: number[], fromH: number, cycleH: number, toH: number): number | null {
    const cycles: Stats[] = [];
    for (let a = fromH; a + cycleH <= toH; a += cycleH) {
        const st = statsOn(timeH, value, a, a + cycleH);
        if (!st) return null;
        cycles.push(st);
    }
    if (cycles.length < 2) return null;
    const last = cycles[cycles.length - 1];
    const close = (a: number, b: number) => Math.abs(a - b) <= 0.05 * Math.max(b, 1e-9);
    for (let k = 0; k < cycles.length - 1; k++) {
        if (close(cycles[k].trough, last.trough) && close(cycles[k].peak, last.peak)) return (k + 1) * cycleH;
    }
    return null;
}

/**
 * One future, run through the same engine and the same personal calibration as
 * the real curve, then run again {RUNS} times with the person's own habits
 * put back in.
 *
 * Expected curve: calibration is refitted on this schedule with the same blood
 * tests. The tests are all in the past, where every scenario agrees, so the
 * fitted amplitude and clearance are the person's own; only the future the
 * multiplier is laid over changes.
 *
 * Range: each run drops projected doses at the person's measured miss rate,
 * moves each by their measured timing spread, and scales the whole run by a
 * draw from the calibration's own error (none when there are no blood tests,
 * rather than a borrowed population figure). The band is the 10th to 90th
 * percentile across runs, hour by hour.
 */
function simulateScenario(input: ForecastInput, fixed: DoseEvent[], projected: DoseEvent[], cycleH: number, habits: Adherence, seedText: string, startH: number): Scenario | null {
    const { weight, labResults, calibrationMethod, calibrationHistoryMode, isTransmasc, nowH, horizonH, fitErrPct, target } = input;
    const all = [...fixed, ...projected].sort((a, b) => a.timeH - b.timeH);
    const sim: SimulationResult | null = runSimulation(all, weight);
    if (!sim || !sim.timeH.length) return null;

    let factor: (h: number) => number = () => 1;
    let value: number[];
    if (isTransmasc) {
        value = sim.timeH.map((_, i) => sim.concNGdL_T?.[i] ?? 0);
    } else {
        factor = computeCalibration(sim, all, weight, labResults, calibrationMethod, calibrationHistoryMode).factorFn;
        value = sim.timeH.map((h, i) => sim.concPGmL_E2[i] * factor(h));
    }

    const statToH = nowH + horizonH;
    const statFromH = statToH - Math.max(cycleH, 24 * 7);
    const stats = statsOn(sim.timeH, value, statFromH, statToH, target);
    if (!stats) return null;
    const steadyAfterH = steadyAfter(sim.timeH, value, startH, Math.max(cycleH, 24), statToH);

    // Monte Carlo over the projected doses only; logged ones happened as logged.
    const grid: number[] = [];
    for (let h = Math.ceil(nowH); h <= statToH; h += 1) grid.push(h);
    const recentFixed = fixed.filter(e => e.timeH >= nowH - MC_HISTORY_H);
    const sigma = !isTransmasc && fitErrPct !== null ? Math.log(1 + fitErrPct / 100) : 0;
    const { rand, gauss } = seededRandom(seedText);
    const perHour: number[][] = grid.map(() => []);
    const troughs: number[] = [], peaks: number[] = [], averages: number[] = [];
    for (let run = 0; run < RUNS; run++) {
        const scale = Math.exp(sigma * gauss());
        const shifted: DoseEvent[] = [];
        for (const e of projected) {
            if (rand() < habits.missRate) continue;
            const spread = Math.min(habits.jitterSdH * gauss(), (cycleH / 3));
            shifted.push({ ...e, timeH: e.timeH + Math.max(-cycleH / 3, spread) });
        }
        const runSim = runSimulation([...recentFixed, ...shifted].sort((a, b) => a.timeH - b.timeH), weight);
        if (!runSim || !runSim.timeH.length) continue;
        const raw = isTransmasc ? runSim.timeH.map((_, i) => runSim.concNGdL_T?.[i] ?? 0) : runSim.concPGmL_E2;
        const vals = grid.map(h => interp(runSim.timeH, raw, h) * factor(h) * scale);
        vals.forEach((v, i) => perHour[i].push(v));
        const s = statsOn(grid, vals, statFromH, statToH, target);
        if (s) { troughs.push(s.trough); peaks.push(s.peak); averages.push(s.average); }
    }

    const ok = troughs.length >= RUNS / 2;
    const p = (xs: number[]): [number, number] => { const s = [...xs].sort((a, b) => a - b); return [percentile(s, 0.1), percentile(s, 0.9)]; };
    return {
        series: { timeH: sim.timeH, value },
        stats,
        band: ok ? {
            timeH: grid,
            lo: perHour.map(v => percentile([...v].sort((a, b) => a - b), 0.1)),
            hi: perHour.map(v => percentile([...v].sort((a, b) => a - b), 0.9)),
        } : null,
        range: ok ? { trough: p(troughs), peak: p(peaks), average: p(averages) } : null,
        statFromH,
        statToH,
        runs: troughs.length,
        steadyAfterH,
        steadyFromH: startH,
    };
}

const mainOf = (regimens: Regimen[], target: Hormone) =>
    regimens.filter(r => r.hormone === target).sort((a, b) => b.intervalH - a.intervalH)[0];

/** Carry on exactly as now: every current regimen continues on its interval. */
export function forecastCurrent(input: ForecastInput, regimens: Regimen[]): Scenario | null {
    const { events, nowH, horizonH, isTransmasc } = input;
    const target: Hormone = isTransmasc ? 'T' : 'E2';
    const main = mainOf(regimens, target);
    const habits = main ? adherenceOf(main, events) : { missRate: 0, jitterSdH: 0 };
    const projected = regimens.flatMap(r => continuation(r, nowH + horizonH, nowH));
    // Measured from the regimen's own start, so "steady" reflects how long it has been running.
    return simulateScenario(input, events, projected, main ? Math.max(24, main.intervalH) : 24, habits, `current|${regimens.map(r => r.key).join(',')}|${Math.floor(nowH)}`, main?.sinceH ?? nowH);
}

/** The same future with `plan` switched in from its start (or added on top). */
export function forecastPlan(input: ForecastInput, regimens: Regimen[], plan: PlanSpec): Scenario | null {
    const { events, nowH, horizonH, isTransmasc } = input;
    const endH = nowH + horizonH;
    const target: Hormone = isTransmasc ? 'T' : 'E2';
    const main = mainOf(regimens, target);
    // A new plan is kept the way the person keeps the one they have now.
    const habits = main ? adherenceOf(main, events) : { missRate: 0, jitterSdH: 0 };

    const replaced = (e: { ester: Ester }) => plan.replace && hormoneOf(e.ester) === target;
    const kept = events.filter(e => !(e.timeH >= plan.startH && replaced(e)));
    const carried = regimens.flatMap(r => continuation(r, endH, nowH).filter(e => !(replaced(r) && e.timeH >= plan.startH)));
    const planDoses: DoseEvent[] = [];
    for (let t = plan.startH; t <= endH; t += plan.intervalH) {
        planDoses.push({ id: `plan-${t}`, route: plan.route, ester: plan.ester, timeH: t, doseMG: plan.doseMG, extras: plan.extras });
    }
    const seed = `plan|${signature({ ...plan, doseMG: plan.doseMG })}|${plan.intervalH}|${plan.startH}|${plan.replace}|${Math.floor(nowH)}`;
    // A plan that only carries on the current regimen has been running since that regimen began.
    const continues = main && plan.replace && signature(plan) === signature(main) && Math.abs(plan.intervalH - main.intervalH) < 0.5;
    return simulateScenario(input, kept, [...carried, ...planDoses], Math.max(24, plan.intervalH), habits, seed, continues ? main.sinceH : plan.startH);
}

/**
 * A light look a few cycles ahead, uncalibrated: enough to time a peak.
 * Calibration mostly scales the curve rather than moving where it peaks, so
 * this skips the ~200 ms refit the full forecast pays for.
 */
export function shapeAhead(events: DoseEvent[], regimens: Regimen[], weight: number, nowH: number, isTransmasc: boolean): Series | null {
    const untilH = nowH + 3 * Math.max(24, ...regimens.map(r => r.intervalH));
    const evs = [...events.filter(e => e.timeH >= nowH - MC_HISTORY_H), ...regimens.flatMap(r => continuation(r, untilH, nowH))].sort((a, b) => a.timeH - b.timeH);
    const sim = runSimulation(evs, weight);
    if (!sim || !sim.timeH.length) return null;
    return { timeH: sim.timeH, value: isTransmasc ? sim.timeH.map((_, i) => sim.concNGdL_T?.[i] ?? 0) : sim.concPGmL_E2 };
}

/** Where a moment falls in its regimen's cycle: 0 right at a dose, approaching 1 just before the next. */
export function cyclePhase(r: Regimen, doseTimesH: number[], atH: number): number | null {
    let prev = -Infinity;
    for (const t of doseTimesH) { if (t <= atH) prev = t; else break; }
    if (!Number.isFinite(prev) || atH - prev > r.intervalH * 1.5) return null;
    return (atH - prev) / r.intervalH;
}

export interface DrawAdvice {
    kind: 'wait_steady' | 'trough' | 'peak' | 'routine';
    /** Suggested draw time. For a trough it is the latest good moment: just before the dose. */
    atH: number;
    regimen: Regimen;
    /** Hours after a dose the model puts the peak, for kind 'peak'. */
    peakAfterH?: number;
}

/**
 * The next blood test that would teach the calibration the most. A trough pins
 * the level the person spends most time near; a peak, once a trough is in
 * hand, is what separates "absorbs more" from "clears slower" (the amplitude
 * and half-life the fit reports). Before steady state any draw measures the
 * switch, not the regimen, so that comes first.
 */
export function adviseBloodDraw(
    regimens: Regimen[],
    events: DoseEvent[],
    labResults: LabResult[],
    currentSeries: Series | null,
    nowH: number,
    isTransmasc: boolean,
): DrawAdvice | null {
    const target: Hormone = isTransmasc ? 'T' : 'E2';
    const main = regimens.filter(r => r.hormone === target).sort((a, b) => b.intervalH - a.intervalH)[0];
    if (!main) return null;

    const dueAt = (fromH: number) => {
        let t = main.nextH;
        while (t < fromH) t += main.intervalH;
        return t;
    };

    const steadyH = main.sinceH + Math.max(21 * 24, main.intervalH * 3);
    if (nowH < steadyH) return { kind: 'wait_steady', atH: dueAt(steadyH) - 1, regimen: main };

    const doseTimes = events.filter(e => regimenMatches(main, e) && e.timeH <= nowH).map(e => e.timeH).sort((a, b) => a - b);
    const labsSince = labResults.filter(l => l.timeH >= steadyH - main.intervalH && l.timeH <= nowH);
    const phases = labsSince.map(l => cyclePhase(main, doseTimes, l.timeH)).filter((p): p is number => p !== null);

    // Where in the cycle the model peaks, read off the continued-regimen curve over one upcoming cycle.
    let peakAfterH: number | undefined;
    if (currentSeries && main.intervalH >= 24) {
        const from = dueAt(nowH), to = from + main.intervalH;
        let best = -Infinity;
        currentSeries.timeH.forEach((h, i) => {
            if (h >= from && h <= to && currentSeries.value[i] > best) { best = currentSeries.value[i]; peakAfterH = h - from; }
        });
    }

    const hasTrough = phases.some(p => p >= 0.75);
    if (!hasTrough) return { kind: 'trough', atH: dueAt(nowH + 1) - 1, regimen: main };

    const peakPhase = peakAfterH !== undefined ? peakAfterH / main.intervalH : null;
    const hasPeak = peakPhase === null || phases.some(p => Math.abs(p - peakPhase) <= 0.2);
    if (!hasPeak && peakAfterH !== undefined) {
        // To the hour: the model's peak is broad, and "23:58" reads as more precise than it is.
        return { kind: 'peak', atH: Math.round(dueAt(nowH) + peakAfterH), regimen: main, peakAfterH };
    }

    const lastLab = Math.max(...labsSince.map(l => l.timeH));
    return { kind: 'routine', atH: dueAt(lastLab + 12 * 7 * 24) - 1, regimen: main };
}

/** How a medicine comes: what one unit is, so a count on the shelf converts to mg (or patches). */
export type Pack =
    | { kind: 'vial'; ml: number; mgPerMl: number }
    | { kind: 'pill'; mg: number }
    | { kind: 'pump'; mg: number }
    | { kind: 'sachet'; mg: number }
    | { kind: 'patch' }
    | { kind: 'bulk' };

export type PackKind = Pack['kind'];

export interface Supply {
    id: string;
    route: Route;
    ester: Ester;
    pack: Pack;
    /** Units of `pack` on hand when counting started. */
    count: number;
    /** Epoch ms from which logged doses are subtracted. */
    startedAt: number;
}

/** mg in one unit of the pack; 1 for a patch, and for bulk mg. */
export const packUnitMG = (p: Pack): number => {
    switch (p.kind) {
        case 'vial': return p.ml * p.mgPerMl;
        case 'pill': case 'pump': case 'sachet': return p.mg;
        default: return 1;
    }
};

/** Packs that make sense for a route, first is the default. */
export const packKindsFor = (route: Route): PackKind[] => {
    switch (route) {
        case Route.injection: return ['vial', 'bulk'];
        case Route.oral: case Route.sublingual: return ['pill', 'bulk'];
        case Route.gel: return ['pump', 'sachet', 'bulk'];
        case Route.patchApply: return ['patch'];
        default: return ['bulk'];
    }
};

export const defaultPack = (kind: PackKind): Pack => {
    switch (kind) {
        case 'vial': return { kind, ml: 5, mgPerMl: 40 };
        case 'pill': return { kind, mg: 2 };
        case 'pump': return { kind, mg: 1.25 };
        case 'sachet': return { kind, mg: 1.5 };
        case 'patch': return { kind };
        default: return { kind: 'bulk' };
    }
};

/** Supplies saved before packs existed carried a bare amount; read them as bulk. */
export const normalizeSupply = (raw: any): Supply | null => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
    if (raw.pack && typeof raw.pack === 'object' && typeof raw.count === 'number') return raw as Supply;
    const amount = Number(raw.amount);
    if (!Number.isFinite(amount)) return null;
    return { id: raw.id, route: raw.route, ester: raw.ester, pack: raw.route === Route.patchApply ? { kind: 'patch' } : { kind: 'bulk' }, count: amount, startedAt: Number(raw.startedAt) || Date.now() };
};

export interface SupplyStatus {
    supply: Supply;
    /** In mg, or patches for a patch. */
    used: number;
    remaining: number;
    /** Per day, from the matching regimens; null when nothing current uses it. */
    dailyUse: number | null;
    runOutH: number | null;
}

export function supplyStatus(s: Supply, events: DoseEvent[], regimens: Regimen[], nowH: number): SupplyStatus {
    const fromH = s.startedAt / 3600000;
    const matches = (e: { route: Route; ester: Ester }) => e.route === s.route && e.ester === s.ester;
    const perDose = (e: { doseMG: number }) => (s.route === Route.patchApply ? 1 : e.doseMG);
    const used = events.filter(e => matches(e) && e.timeH >= fromH && e.timeH <= nowH).reduce((a, e) => a + perDose(e), 0);
    const remaining = Math.max(0, s.count * packUnitMG(s.pack) - used);
    const rate = regimens.filter(matches).reduce((a, r) => a + perDose(r) * 24 / r.intervalH, 0);
    const dailyUse = rate > 0 ? rate : null;
    return { supply: s, used, remaining, dailyUse, runOutH: dailyUse ? nowH + remaining / dailyUse * 24 : null };
}
