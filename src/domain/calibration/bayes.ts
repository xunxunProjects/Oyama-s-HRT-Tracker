import type { BayesDriftFamily, CalibrationHistoryMode, CalibrationPoint, CalibrationResult } from './types';
import type { LabAssay } from '../types';
import { interpolateConcentration_E2 } from '../simulation/interpolate';
import type { ClearanceField } from './estimators';
import {
    CAL_MEAS_SD,
    CAL_PRIOR_SD_AMP,
    CAL_PRIOR_SD_K,
    CAL_STUDENT_NU,
    LAB_CLUSTER_H,
    MIN_LABS_FOR_CLEARANCE,
    OU_TAU_H,
    clampFactor,
    clampLogK,
    clearanceIdentifiable,
    fieldG,
    fieldGSlope,
    fieldLogConcAt,
    knotLogConc,
} from './estimators';

// --- Full Bayes ---------------------------------------------------------------
//
// The other estimators each commit to one story about how a person differs from
// the model: a fixed amplitude (MIPD, EKF) or a level that wanders back to the
// model within weeks (OU-Kalman). Full Bayes keeps several stories and lets the
// labs weigh them. Under hypothesis h the log-correction at time t is
//
//     log r(t) = s + d(t) + [G(t; k) − G(t; 0)]
//
// where s is a static personal amplitude, d an Ornstein–Uhlenbeck drift and k
// the log personal clearance (G is the clearance field). h fixes how much of the
// population amplitude variance CAL_PRIOR_SD_AMP² is static and how much drifts,
// and the drift's memory τ. "No drift" is MIPD's model; drift with τ = OU_TAU_H
// carries OU-Kalman's two-week memory. Each hypothesis is fit by MAP, the
// Laplace approximation gives its marginal likelihood, and the posterior
// weights average the curves. That is Bayesian model averaging (Hoeting,
// Madigan, Raftery & Volinsky 1999, Statistical Science 14:382–417). The
// average also carries a posterior variance, which the forecast band uses.
//
// The prior on s is Student-t (CAL_STUDENT_NU), the scale mixture you get by
// treating the population SD as uncertain. Consistent labs far from the model
// can then move the curve the whole way, while a mild deviation still shrinks.
// The likelihood follows MIPD's rule: Gaussian below MIN_LABS_FOR_CLEARANCE
// labs, Student-t from there on.
//
// Each lab's log-scale SD combines three terms. CAL_MEAS_SD is the floor at a
// plateau. An additive assay floor, set by the recorded method, makes low
// readings count for less, because immunoassays lose accuracy at low estradiol
// and mass spectrometry holds up better (Rosner et al. 2013, J Clin Endocrinol
// Metab 98:1376–1387). The third term is the draw-time error times the
// baseline curve's local log-slope, so a lab on a steep flank counts for less
// than one on a plateau.

/** Drift shares of CAL_PRIOR_SD_AMP² and memories averaged over. Structural choices, not estimates. */
export const BAYES_DRIFT_SHARES = [0.25, 0.5];
export const BAYES_DRIFT_MEMORY: { tauH: number; family: BayesDriftFamily }[] = [
    { tauH: OU_TAU_H, family: 'weeks' },
    { tauH: 90 * 24, family: 'months' },
    { tauH: 365 * 24, family: 'year' },
];
/** Prior probability of the no-drift (MIPD) hypothesis; the rest is spread evenly over the drift grid. */
export const BAYES_NO_DRIFT_PRIOR = 1 / 3;
/** SD of a logged draw time, h. Labs are often entered later with an approximate time. */
export const BAYES_DRAW_TIME_SD_H = 1;
/** Additive assay floors, pg/mL. Chosen values, ordered as Rosner et al. 2013 rank the methods. */
export const BAYES_ASSAY_FLOOR_PGML: Record<LabAssay | 'unknown', number> = { lcms: 2, immuno: 8, chemi: 5, unknown: 5 };
/** Cap on one lab's log-scale SD: a lab drawn right at a dose time is uninformative, not infinite. */
export const BAYES_MAX_LAB_SD = 2;
export const BAYES_SLOPE_STEP_H = 0.25;
/** A lab is reported as discounted when its posterior-averaged Student-t weight falls below this. */
export const BAYES_DISCOUNTED_WEIGHT = 0.5;
export const Z90 = 1.6448536269514722;

