import type { CalibrationHistoryMode, CalibrationPoint } from './types';
import { logRmsePct } from './types';
import type { DoseEvent, SimulationResult } from '../types';
import { getActivePKParams } from '../shared/activeParams';
import { runSimulationWithParams } from '../simulation/runSimulation';
import { interpolateConcentration_E2 } from '../simulation/interpolate';

// Clearance search bounds for the personal-clearance fit: personal clearance
// stays within 2× of the model in either direction (half-life within [0.5×, 2×]).
export const KMUL_MIN = 0.5;
export const KMUL_MAX = 2.0;
export const KMUL_STEPS = 21;

// Log-space measurement noise of a single E2 lab (assay + draw-timing scatter),
// as a fractional SD (~13%).
export const CAL_MEAS_SD = 0.13;
// Population priors (log-space SD) for the personal parameters. Amplitude varies
// a lot between people; clearance less so, and is only identifiable from several
// well-spaced labs.
export const CAL_PRIOR_SD_AMP = 0.5; // ≈ ±65% amplitude
export const CAL_PRIOR_SD_K = 0.35; // ≈ ±42% clearance
// Minimum labs before personal *clearance* (curve shape) is allowed to move.
// Labs drawn within LAB_CLUSTER_H of each other count once: several draws at
// the same moment say nothing about how fast the level falls, and used to
// invent a half-life change (+27% from three same-hour labs).
export const MIN_LABS_FOR_CLEARANCE = 3;
export const LAB_CLUSTER_H = 6;
// OU mean-reversion timescale for the dynamic (OU-Kalman) correction.
export const OU_TAU_H = 336; // ~2 weeks; ≈63% of info decays per τ
export const OU_STAT_SD = 0.5; // stationary SD of the log-correction
export const CAL_STUDENT_NU = 4; // Student-t dof for the robust MIPD likelihood

export const clampFactor = (x: number) => Math.max(0.01, Math.min(100, x));
// The fitted clearance stays on the grid the curve is drawn from. Clamping
// only to [0.01, 100] let the estimate drift past the grid edge, where the
// predictions stop changing, so the reported kMul and half-life change (shown
// in CalibrationPlot, CalibrationSettings and Forecast) described a curve
// other than the one drawn.
export const LOG_KMUL_MIN = Math.log(KMUL_MIN);
export const LOG_KMUL_MAX = Math.log(KMUL_MAX);
export const clampLogK = (k: number) => Math.max(LOG_KMUL_MIN, Math.min(LOG_KMUL_MAX, k));

/** Whether the first `count` labs are numerous and spread out enough to move clearance. */
export function clearanceIdentifiable(labTimes: number[], count: number): boolean {
    // Each cluster is measured from its first lab, so a run of labs a few
    // hours apart still counts once per LAB_CLUSTER_H, not once in all.
    let clusters = 0;
    let anchor = -Infinity;
    for (let i = 0; i < count; i++) {
        if (labTimes[i] - anchor > LAB_CLUSTER_H) {
            clusters++;
            anchor = labTimes[i];
        }
    }
    return clusters >= MIN_LABS_FOR_CLEARANCE;
}

/**
 * Precomputed personal-clearance response. For a grid of clearance multipliers we
 * re-simulate the PK once and record, per lab, the model-predicted log E2. The
 * estimators then evaluate log-pred(amplitude a, log-clearance k) ≈ a + g_i(k),
 * with g_i interpolated across the grid — so fitting needs no further simulation.
 */
export interface ClearanceField {
    logK: number[]; // grid knots (ascending), log clearance-mult
    sims: (SimulationResult | null)[]; // sim per knot (baseline reused at k≈0)
    gLog: number[][]; // gLog[knot][lab] = log model E2 at lab time
    baselineSim: SimulationResult;
}

