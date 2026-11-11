import type { LabAssay, LabResult, Route, SimulationResult } from '../types';
import { convertToPgMl, isT_LabUnit } from '../labs';
import { interpolateConcentration_E2 } from '../simulation/interpolate';

export type CalibrationMethod = 'off' | 'ekf' | 'ou_kalman' | 'mipd' | 'bayes' | 'mcmc';

/**
 * How newly-added labs are allowed to act on the historical curve.
 *  - 'forward'       : causal filtering — each point in time only uses labs up
 *                      to that moment, so past estimates are never rewritten.
 *  - 'retrospective' : smoothing — all labs (and the final personal fit) are
 *                      used to re-estimate the whole history. More accurate in
 *                      hindsight; a new lab can revise older estimates.
 */
export type CalibrationHistoryMode = 'forward' | 'retrospective';

/** Map legacy stored method ids onto the current estimator set. */
export function normalizeCalibrationMethod(raw: string | null | undefined): CalibrationMethod {
    if (raw === 'off' || raw === 'ekf' || raw === 'ou_kalman' || raw === 'mipd' || raw === 'bayes' || raw === 'mcmc')
        return raw;
    if (raw === 'average') return 'mipd'; // amplitude-only LS → MAP with prior
    if (raw === 'adaptive') return 'ekf'; // amplitude + clearance fit → EKF
    return 'mipd';
}

/** A single measured-vs-model comparison derived from one E2 lab result. */
export interface CalibrationPoint {
    id: string;
    timeH: number;
    obs: number; // measured E2, converted to pg/mL
    pred: number; // raw model-predicted E2 at the lab time (pg/mL)
    ratio: number; // obs / pred (how far the body runs above/below the model)
    assay?: LabAssay; // the lab's method, when the person recorded it
}

export const clampRatio = (r: number) => Math.max(0.01, Math.min(100, r));

/**
 * Compare each E2 lab result against the raw model prediction at the same time.
 * Returned points power both the calibration factor and the per-lab UI insight.
 * Testosterone-unit labs and points where the model predicts ~0 are excluded
 * (a near-zero prediction means the lab doesn't correspond to the simulated PK
 * state — e.g. a baseline draw before any dose — and would yield an absurd ratio).
 */
export function computeCalibrationPoints(sim: SimulationResult | null, results: LabResult[]): CalibrationPoint[] {
    if (!sim || !results.length) return [];

    const getNearestConc_E2 = (timeH: number): number | null => {
        if (!sim.timeH.length) return null;
        let low = 0;
        let high = sim.timeH.length - 1;
        while (high - low > 1) {
            const mid = Math.floor((low + high) / 2);
            if (sim.timeH[mid] === timeH) return sim.concPGmL_E2[mid];
            if (sim.timeH[mid] < timeH) low = mid;
            else high = mid;
        }
        const idx = Math.abs(sim.timeH[high] - timeH) < Math.abs(sim.timeH[low] - timeH) ? high : low;
        return sim.concPGmL_E2[idx];
    };

    return results
        .filter(r => !isT_LabUnit(r.unit))
        .map(r => {
            const obs = convertToPgMl(r.concValue, r.unit);
            let pred = interpolateConcentration_E2(sim, r.timeH);
            if (pred === null || Number.isNaN(pred)) pred = getNearestConc_E2(r.timeH);
            if (pred === null || pred < 1 || obs <= 0) return null;
            const point: CalibrationPoint = { id: r.id, timeH: r.timeH, obs, pred, ratio: obs / pred };
            if (r.assay) point.assay = r.assay;
            return point;
        })
        .filter((p): p is CalibrationPoint => !!p)
        .sort((a, b) => a.timeH - b.timeH);
}

/** Geometric mean of the (clamped) lab ratios — the natural average for a multiplicative correction. */
export function geometricMeanRatio(points: CalibrationPoint[]): number {
    if (!points.length) return 1;
    const sumLog = points.reduce((s, p) => s + Math.log(clampRatio(p.ratio)), 0);
    return Math.exp(sumLog / points.length);
}

/** Typical residual of a log-space fit, expressed as a ± percentage (null if undefined). */
export function logRmsePct(sse: number, n: number): number | null {
    if (n < 2) return null;
    const rmse = Math.sqrt(sse / n);
    return (Math.exp(rmse) - 1) * 100;
}

/** Outcome of fitting the personal E2 calibration to the user's labs. */
export interface CalibrationResult {
    method: CalibrationMethod;
    /** Scale function r(t): calibrated E2 = model E2(t) * factorFn(t). */
    factorFn: (timeH: number) => number;
    /** Personal amplitude multiplier (bioavailability/Vd correction). */
    scale: number;
    /** Personal clearance multiplier (1 = unchanged; >1 = faster clearance). */
    kMul: number;
    /** Change in elimination half-life vs the model, as a signed percentage. */
    halfLifeDeltaPct: number;
    /** Number of E2 labs used in the fit. */
    n: number;
    /** Typical fit error as ±% (log-space RMSE), or null when not estimable (<2 labs / off). */
    fitErrPct: number | null;
    /** Per-lab measured-vs-model comparison points. */
    points: CalibrationPoint[];
    /**
     * Full Bayes only: posterior SD of log factorFn(t). The forecast band draws
     * from it instead of `fitErrPct`, so the range narrows near labs and widens
     * as they age.
     */
    factorSdFn?: (timeH: number) => number;
    /**
     * Full Bayes only: central 90% posterior interval of factorFn at the latest lab, the
     * level the labs pin down. Not an interval on `scale` alone: once clearance may
     * move, amplitude trades off against half-life and its own interval widens.
     */
    latestInterval?: [number, number];
    /** Full Bayes only: labs the robust likelihood ended up discounting (weight below ½). */
    discounted?: number;
    /** Full Bayes only: posterior probability of each drift memory: none, ~2 weeks, ~3 months, ~1 year. */
    drift?: Record<BayesDriftFamily, number>;
    /** Personal PK only: personal absorption-rate multiplier (1 = the model's uptake speed). */
    absMul?: number;
    /** Personal PK only, with more than one route: each route's personal level multiplier. */
    routeScales?: Partial<Record<Route, number>>;
    /** Personal PK only: worst split R-hat over the sampled parameters (near 1 = the chains agree). */
    rHat?: number;
}

export type BayesDriftFamily = 'none' | 'weeks' | 'months' | 'year';