export interface BayesHypothesis {
    share: number;
    tauH: number;
    prior: number;
    family: BayesDriftFamily;
}

export function bayesHypotheses(): BayesHypothesis[] {
    const each = (1 - BAYES_NO_DRIFT_PRIOR) / (BAYES_DRIFT_SHARES.length * BAYES_DRIFT_MEMORY.length);
    const list: BayesHypothesis[] = [{ share: 0, tauH: Infinity, prior: BAYES_NO_DRIFT_PRIOR, family: 'none' }];
    for (const share of BAYES_DRIFT_SHARES) {
        for (const { tauH, family } of BAYES_DRIFT_MEMORY) list.push({ share, tauH, prior: each, family });
    }
    return list;
}

// Unit-variance OU process with correlation exp(−|Δt|/τ). It is Markov, so the
// law at any time depends only on the nearest known values either side.

/** 1 − e^(−x), accurate for small x. */
export const oneMinusExp = (x: number) => -Math.expm1(-x);

/** Conditional-mean weights on the anchors (at most two) and the conditional variance. */
export function ouInterpolate(
    t: number,
    anchors: number[],
    tauH: number,
): { idx: number[]; w: number[]; condVar: number } {
    const K = anchors.length;
    if (!K) return { idx: [], w: [], condVar: 1 };
    if (t <= anchors[0]) {
        const g = (anchors[0] - t) / tauH;
        return { idx: [0], w: [Math.exp(-g)], condVar: oneMinusExp(2 * g) };
    }
    if (t >= anchors[K - 1]) {
        const g = (t - anchors[K - 1]) / tauH;
        return { idx: [K - 1], w: [Math.exp(-g)], condVar: oneMinusExp(2 * g) };
    }
    let lo = 0,
        hi = K - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (anchors[mid] <= t) lo = mid;
        else hi = mid;
    }
    // Bridge between the two anchors: exact Gaussian conditioning of the OU covariance.
    const a = (t - anchors[lo]) / tauH,
        b = (anchors[hi] - t) / tauH;
    const denom = oneMinusExp(2 * (a + b));
    if (!(denom > 0)) return { idx: [lo], w: [1], condVar: 0 };
    const fromC = oneMinusExp(2 * a),
        toC = oneMinusExp(2 * b);
    return {
        idx: [lo, hi],
        w: [(Math.exp(-a) * toC) / denom, (Math.exp(-b) * fromC) / denom],
        condVar: Math.max(0, (fromC * toC) / denom),
    };
}

/**
 * Prior precision of the unit OU process at sorted anchors. It is
 * tridiagonal because the process is Markov. Returned with log det of the
 * covariance, which the evidence needs.
 */
export function ouPrecision(anchors: number[], tauH: number): { diag: number[]; off: number[]; logDetCov: number } {
    const K = anchors.length;
    const diag = new Array(K).fill(0);
    const off = new Array(Math.max(0, K - 1)).fill(0);
    if (!K) return { diag, off, logDetCov: 0 };
    diag[0] = 1;
    let logDetCov = 0;
    for (let i = 0; i < K - 1; i++) {
        const g = (anchors[i + 1] - anchors[i]) / tauH;
        const r = Math.exp(-g);
        const oneMinusR2 = Math.max(oneMinusExp(2 * g), 1e-12);
        const c = 1 / oneMinusR2;
        diag[i] += r * r * c;
        diag[i + 1] += c;
        off[i] -= r * c;
        logDetCov += Math.log(oneMinusR2);
    }
    return { diag, off, logDetCov };
}

// The posterior precision has a fixed shape: a tridiagonal block over the
// drift anchors (each lab touches only its own anchor), bordered by the static
// amplitude and, when it may move, the clearance. Solving through the Schur
// complement keeps every step O(anchors) however many labs there are.

export interface Bordered {
    tDiag: number[];
    tOff: number[];
    /** B[a][c]: coupling of anchor a to border parameter c (0 = s, 1 = k). */
    B: number[][];
    C: number[][];
}