export function buildClearanceField(
    baselineSim: SimulationResult,
    events: DoseEvent[],
    bodyWeightKG: number,
    labTimes: number[],
    birthYear: number | null,
): ClearanceField {
    const baseParams = getActivePKParams();
    const logKmin = Math.log(KMUL_MIN);
    const logKmax = Math.log(KMUL_MAX);
    const logK: number[] = [];
    const sims: (SimulationResult | null)[] = [];
    const gLog: number[][] = [];

    for (let j = 0; j < KMUL_STEPS; j++) {
        const lk = logKmin + (logKmax - logKmin) * (j / (KMUL_STEPS - 1));
        const kMul = Math.exp(lk);
        const atUnity = Math.abs(kMul - 1) < 1e-3;
        const sim = atUnity
            ? baselineSim
            : runSimulationWithParams(
                  events,
                  bodyWeightKG,
                  {
                      ...baseParams,
                      e2_kClear: baseParams.e2_kClear * kMul,
                      e2_kClearInj: baseParams.e2_kClearInj * kMul,
                  },
                  birthYear,
              );
        logK.push(lk);
        sims.push(sim);
        const row: number[] = [];
        for (const t of labTimes) {
            let c = sim ? interpolateConcentration_E2(sim, t) : null;
            if (c === null || Number.isNaN(c) || c < 1e-6) {
                const b = interpolateConcentration_E2(baselineSim, t);
                c = b === null || b < 1e-6 ? 1e-6 : b; // fall back to baseline shape
            }
            row.push(Math.log(c));
        }
        gLog.push(row);
    }
    return { logK, sims, gLog, baselineSim };
}

/** Model log-E2 at lab i for log-clearance k (linear interpolation across grid). */
export function fieldG(field: ClearanceField, i: number, k: number): number {
    const { logK, gLog } = field;
    const n = logK.length;
    if (k <= logK[0]) return gLog[0][i];
    if (k >= logK[n - 1]) return gLog[n - 1][i];
    let j = 1;
    while (j < n && logK[j] < k) j++;
    const t = (k - logK[j - 1]) / (logK[j] - logK[j - 1]);
    return gLog[j - 1][i] * (1 - t) + gLog[j][i] * t;
}

/**
 * dg_i/dk via local grid slope (Jacobian of the clearance channel). Zero
 * outside the grid, where fieldG is flat, so no estimator is pushed further out.
 */
export function fieldGSlope(field: ClearanceField, i: number, k: number): number {
    const { logK, gLog } = field;
    const n = logK.length;
    if (k < logK[0] || k > logK[n - 1]) return 0;
    let j = 1;
    while (j < n - 1 && logK[j] < k) j++;
    return (gLog[j][i] - gLog[j - 1][i]) / (logK[j] - logK[j - 1]);
}

/** Log E2 at `timeH` of the knot-`j` simulation, with fieldG's fallbacks. */
export function knotLogConc(field: ClearanceField, j: number, timeH: number): number {
    const sim = field.sims[j];
    let c = sim ? interpolateConcentration_E2(sim, timeH) : null;
    if (c === null || Number.isNaN(c) || c < 1e-6) {
        const b = interpolateConcentration_E2(field.baselineSim, timeH);
        c = b === null || b < 1e-6 ? 1e-6 : b;
    }
    return Math.log(c);
}

/**
 * Log E2 at any time for log-clearance k, interpolated across the knots exactly
 * as fieldG does at the lab times. Snapping to the nearest knot instead drew a
 * curve up to about 5% away from the one that was fitted.
 */
export function fieldLogConcAt(field: ClearanceField, k: number, timeH: number): number {
    const { logK } = field;
    const n = logK.length;
    const kc = clampLogK(k);
    let j = 1;
    while (j < n - 1 && logK[j] < kc) j++;
    const w = (kc - logK[j - 1]) / (logK[j] - logK[j - 1]);
    if (w <= 0) return knotLogConc(field, j - 1, timeH);
    if (w >= 1) return knotLogConc(field, j, timeH);
    return knotLogConc(field, j - 1, timeH) * (1 - w) + knotLogConc(field, j, timeH) * w;
}