export interface BorderedFactor {
    d: number[];
    l: number[];
    U: number[][]; // T⁻¹B, K × m
    Sinv: number[][];
    logDet: number;
}

export function tridiagSolve(d: number[], l: number[], r: number[]): number[] {
    const K = d.length;
    const x = r.slice();
    for (let i = 1; i < K; i++) x[i] -= l[i] * x[i - 1];
    for (let i = 0; i < K; i++) x[i] /= d[i];
    for (let i = K - 2; i >= 0; i--) x[i] -= l[i + 1] * x[i + 1];
    return x;
}

export function factorBordered(h: Bordered): BorderedFactor | null {
    const K = h.tDiag.length;
    const m = h.C.length;
    // LDLᵀ of the tridiagonal block.
    const d = new Array(K).fill(0);
    const l = new Array(K).fill(0);
    let logDet = 0;
    for (let i = 0; i < K; i++) {
        if (i === 0) d[0] = h.tDiag[0];
        else {
            l[i] = h.tOff[i - 1] / d[i - 1];
            d[i] = h.tDiag[i] - l[i] * h.tOff[i - 1];
        }
        if (!(d[i] > 0) || !Number.isFinite(d[i])) return null;
        logDet += Math.log(d[i]);
    }
    const U: number[][] = Array.from({ length: K }, () => new Array(m).fill(0));
    for (let c = 0; c < m; c++) {
        const col = tridiagSolve(
            d,
            l,
            h.B.map(row => row[c]),
        );
        for (let a = 0; a < K; a++) U[a][c] = col[a];
    }
    // Schur complement S = C − Bᵀ T⁻¹ B (1×1 or 2×2).
    const S = h.C.map(row => row.slice());
    for (let r = 0; r < m; r++) {
        for (let c = 0; c < m; c++) {
            let acc = 0;
            for (let a = 0; a < K; a++) acc += h.B[a][r] * U[a][c];
            S[r][c] -= acc;
        }
    }
    let Sinv: number[][];
    if (m === 1) {
        if (!(S[0][0] > 0)) return null;
        logDet += Math.log(S[0][0]);
        Sinv = [[1 / S[0][0]]];
    } else {
        const det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
        if (!(det > 0) || !(S[0][0] > 0)) return null;
        logDet += Math.log(det);
        Sinv = [
            [S[1][1] / det, -S[0][1] / det],
            [-S[1][0] / det, S[0][0] / det],
        ];
    }
    return { d, l, U, Sinv, logDet };
}

/** Solves H [xT; xM] = [rT; rM] with H factored by `factorBordered`. */
export function solveBordered(
    f: BorderedFactor,
    h: Bordered,
    rT: number[],
    rM: number[],
): { xT: number[]; xM: number[] } {
    const K = f.d.length;
    const m = rM.length;
    const v = K ? tridiagSolve(f.d, f.l, rT) : [];
    const rhs = rM.slice();
    for (let c = 0; c < m; c++) for (let a = 0; a < K; a++) rhs[c] -= h.B[a][c] * v[a];
    const xM = f.Sinv.map(row => row.reduce((acc, s, c) => acc + s * rhs[c], 0));
    const xT = v.map((val, a) => val - f.U[a].reduce((acc, u, c) => acc + u * xM[c], 0));
    return { xT, xM };
}

/** dG(t; k)/dk at any time, matching fieldLogConcAt's interpolation (0 off the grid). */
export function fieldLogConcSlopeAt(field: ClearanceField, k: number, timeH: number): number {
    const { logK } = field;
    const n = logK.length;
    if (k < logK[0] || k > logK[n - 1]) return 0;
    let j = 1;
    while (j < n - 1 && logK[j] < k) j++;
    return (knotLogConc(field, j, timeH) - knotLogConc(field, j - 1, timeH)) / (logK[j] - logK[j - 1]);
}

/** One hypothesis, fit to the first `count` labs. */
export interface BayesFit {
    hyp: BayesHypothesis;
    s: number;
    k: number;
    d: number[];
    anchors: number[];
    sdD: number;
    allowK: boolean;
    H: Bordered;
    F: BorderedFactor;
    logZ: number;
    /** Student-t weight of each lab at the mode, 1 under the Gaussian likelihood. */
    tWeights: number[];
}

export interface BayesData {
    field: ClearanceField;
    logObs: number[];
    sigma: number[];
    labTimes: number[];
}

export function bayesFit(data: BayesData, count: number, hyp: BayesHypothesis): BayesFit | null {
    const { field, logObs, sigma, labTimes } = data;
    const allowK = clearanceIdentifiable(labTimes, count);
    const robust = count >= MIN_LABS_FOR_CLEARANCE;
    const nu = CAL_STUDENT_NU,
        nu0 = CAL_STUDENT_NU;
    const sdS = CAL_PRIOR_SD_AMP * Math.sqrt(1 - hyp.share);
    const sdD = CAL_PRIOR_SD_AMP * Math.sqrt(hyp.share);
    const precK = 1 / CAL_PRIOR_SD_K ** 2;

    // Drift anchors: one per cluster of labs, clustered as clearanceIdentifiable does.
    const anchors: number[] = [];
    const labAnchor: number[] = [];
    if (hyp.share > 0) {
        let first = -Infinity;
        let members: number[] = [];
        for (let i = 0; i < count; i++) {
            if (labTimes[i] - first > LAB_CLUSTER_H) {
                if (members.length) anchors.push(members.reduce((a, b) => a + b, 0) / members.length);
                members = [];
                first = labTimes[i];
            }
            members.push(labTimes[i]);
            labAnchor.push(anchors.length);
        }
        anchors.push(members.reduce((a, b) => a + b, 0) / members.length);
    }
    const K = anchors.length;
    const m = allowK ? 2 : 1;
    const Q = ouPrecision(anchors, hyp.tauH);
    const qScale = K ? 1 / (sdD * sdD) : 0;

    const residual = (i: number, s: number, k: number, d: number[]) =>
        logObs[i] - (s + (K ? d[labAnchor[i]] : 0) + fieldG(field, i, k));

    const objective = (s: number, k: number, d: number[]) => {
        let f = 0.5 * (nu0 + 1) * Math.log1p((s * s) / (nu0 * sdS * sdS));
        if (allowK) f += 0.5 * precK * k * k;
        for (let a = 0; a < K; a++) {
            let qd = Q.diag[a] * d[a];
            if (a > 0) qd += Q.off[a - 1] * d[a - 1];
            if (a < K - 1) qd += Q.off[a] * d[a + 1];
            f += 0.5 * qScale * d[a] * qd;
        }
        for (let i = 0; i < count; i++) {
            const u = residual(i, s, k, d) / sigma[i];
            f += robust ? 0.5 * (nu + 1) * Math.log1p((u * u) / nu) : 0.5 * u * u;
        }
        return f;
    };

    // Gauss–Newton (Fisher / IRLS) curvature and the gradient at a point.
    const normal = (s: number, k: number, d: number[]) => {
        const H: Bordered = {
            tDiag: Q.diag.map(q => q * qScale),
            tOff: Q.off.map(q => q * qScale),
            B: Array.from({ length: K }, () => new Array(m).fill(0)),
            C: Array.from({ length: m }, () => new Array(m).fill(0)),
        };
        const gT = new Array(K).fill(0);
        const gM = new Array(m).fill(0);
        const wS = (nu0 + 1) / (nu0 * sdS * sdS + s * s);
        H.C[0][0] += wS;
        gM[0] += wS * s;
        if (allowK) {
            H.C[1][1] += precK;
            gM[1] += precK * k;
        }
        for (let a = 0; a < K; a++) {
            let qd = Q.diag[a] * d[a];
            if (a > 0) qd += Q.off[a - 1] * d[a - 1];
            if (a < K - 1) qd += Q.off[a] * d[a + 1];
            gT[a] += qScale * qd;
        }
        for (let i = 0; i < count; i++) {
            const r = residual(i, s, k, d);
            const s2 = sigma[i] * sigma[i];
            const W = robust ? (nu + 1) / (nu * s2 + r * r) : 1 / s2;
            const J = allowK ? fieldGSlope(field, i, k) : 0;
            H.C[0][0] += W;
            gM[0] -= W * r;
            if (allowK) {
                H.C[0][1] += W * J;
                H.C[1][0] += W * J;
                H.C[1][1] += W * J * J;
                gM[1] -= W * J * r;
            }
            if (K) {
                const a = labAnchor[i];
                H.tDiag[a] += W;
                H.B[a][0] += W;
                if (allowK) H.B[a][1] += W * J;
                gT[a] -= W * r;
            }
        }
        return { H, gT, gM };
    };

    const solveFrom = (s0: number, k0: number, d0: number[]) => {
        let s = s0,
            k = allowK ? clampLogK(k0) : 0;
        let d = d0.slice();
        let f = objective(s, k, d);
        for (let iter = 0; iter < 80; iter++) {
            const { H, gT, gM } = normal(s, k, d);
            const F = factorBordered(H);
            if (!F) break;
            const { xT, xM } = solveBordered(
                F,
                H,
                gT.map(g => -g),
                gM.map(g => -g),
            );
            // Halve the step until the posterior does not get worse, as mipdFit does.
            let t = 1;
            let next: { s: number; k: number; d: number[]; f: number } | null = null;
            while (t > 1e-4) {
                const ns = s + t * xM[0];
                const nk = allowK ? clampLogK(k + t * xM[1]) : 0;
                const nd = d.map((v, a) => v + t * xT[a]);
                const nf = objective(ns, nk, nd);
                if (nf <= f + 1e-12) {
                    next = { s: ns, k: nk, d: nd, f: nf };
                    break;
                }
                t /= 2;
            }
            if (!next) break;
            const moved =
                Math.abs(next.s - s) + Math.abs(next.k - k) + next.d.reduce((acc, v, a) => acc + Math.abs(v - d[a]), 0);
            ({ s, k, d, f } = next);
            if (moved < 1e-9) break;
        }
        return { s, k, d, f };
    };

    // Starts: the population, and for each clearance start the median residual
    // spread over static and drift in the prior's proportions. Robust posteriors
    // can have several modes; the best one wins.
    const zeros = new Array(K).fill(0);
    let best = solveFrom(0, 0, zeros);
    const kStarts = allowK ? field.logK.filter((_, j) => j % 5 === 0) : [0];
    for (const k0 of kStarts) {
        const res = Array.from({ length: count }, (_, i) => logObs[i] - fieldG(field, i, k0)).sort((x, y) => x - y);
        const med = res[Math.floor(count / 2)] ?? 0;
        const cand = solveFrom(
            med * (1 - hyp.share),
            k0,
            zeros.map(() => med * hyp.share),
        );
        if (cand.f < best.f) best = cand;
    }

    const { H } = normal(best.s, best.k, best.d);
    const F = factorBordered(H);
    if (!F || !Number.isFinite(best.f)) return null;

    // Laplace evidence, up to terms shared by every hypothesis: the prior
    // normalisers that differ (σ_s; σ_d and the OU covariance), and the volume
    // of the posterior. The (2π) factors cancel across hypotheses.
    let logZ = -best.f - Math.log(sdS) - 0.5 * F.logDet;
    if (K) logZ -= K * Math.log(sdD) + 0.5 * Q.logDetCov;

    const tWeights = Array.from({ length: count }, (_, i) => {
        if (!robust) return 1;
        const u = residual(i, best.s, best.k, best.d) / sigma[i];
        return (nu + 1) / (nu + u * u);
    });

    return { hyp, s: best.s, k: best.k, d: best.d, anchors, sdD, allowK, H, F, logZ, tWeights };
}