/** Constant-parameter factor: calibrated = model · scale · (curve_k / baseline). */
export function constantFactor(field: ClearanceField, a: number, k: number): (timeH: number) => number {
    const scale = Math.exp(a);
    const atBaseline = Math.abs(k) < 1e-9;
    return (timeH: number) => {
        const b = interpolateConcentration_E2(field.baselineSim, timeH);
        if (b === null || b < 1 || atBaseline) return clampFactor(scale);
        return clampFactor((scale * Math.exp(fieldLogConcAt(field, k, timeH))) / b);
    };
}

/**
 * Piecewise factor for forward (causal) mode: the segment after lab i uses only
 * the parameters learned from labs up to i; before the first lab there is no
 * calibration. Past estimates therefore never change when a later lab is added.
 */
export function piecewiseFactor(
    field: ClearanceField,
    labTimes: number[],
    params: { a: number; k: number }[],
): (timeH: number) => number {
    const segFns = params.map(p => constantFactor(field, p.a, p.k));
    return (timeH: number) => {
        if (!labTimes.length || timeH < labTimes[0]) return 1;
        let idx = 0;
        for (let i = 0; i < labTimes.length; i++) {
            if (labTimes[i] <= timeH) idx = i;
            else break;
        }
        return segFns[idx](timeH);
    };
}

export interface EstimatorOut {
    factorFn: (timeH: number) => number;
    scale: number;
    kMul: number;
    halfLifeDeltaPct: number;
    fitErrPct: number | null;
}

/**
 * Typical deviation of the labs from the curve actually drawn (model × factor),
 * so it agrees with the plot in every method and history mode. Forecast uses it
 * for its uncertainty band.
 */
export function curveFitErrPct(points: CalibrationPoint[], factorFn: (timeH: number) => number): number | null {
    let sse = 0;
    for (const p of points) {
        const r = Math.log(p.obs) - Math.log(p.pred * factorFn(p.timeH));
        sse += r * r;
    }
    return logRmsePct(sse, points.length);
}

/**
 * Extended Kalman Filter over state [log-amplitude, log-clearance], processing
 * the first `count` labs chronologically. Near-zero process noise = permanent
 * memory. Returns the final state, whose amplitude is the posterior median: an
 * earlier Jensen term (adding half the amplitude variance) moved the curve up
 * to about 7% away from labs that matched the model exactly.
 */
export function ekfFit(field: ClearanceField, logObs: number[], count: number, allowClearance: boolean) {
    let x0 = 0,
        x1 = 0; // [a, k]
    let p00 = CAL_PRIOR_SD_AMP ** 2;
    let p11 = allowClearance ? CAL_PRIOR_SD_K ** 2 : 1e-8;
    let p01 = 0,
        p10 = 0;
    const R = CAL_MEAS_SD ** 2;
    const q00 = Math.log(1.01) ** 2; // tiny amplitude drift
    const q11 = allowClearance ? Math.log(1.005) ** 2 : 0;

    for (let i = 0; i < count; i++) {
        p00 += q00;
        p11 += q11; // predict (random walk)
        const H0 = 1;
        const H1 = allowClearance ? fieldGSlope(field, i, x1) : 0;
        const innov = logObs[i] - (x0 + fieldG(field, i, x1));
        const ph0 = p00 * H0 + p01 * H1; // P·Hᵀ
        const ph1 = p10 * H0 + p11 * H1;
        const S = H0 * ph0 + H1 * ph1 + R;
        const kg0 = ph0 / S,
            kg1 = ph1 / S; // Kalman gain
        x0 += kg0 * innov;
        x1 = clampLogK(x1 + kg1 * innov);
        // P ← (I − K·H)·P
        const a00 = 1 - kg0 * H0,
            a01 = -kg0 * H1,
            a10 = -kg1 * H0,
            a11 = 1 - kg1 * H1;
        const np00 = a00 * p00 + a01 * p10,
            np01 = a00 * p01 + a01 * p11;
        const np10 = a10 * p00 + a11 * p10,
            np11 = a10 * p01 + a11 * p11;
        p00 = np00;
        p01 = np01;
        p10 = np10;
        p11 = np11;
    }
    return { a: x0, k: x1 };
}