/** Clearance part of the log-correction, as constantFactor applies it. */
export function clearanceShift(field: ClearanceField, k: number, timeH: number): number {
    if (Math.abs(k) < 1e-9) return 0;
    const b = interpolateConcentration_E2(field.baselineSim, timeH);
    if (b === null || b < 1) return 0;
    return fieldLogConcAt(field, k, timeH) - Math.log(b);
}

/** Posterior mean of the log-correction under one fit: amplitude, plus clearance shape when `withShape`. */
export function bayesMean(field: ClearanceField, fit: BayesFit, timeH: number, withShape: boolean): number {
    let mean = fit.s;
    if (fit.anchors.length) {
        const interp = ouInterpolate(timeH, fit.anchors, fit.hyp.tauH);
        interp.idx.forEach((a, j) => (mean += interp.w[j] * fit.d[a]));
    }
    return withShape ? mean + clearanceShift(field, fit.k, timeH) : mean;
}

/** Posterior mean and variance of the log-correction under one fit (see bayesMean). */
export function bayesMoments(
    field: ClearanceField,
    fit: BayesFit,
    timeH: number,
    withShape: boolean,
): [number, number] {
    const K = fit.anchors.length;
    const interp = K ? ouInterpolate(timeH, fit.anchors, fit.hyp.tauH) : null;
    let mean = fit.s;
    const lT = new Array(K).fill(0);
    if (interp) {
        interp.idx.forEach((a, j) => {
            mean += interp.w[j] * fit.d[a];
            lT[a] += interp.w[j];
        });
    }
    const lM = [1];
    if (fit.allowK) lM.push(0);
    if (withShape) {
        mean += clearanceShift(field, fit.k, timeH);
        const b = interpolateConcentration_E2(field.baselineSim, timeH);
        if (fit.allowK && b !== null && b >= 1) lM[1] = fieldLogConcSlopeAt(field, fit.k, timeH);
    }
    // ℓᵀ H⁻¹ ℓ, plus what the drift does between and beyond its anchors.
    const { xT, xM } = solveBordered(fit.F, fit.H, lT, lM);
    let variance = lM.reduce((acc, v, c) => acc + v * xM[c], 0) + lT.reduce((acc, v, a) => acc + v * xT[a], 0);
    if (interp) variance += fit.sdD * fit.sdD * interp.condVar;
    return [mean, Math.max(0, variance)];
}