/**
 * Hybrid model-informed MAP fit of [log-amplitude, log-clearance] under a Gaussian
 * population prior, by iteratively reweighted Gauss-Newton over the first
 * `count` labs. Shrinks to the population mean (0,0) when labs are scarce.
 *
 * The likelihood is Student-t (downweighting an outlier) only once there are
 * MIN_LABS_FOR_CLEARANCE labs: with one or two labs nothing can tell an outlier
 * from a real difference, and the redescending Student-t made the fitted level
 * fall as a single lab rose. The robust posterior can have several modes, so
 * the fit starts from several points across the clearance grid and keeps the
 * best.
 */
export function mipdFit(field: ClearanceField, logObs: number[], count: number, allowClearance: boolean) {
    const sigma = CAL_MEAS_SD,
        nu = CAL_STUDENT_NU;
    const robust = count >= MIN_LABS_FOR_CLEARANCE;
    const precA = 1 / CAL_PRIOR_SD_AMP ** 2;
    const precK = 1 / CAL_PRIOR_SD_K ** 2;

    // Negative log posterior, up to a constant.
    const objective = (a: number, k: number) => {
        let f = 0.5 * precA * a * a + (allowClearance ? 0.5 * precK * k * k : 0);
        for (let i = 0; i < count; i++) {
            const u = (logObs[i] - (a + fieldG(field, i, k))) / sigma;
            f += robust ? 0.5 * (nu + 1) * Math.log(1 + (u * u) / nu) : 0.5 * u * u;
        }
        return f;
    };

    const solve = (a0: number, k0: number) => {
        let a = a0,
            k = allowClearance ? k0 : 0;
        for (let iter = 0; iter < 50; iter++) {
            let A00 = precA,
                A01 = 0,
                A11 = allowClearance ? precK : 1;
            let b0 = -precA * a,
                b1 = allowClearance ? -precK * k : 0; // prior pulls toward (0,0)
            for (let i = 0; i < count; i++) {
                const r = logObs[i] - (a + fieldG(field, i, k));
                const u = r / sigma;
                const w = robust ? (nu + 1) / (nu + u * u) / (sigma * sigma) : 1 / (sigma * sigma);
                const J1 = allowClearance ? fieldGSlope(field, i, k) : 0;
                A00 += w;
                A01 += w * J1;
                A11 += w * J1 * J1;
                b0 += w * r;
                b1 += w * J1 * r;
            }
            const det = A00 * A11 - A01 * A01;
            if (Math.abs(det) < 1e-12) break;
            const d0 = (A11 * b0 - A01 * b1) / det;
            const d1 = allowClearance ? (A00 * b1 - A01 * b0) / det : 0;
            // Halve the step until the posterior does not get worse.
            const f0 = objective(a, k);
            let t = 1;
            while (t > 1e-4 && objective(a + t * d0, clampLogK(k + t * d1)) > f0 + 1e-12) t /= 2;
            const na = a + t * d0,
                nk = clampLogK(k + t * d1);
            const moved = Math.abs(na - a) + Math.abs(nk - k);
            a = na;
            k = nk;
            if (moved < 1e-7) break;
        }
        return { a, k, f: objective(a, k) };
    };

    const starts = allowClearance ? field.logK.filter((_, j) => j % 5 === 0) : [0];
    let best = solve(0, 0);
    for (const k0 of starts) {
        // Start the amplitude at the median residual for this clearance.
        const res = Array.from({ length: count }, (_, i) => logObs[i] - fieldG(field, i, k0)).sort((x, y) => x - y);
        const cand = solve(res[Math.floor(count / 2)] ?? 0, k0);
        if (cand.f < best.f) best = cand;
    }
    return { a: best.a, k: best.k };
}