export interface BayesMixture {
    fits: BayesFit[];
    weights: number[];
}

/** Every hypothesis fit to the first `count` labs, weighted by posterior probability. */
export function bayesMixture(data: BayesData, count: number): BayesMixture {
    const fits: BayesFit[] = [];
    const logPost: number[] = [];
    for (const hyp of bayesHypotheses()) {
        const fit = bayesFit(data, count, hyp);
        if (!fit) continue;
        fits.push(fit);
        logPost.push(Math.log(hyp.prior) + fit.logZ);
    }
    if (!fits.length) return { fits, weights: [] };
    const top = Math.max(...logPost);
    const raw = logPost.map(l => Math.exp(l - top));
    const total = raw.reduce((a, b) => a + b, 0);
    return { fits, weights: raw.map(w => w / total) };
}

/** Mixture mean and variance: Σπ·m and Σπ·(v + m²) − (Σπ·m)². */
export function mixtureMoments(
    field: ClearanceField,
    mix: BayesMixture,
    timeH: number,
    withShape: boolean,
): [number, number] {
    let mean = 0,
        second = 0;
    mix.fits.forEach((fit, h) => {
        const w = mix.weights[h];
        if (w < 1e-12) return;
        const [m, v] = bayesMoments(field, fit, timeH, withShape);
        mean += w * m;
        second += w * (v + m * m);
    });
    return [mean, Math.max(0, second - mean * mean)];
}

/**
 * Remembers recent results by time. The forecast evaluates the same hourly grid
 * once per Monte Carlo run, and each evaluation here walks every hypothesis.
 */
export function memoByTime<T>(fn: (t: number) => T, limit = 20_000): (t: number) => T {
    const cache = new Map<number, T>();
    return (t: number) => {
        const hit = cache.get(t);
        if (hit !== undefined) return hit;
        const value = fn(t);
        if (cache.size >= limit) cache.clear();
        cache.set(t, value);
        return value;
    };
}

/**
 * Full-Bayes calibration. Retrospective mode averages the hypotheses fit to all
 * labs. Forward mode refits on each prefix of the labs and uses prefix i after
 * lab i, with the drift carried forward from that point, so a later lab never
 * rewrites the past.
 */
export function bayesCalibrate(
    field: ClearanceField,
    points: CalibrationPoint[],
    historyMode: CalibrationHistoryMode,
): Omit<CalibrationResult, 'method' | 'n' | 'fitErrPct' | 'points'> {
    const n = points.length;
    const labTimes = points.map(p => p.timeH);
    const sigma = points.map(p => {
        const floor = BAYES_ASSAY_FLOOR_PGML[p.assay ?? 'unknown'];
        const before = interpolateConcentration_E2(field.baselineSim, p.timeH - BAYES_SLOPE_STEP_H);
        const after = interpolateConcentration_E2(field.baselineSim, p.timeH + BAYES_SLOPE_STEP_H);
        const slope =
            before !== null && after !== null && before > 0 && after > 0
                ? (Math.log(after) - Math.log(before)) / (2 * BAYES_SLOPE_STEP_H)
                : 0;
        const variance = CAL_MEAS_SD ** 2 + (floor / p.obs) ** 2 + (BAYES_DRAW_TIME_SD_H * slope) ** 2;
        return Math.min(BAYES_MAX_LAB_SD, Math.sqrt(variance));
    });
    const data: BayesData = { field, logObs: points.map(p => Math.log(p.obs)), sigma, labTimes };

    const full = bayesMixture(data, n);
    let mixAt: (t: number) => BayesMixture | null;
    if (historyMode === 'forward') {
        const prefixes = Array.from({ length: n }, (_, i) => (i === n - 1 ? full : bayesMixture(data, i + 1)));
        mixAt = t => {
            if (t < labTimes[0]) return null;
            let idx = 0;
            for (let i = 0; i < n; i++) {
                if (labTimes[i] <= t) idx = i;
                else break;
            }
            return prefixes[idx];
        };
    } else {
        mixAt = () => full;
    }

    const factorFn = memoByTime((t: number) => {
        const mix = mixAt(t);
        if (!mix) return 1;
        let mean = 0;
        mix.fits.forEach((fit, h) => {
            if (mix.weights[h] >= 1e-12) mean += mix.weights[h] * bayesMean(field, fit, t, true);
        });
        return clampFactor(Math.exp(mean));
    });
    const factorSdFn = memoByTime((t: number) => {
        const mix = mixAt(t);
        return mix ? Math.sqrt(mixtureMoments(field, mix, t, true)[1]) : 0;
    });

    // Reported values describe the fit to every lab, at the latest one.
    const last = labTimes[n - 1];
    const [ampMean] = mixtureMoments(field, full, last, false);
    const [levelMean, levelVar] = mixtureMoments(field, full, last, true);
    const levelSd = Math.sqrt(levelVar);
    const logKMean = full.fits.reduce((acc, fit, h) => acc + full.weights[h] * fit.k, 0);
    const kMul = Math.exp(clampLogK(logKMean));
    const drift: Record<BayesDriftFamily, number> = { none: 0, weeks: 0, months: 0, year: 0 };
    full.fits.forEach((fit, h) => (drift[fit.hyp.family] += full.weights[h]));
    const meanWeight = Array.from({ length: n }, (_, i) =>
        full.fits.reduce((acc, fit, h) => acc + full.weights[h] * fit.tWeights[i], 0),
    );

    return {
        factorFn,
        factorSdFn,
        scale: clampFactor(Math.exp(ampMean)),
        latestInterval: [
            clampFactor(Math.exp(levelMean - Z90 * levelSd)),
            clampFactor(Math.exp(levelMean + Z90 * levelSd)),
        ],
        kMul,
        halfLifeDeltaPct: (1 / kMul - 1) * 100,
        discounted: meanWeight.filter(w => w < BAYES_DISCOUNTED_WEIGHT).length,
        drift,
    };
}

/**
 * Fit the personal E2 calibration to lab results.
 *
 * `method` selects the estimator (off / EKF / OU-Kalman / Hybrid-MIPD — the
 * learning models mirror those on hrt.transmtf.com — or Full Bayes, which
 * averages over drift hypotheses; see `bayesCalibrate`). `historyMode` selects how
 * the result is applied across time: 'forward' is causal (past is never
 * rewritten); 'retrospective' uses all labs to re-estimate the whole history.
 *
 * Lab results measure E2 only, so this never affects CPA/T. The returned factorFn
 * is the time-varying multiplier on the baseline E2 curve, so all downstream
 * consumers keep working unchanged.
 */