/**
 * Ornstein-Uhlenbeck Kalman calibration: the log-correction z(t) is a mean-
 * reverting process, fit by a forward Kalman filter + RTS smoother over the labs.
 * Produces a time-varying factor that relaxes back to the model between/after
 * labs. Forward mode uses the causal filter; retrospective uses the smoother.
 */
export function ouCalibrate(points: CalibrationPoint[], historyMode: CalibrationHistoryMode): EstimatorOut {
    const n = points.length;
    const labTimes = points.map(p => p.timeH);
    const m = points.map(p => Math.log(p.obs) - Math.log(p.pred)); // observed log-correction
    const theta = 1 / OU_TAU_H;
    const Pstat = OU_STAT_SD ** 2;
    const R = CAL_MEAS_SD ** 2;

    const zf = new Array(n),
        Pf = new Array(n),
        zPred = new Array(n),
        Ppred = new Array(n);
    for (let i = 0; i < n; i++) {
        if (i === 0) {
            zPred[i] = 0;
            Ppred[i] = Pstat;
        } else {
            const phi = Math.exp(-theta * (labTimes[i] - labTimes[i - 1]));
            zPred[i] = phi * zf[i - 1];
            Ppred[i] = phi * phi * Pf[i - 1] + Pstat * (1 - phi * phi);
        }
        const S = Ppred[i] + R;
        const kg = Ppred[i] / S;
        zf[i] = zPred[i] + kg * (m[i] - zPred[i]);
        Pf[i] = (1 - kg) * Ppred[i];
    }
    const zs = zf.slice(),
        Ps = Pf.slice();
    for (let i = n - 2; i >= 0; i--) {
        const phi = Math.exp(-theta * (labTimes[i + 1] - labTimes[i]));
        const C = (Pf[i] * phi) / Ppred[i + 1];
        zs[i] = zf[i] + C * (zs[i + 1] - zPred[i + 1]);
        Ps[i] = Pf[i] + C * C * (Ps[i + 1] - Ppred[i + 1]);
    }

    const forward = historyMode === 'forward';
    const factorFn = (t: number): number => {
        let z: number;
        if (forward) {
            let j = -1;
            for (let i = 0; i < n; i++) {
                if (labTimes[i] <= t) j = i;
                else break;
            }
            z = j < 0 ? 0 : Math.exp(-theta * (t - labTimes[j])) * zf[j];
        } else if (t <= labTimes[0]) {
            z = Math.exp(-theta * (labTimes[0] - t)) * zs[0];
        } else if (t >= labTimes[n - 1]) {
            z = Math.exp(-theta * (t - labTimes[n - 1])) * zs[n - 1];
        } else {
            let j = 0;
            for (let i = 0; i < n - 1; i++) {
                if (labTimes[i] <= t) j = i;
                else break;
            }
            const D = labTimes[j + 1] - labTimes[j],
                s = t - labTimes[j];
            const sh = Math.sinh(theta * D) || 1; // OU bridge conditional mean
            z = (Math.sinh(theta * (D - s)) * zs[j] + Math.sinh(theta * s) * zs[j + 1]) / sh;
        }
        return clampFactor(Math.exp(z));
    };

    const zUse = forward ? zf : zs;
    let sse = 0;
    for (let i = 0; i < n; i++) {
        const r = m[i] - zUse[i];
        sse += r * r;
    }
    const zRep = zUse[n - 1];
    return {
        factorFn,
        scale: clampFactor(Math.exp(zRep)),
        kMul: 1,
        halfLifeDeltaPct: 0,
        fitErrPct: logRmsePct(sse, n),
    };
}
