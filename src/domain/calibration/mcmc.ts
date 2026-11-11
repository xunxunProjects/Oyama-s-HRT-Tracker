import type { CalibrationHistoryMode, CalibrationPoint, CalibrationResult } from './types';
import type { DoseEvent, Route, SimulationResult } from '../types';
import {
    CAL_PRIOR_SD_AMP,
    CAL_PRIOR_SD_K,
    CAL_STUDENT_NU,
    KMUL_MAX,
    KMUL_MIN,
    LAB_CLUSTER_H,
    MIN_LABS_FOR_CLEARANCE,
    clampFactor,
    clearanceIdentifiable,
} from './estimators';
import { BAYES_DISCOUNTED_WEIGHT, labLogSd, memoByTime } from './bayes';
import { e2RouteCurves, e2Routes, type RouteCurves } from './routeCurves';

// --- Personal PK (MCMC) --------------------------------------------------------
//
// The other estimators treat a person as the population model times one
// correction. This one gives each person their own pharmacokinetics:
//
//     E2(t) = Σ_r exp(s + u_r) · C_r(t; k, a)
//
// C_r is the model's estradiol from route r alone (injections, oral, sublingual,
// gel, patch), which is exact because the model is linear in dose (see
// routeCurves.ts). s is a personal level shared by every route, u_r how far
// route r runs from that level for this person (the sublingual uptake of
// issue #22 is one of these), k the log personal clearance and a the log
// personal absorption rate, which moves every first-order uptake rate at once
// and so reshapes peaks and troughs rather than the level.
//
// The route terms are hierarchical, u_r ~ N(0, MCMC_ROUTE_SD²): with one route
// the model is MIPD's plus absorption, and with two the labs on each borrow
// strength from the shared s. s keeps Full Bayes's Student-t prior, k MIPD's
// normal one, and a gets its own. Clearance moves once the labs fall in
// MIN_LABS_FOR_CLEARANCE separate clusters, as for the other estimators;
// absorption needs MCMC_MIN_LABS_FOR_ABSORPTION, because it only shows in where
// labs sit within a dose interval. Each lab's SD is Full Bayes's (assay floor,
// draw-time slope), and the likelihood is Gaussian below
// MIN_LABS_FOR_CLEARANCE labs and Student-t from there on.
//
// The posterior has no closed form (the route sum is not log-linear), so it is
// sampled. MCMC_CHAINS chains of adaptive Metropolis (Haario, Saksman &
// Tamminen 2001, Bernoulli 7:223–242) adapt their proposal covariance during
// burn-in only, so the kept draws come from a fixed Markov kernel. Convergence
// is checked with split R-hat (Gelman et al. 2013, Bayesian Data Analysis, 3rd
// ed., §11.4). The random stream is seeded from the data, so the same labs
// always give the same curve.
//
// C_r(t; k, a) is precomputed on a (k, a) grid at the lab times and
// interpolated bilinearly in concentration. The drawn curve uses the same
// interpolation on the grid knots the posterior actually visits, so the curve
// is the posterior mean of exactly the model the draws were scored on.

export const MCMC_K_STEPS = 13;
export const MCMC_ABS_MIN = 0.4;
export const MCMC_ABS_MAX = 2.5;
export const MCMC_ABS_STEPS = 9;
/** Prior SD of a route's log offset from the personal level. A chosen value, about ±40%. */
export const MCMC_ROUTE_SD = 0.35;
/** Prior SD of the log absorption multiplier. A chosen value, about ±50%. */
export const MCMC_ABS_PRIOR_SD = 0.4;
/** Lab clusters needed before the absorption rate may move. */
export const MCMC_MIN_LABS_FOR_ABSORPTION = 4;
export const MCMC_CHAINS = 4;
export const MCMC_BURN_IN = 2500;
export const MCMC_KEEP = 2500;
export const MCMC_THIN = 5;
/** Draws used to build the curve and its band. */
export const MCMC_CURVE_DRAWS = 400;
export const MCMC_SD_DRAWS = 150;
/** Most grid knots the drawn curve evaluates over the whole timeline. */
export const MCMC_MAX_KNOTS = 16;

const LOG_K_MIN = Math.log(KMUL_MIN);
const LOG_K_MAX = Math.log(KMUL_MAX);
const LOG_A_MIN = Math.log(MCMC_ABS_MIN);
const LOG_A_MAX = Math.log(MCMC_ABS_MAX);
const knots = (lo: number, hi: number, steps: number) =>
    Array.from({ length: steps }, (_, j) => (j === (steps - 1) / 2 ? 0 : lo + ((hi - lo) * j) / (steps - 1)));
export const MCMC_LOG_K = knots(LOG_K_MIN, LOG_K_MAX, MCMC_K_STEPS);
export const MCMC_LOG_A = knots(LOG_A_MIN, LOG_A_MAX, MCMC_ABS_STEPS);

// --- Random numbers ------------------------------------------------------------

/** mulberry32: small, fast and good enough for a sampler; seeded so results repeat. */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function gaussian(rand: () => number): () => number {
    let spare: number | null = null;
    return () => {
        if (spare !== null) {
            const v = spare;
            spare = null;
            return v;
        }
        let u = 0;
        while (u <= 1e-300) u = rand();
        const v = rand();
        const r = Math.sqrt(-2 * Math.log(u));
        spare = r * Math.sin(2 * Math.PI * v);
        return r * Math.cos(2 * Math.PI * v);
    };
}

function hashData(xs: number[]): number {
    let h = 2166136261;
    for (const x of xs) {
        const s = x.toPrecision(12);
        for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return h >>> 0;
}

// --- Grid ----------------------------------------------------------------------

/** Per-route E2 at the lab times on every (k, a) knot. */
export interface PkGrid {
    routes: Route[];
    n: number;
    /** conc[(jk * MCMC_ABS_STEPS + ja) * R + r][i] */
    conc: Float64Array[];
}

export function buildPkGrid(
    events: DoseEvent[],
    bodyWeightKG: number,
    birthYear: number | null,
    labTimes: number[],
): PkGrid {
    const routes = e2Routes(events);
    const conc: Float64Array[] = [];
    for (const lk of MCMC_LOG_K) {
        for (const la of MCMC_LOG_A) {
            const rc = e2RouteCurves(events, bodyWeightKG, birthYear, labTimes, Math.exp(lk), Math.exp(la), routes);
            for (const c of rc.conc) conc.push(c);
        }
    }
    return { routes, n: labTimes.length, conc };
}

/** Bracketing knots and weight of `x` on a knot list. */
function bracket(list: number[], x: number): [number, number] {
    const n = list.length;
    if (x <= list[0]) return [0, 0];
    if (x >= list[n - 1]) return [n - 2, 1];
    let j = 1;
    while (j < n - 1 && list[j] < x) j++;
    return [j - 1, (x - list[j - 1]) / (list[j] - list[j - 1])];
}

/** The up to four (knot index, weight) pairs of a bilinear interpolation at (k, a). */
export function corners(k: number, a: number): [number, number][] {
    const [jk, wk] = bracket(MCMC_LOG_K, k);
    const [ja, wa] = bracket(MCMC_LOG_A, a);
    const out: [number, number][] = [];
    const push = (dk: number, da: number, w: number) => {
        if (w > 1e-12) out.push([(jk + dk) * MCMC_ABS_STEPS + ja + da, w]);
    };
    push(0, 0, (1 - wk) * (1 - wa));
    push(1, 0, wk * (1 - wa));
    push(0, 1, (1 - wk) * wa);
    push(1, 1, wk * wa);
    return out;
}

// --- Posterior -----------------------------------------------------------------

interface Layout {
    R: number;
    /** u_r are sampled only when there is more than one route. */
    hasRoutes: boolean;
    kFree: boolean;
    aFree: boolean;
    dim: number;
}

const iU = (r: number) => 1 + r;
const iK = (L: Layout) => 1 + (L.hasRoutes ? L.R : 0);
const iA = (L: Layout) => iK(L) + (L.kFree ? 1 : 0);

function unpack(L: Layout, th: Float64Array | number[]) {
    const s = th[0];
    const amps = Array.from({ length: L.R }, (_, r) => Math.exp(s + (L.hasRoutes ? th[iU(r)] : 0)));
    const k = L.kFree ? th[iK(L)] : 0;
    const a = L.aFree ? th[iA(L)] : 0;
    return { s, amps, k, a };
}

/** Log of the model E2 at lab i for these amplitudes and (k, a). */
function logPredAt(grid: PkGrid, L: Layout, amps: number[], cs: [number, number][], i: number): number {
    let sum = 0;
    for (const [c, w] of cs) {
        const base = c * L.R;
        for (let r = 0; r < L.R; r++) sum += w * amps[r] * grid.conc[base + r][i];
    }
    return Math.log(Math.max(sum, 1e-9));
}

interface Data {
    grid: PkGrid;
    logObs: number[];
    sigma: number[];
    labTimes: number[];
}

function labClusters(labTimes: number[], count: number): number {
    let clusters = 0;
    let anchor = -Infinity;
    for (let i = 0; i < count; i++) {
        if (labTimes[i] - anchor > LAB_CLUSTER_H) {
            clusters++;
            anchor = labTimes[i];
        }
    }
    return clusters;
}

function logPosterior(data: Data, L: Layout, count: number, robust: boolean, th: Float64Array): number {
    const { s, amps, k, a } = unpack(L, th);
    if (k < LOG_K_MIN || k > LOG_K_MAX || a < LOG_A_MIN || a > LOG_A_MAX) return -Infinity;
    const nu = CAL_STUDENT_NU;
    let lp = (-(nu + 1) / 2) * Math.log(1 + (s / CAL_PRIOR_SD_AMP) ** 2 / nu);
    if (L.hasRoutes) for (let r = 0; r < L.R; r++) lp -= 0.5 * (th[iU(r)] / MCMC_ROUTE_SD) ** 2;
    if (L.kFree) lp -= 0.5 * (k / CAL_PRIOR_SD_K) ** 2;
    if (L.aFree) lp -= 0.5 * (a / MCMC_ABS_PRIOR_SD) ** 2;
    const cs = corners(k, a);
    for (let i = 0; i < count; i++) {
        const z = (data.logObs[i] - logPredAt(data.grid, L, amps, cs, i)) / data.sigma[i];
        lp += robust ? (-(nu + 1) / 2) * Math.log(1 + (z * z) / nu) : -0.5 * z * z;
    }
    return lp;
}

/** Lower Cholesky factor of a small symmetric positive definite matrix (row-major). */
function cholesky(m: number[], d: number): number[] | null {
    const l = new Array(d * d).fill(0);
    for (let i = 0; i < d; i++) {
        for (let j = 0; j <= i; j++) {
            let sum = m[i * d + j];
            for (let p = 0; p < j; p++) sum -= l[i * d + p] * l[j * d + p];
            if (i === j) {
                if (sum <= 0) return null;
                l[i * d + i] = Math.sqrt(sum);
            } else l[i * d + j] = sum / l[j * d + j];
        }
    }
    return l;
}

/** Split R-hat for each parameter over all chains (each chain halved). */
export function splitRHat(chains: Float64Array[][], dim: number): number {
    let worst = 1;
    for (let p = 0; p < dim; p++) {
        const halves: number[][] = [];
        for (const chain of chains) {
            const half = Math.floor(chain.length / 2);
            halves.push(chain.slice(0, half).map(x => x[p]));
            halves.push(chain.slice(half, 2 * half).map(x => x[p]));
        }
        const m = halves.length;
        const n = halves[0].length;
        if (n < 2) continue;
        const means = halves.map(h => h.reduce((a, b) => a + b, 0) / n);
        const grand = means.reduce((a, b) => a + b, 0) / m;
        const B = (n / (m - 1)) * means.reduce((acc, x) => acc + (x - grand) ** 2, 0);
        const W = halves.reduce((acc, h, j) => acc + h.reduce((a2, x) => a2 + (x - means[j]) ** 2, 0) / (n - 1), 0) / m;
        if (W < 1e-14) continue;
        const varHat = ((n - 1) / n) * W + B / n;
        worst = Math.max(worst, Math.sqrt(varHat / W));
    }
    return worst;
}

export interface McmcFit {
    layout: Layout;
    /** Kept draws, every chain, in order. */
    draws: Float64Array[];
    rHat: number;
    acceptance: number;
    /** Posterior-mean Student-t weight per lab (1 everywhere for a Gaussian likelihood). */
    tWeights: number[];
}

export function mcmcFit(data: Data, count: number): McmcFit {
    const R = data.grid.routes.length;
    const hasRoutes = R > 1;
    const kFree = clearanceIdentifiable(data.labTimes, count);
    const aFree = labClusters(data.labTimes, count) >= MCMC_MIN_LABS_FOR_ABSORPTION;
    const dim = 1 + (hasRoutes ? R : 0) + (kFree ? 1 : 0) + (aFree ? 1 : 0);
    const L: Layout = { R, hasRoutes, kFree, aFree, dim };
    const robust = count >= MIN_LABS_FOR_CLEARANCE;
    const target = (th: Float64Array) => logPosterior(data, L, count, robust, th);

    const rand = seededRandom(hashData([count, ...data.logObs.slice(0, count), ...data.labTimes.slice(0, count)]));
    const normal = gaussian(rand);

    // A crude centre for the chains: the geometric mean ratio of the labs to the
    // unscaled model at (k, a) = (0, 0).
    const ones = Array.from({ length: R }, () => 1);
    const cs0 = corners(0, 0);
    let centre = 0;
    for (let i = 0; i < count; i++) centre += data.logObs[i] - logPredAt(data.grid, L, ones, cs0, i);
    centre /= Math.max(1, count);

    const chains: Float64Array[][] = [];
    let accepted = 0;
    let proposed = 0;
    for (let c = 0; c < MCMC_CHAINS; c++) {
        let x = new Float64Array(dim);
        x[0] = centre + 0.3 * normal();
        for (let p = 1; p < dim; p++) x[p] = 0.15 * normal();
        let lx = target(x);
        if (!Number.isFinite(lx)) {
            x = new Float64Array(dim);
            x[0] = centre;
            lx = target(x);
        }

        // Proposal: N(x, λ·Σ). Σ starts diagonal and, during burn-in, is
        // replaced by the chain's own covariance (Haario et al.); λ is tuned
        // towards the 0.234 acceptance rate of Roberts, Gelman & Gilks 1997.
        let chol: number[] = [];
        for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) chol.push(i === j ? 0.1 : 0);
        let logLambda = 0;
        const mean = new Float64Array(dim);
        const cov = new Float64Array(dim * dim);
        let seen = 0;
        const kept: Float64Array[] = [];
        let windowAcc = 0;

        for (let it = 0; it < MCMC_BURN_IN + MCMC_KEEP; it++) {
            const z = Array.from({ length: dim }, () => normal());
            const y = new Float64Array(dim);
            const lam = Math.exp(logLambda);
            for (let i = 0; i < dim; i++) {
                let step = 0;
                for (let j = 0; j <= i; j++) step += chol[i * dim + j] * z[j];
                y[i] = x[i] + lam * step;
            }
            const ly = target(y);
            const ok = Number.isFinite(ly) && Math.log(rand()) < ly - lx;
            if (ok) {
                x = y;
                lx = ly;
            }
            if (it < MCMC_BURN_IN) {
                windowAcc += ok ? 1 : 0;
                // Running mean and covariance (Welford) of the burn-in path.
                seen++;
                const delta = Array.from(x, (v, i) => v - mean[i]);
                for (let i = 0; i < dim; i++) mean[i] += delta[i] / seen;
                for (let i = 0; i < dim; i++)
                    for (let j = 0; j < dim; j++) cov[i * dim + j] += delta[i] * (x[j] - mean[j]);
                if ((it + 1) % 100 === 0) {
                    logLambda += windowAcc / 100 > 0.234 ? 0.2 : -0.2;
                    windowAcc = 0;
                    if (seen > 400) {
                        const scaled = Array.from(cov, (v, idx) => {
                            const i = Math.floor(idx / dim);
                            const j = idx % dim;
                            return ((2.38 * 2.38) / dim) * (v / (seen - 1)) + (i === j ? 1e-6 : 0);
                        });
                        const l = cholesky(scaled, dim);
                        if (l) chol = l;
                    }
                }
            } else {
                proposed++;
                if (ok) accepted++;
                if ((it - MCMC_BURN_IN) % MCMC_THIN === 0) kept.push(Float64Array.from(x));
            }
        }
        chains.push(kept);
    }

    const draws = chains.flat();
    const tWeights = Array.from({ length: count }, () => 0);
    if (robust) {
        const nu = CAL_STUDENT_NU;
        for (const th of draws) {
            const { amps, k, a } = unpack(L, th);
            const cs = corners(k, a);
            for (let i = 0; i < count; i++) {
                const z = (data.logObs[i] - logPredAt(data.grid, L, amps, cs, i)) / data.sigma[i];
                tWeights[i] += (nu + 1) / (nu + z * z) / draws.length;
            }
        }
    } else tWeights.fill(1);

    return {
        layout: L,
        draws,
        rHat: splitRHat(chains, dim),
        acceptance: proposed ? accepted / proposed : 0,
        tWeights,
    };
}

// --- Curve ---------------------------------------------------------------------

const quantile = (sorted: number[], q: number) => {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

const every = <T>(xs: T[], n: number): T[] => {
    if (xs.length <= n) return xs;
    const step = xs.length / n;
    return Array.from({ length: n }, (_, i) => xs[Math.floor(i * step)]);
};

/** A draw reduced to what the curve needs: amplitudes and interpolation corners. */
interface CurveDraw {
    amps: number[];
    cs: [number, number][];
}

export function mcmcCalibrate(
    baselineSim: SimulationResult,
    events: DoseEvent[],
    bodyWeightKG: number,
    birthYear: number | null,
    points: CalibrationPoint[],
    historyMode: CalibrationHistoryMode,
): Omit<CalibrationResult, 'method' | 'n' | 'fitErrPct' | 'points'> {
    const n = points.length;
    const labTimes = points.map(p => p.timeH);
    const grid = buildPkGrid(events, bodyWeightKG, birthYear, labTimes);
    const R = grid.routes.length;
    const data: Data = {
        grid,
        logObs: points.map(p => Math.log(p.obs)),
        sigma: points.map(p => labLogSd(baselineSim, p)),
        labTimes,
    };

    const full = mcmcFit(data, n);
    const fits =
        historyMode === 'forward' ? labTimes.map((_, i) => (i === n - 1 ? full : mcmcFit(data, i + 1))) : [full];

    // Draws for the curve, and the knots they touch.
    const curveDraws = fits.map(fit =>
        every(fit.draws, MCMC_CURVE_DRAWS).map(th => {
            const { amps, k, a } = unpack(fit.layout, th);
            return { amps, cs: corners(k, a) };
        }),
    );
    const mass = new Map<number, number>();
    for (const list of curveDraws)
        for (const d of list) for (const [c, w] of d.cs) mass.set(c, (mass.get(c) ?? 0) + w / list.length);
    const keptKnots = [...mass.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MCMC_MAX_KNOTS)
        .map(([c]) => c);
    const keptSet = new Set(keptKnots);
    const knotCoords = (c: number) => [Math.floor(c / MCMC_ABS_STEPS), c % MCMC_ABS_STEPS];
    // A draw whose corners fall outside the kept knots moves its weight onto the
    // kept ones it does touch, or else onto the nearest kept knot.
    const restrict = (d: CurveDraw): CurveDraw => {
        const inside = d.cs.filter(([c]) => keptSet.has(c));
        const total = inside.reduce((acc, [, w]) => acc + w, 0);
        if (total > 1e-9) return { amps: d.amps, cs: inside.map(([c, w]) => [c, w / total]) };
        const [main] = d.cs.reduce((best, x) => (x[1] > best[1] ? x : best));
        const [mk, ma] = knotCoords(main);
        const nearest = keptKnots.reduce((best, c) => {
            const [ck, ca] = knotCoords(c);
            const [bk, ba] = knotCoords(best);
            return (ck - mk) ** 2 + (ca - ma) ** 2 < (bk - mk) ** 2 + (ba - ma) ** 2 ? c : best;
        });
        return { amps: d.amps, cs: [[nearest, 1]] };
    };
    const segDraws = curveDraws.map(list => list.map(restrict));

    const times = baselineSim.timeH;
    const knotCurves = new Map<number, RouteCurves>();
    for (const c of keptKnots) {
        const [jk, ja] = knotCoords(c);
        knotCurves.set(
            c,
            e2RouteCurves(
                events,
                bodyWeightKG,
                birthYear,
                times,
                Math.exp(MCMC_LOG_K[jk]),
                Math.exp(MCMC_LOG_A[ja]),
                grid.routes,
            ),
        );
    }

    // Per segment, the posterior mean is linear in the knot curves:
    // Σ_c Σ_r coef[c][r] · C_{c,r}(t).
    const coefs = segDraws.map(list => {
        const coef = new Map<number, number[]>();
        for (const d of list) {
            for (const [c, w] of d.cs) {
                const row = coef.get(c) ?? new Array(R).fill(0);
                for (let r = 0; r < R; r++) row[r] += (w * d.amps[r]) / list.length;
                coef.set(c, row);
            }
        }
        return coef;
    });

    // Index and weight of t on the baseline time grid.
    const locate = (t: number): [number, number] | null => {
        if (!times.length || t < times[0] || t > times[times.length - 1]) return null;
        let lo = 0;
        let hi = times.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (times[mid] <= t) lo = mid;
            else hi = mid;
        }
        const span = times[hi] - times[lo];
        return [lo, span > 0 ? (t - times[lo]) / span : 0];
    };
    const at = (arr: ArrayLike<number>, pos: [number, number]) =>
        pos[1] === 0 ? arr[pos[0]] : arr[pos[0]] * (1 - pos[1]) + arr[pos[0] + 1] * pos[1];
    const baselineAt = (pos: [number, number]) => at(baselineSim.concPGmL_E2, pos);
    const drawValue = (d: CurveDraw, pos: [number, number]) => {
        let sum = 0;
        for (const [c, w] of d.cs) {
            const curves = knotCurves.get(c)!;
            for (let r = 0; r < R; r++) sum += w * d.amps[r] * at(curves.conc[r], pos);
        }
        return sum;
    };

    const segmentAt = (t: number): number => {
        if (historyMode !== 'forward') return 0;
        if (t < labTimes[0]) return -1;
        let idx = 0;
        for (let i = 0; i < n; i++) {
            if (labTimes[i] <= t) idx = i;
            else break;
        }
        return idx;
    };
    const levelOnly = segDraws.map(list => {
        const mean = list.reduce((acc, d) => acc + Math.log(d.amps.reduce((x, y) => x + y, 0) / R), 0);
        return Math.exp(mean / list.length);
    });

    const factorFn = memoByTime((t: number) => {
        const seg = segmentAt(t);
        if (seg < 0) return 1;
        const pos = locate(t);
        const b = pos ? baselineAt(pos) : 0;
        if (!pos || b < 1) return clampFactor(levelOnly[seg]);
        let mean = 0;
        for (const [c, row] of coefs[seg]) {
            const curves = knotCurves.get(c)!;
            for (let r = 0; r < R; r++) mean += row[r] * at(curves.conc[r], pos);
        }
        return clampFactor(mean / b);
    });
    const sdDraws = segDraws.map(list => every(list, MCMC_SD_DRAWS));
    const factorSdFn = memoByTime((t: number) => {
        const seg = segmentAt(t);
        if (seg < 0) return 0;
        const pos = locate(t);
        const b = pos ? baselineAt(pos) : 0;
        const logs = sdDraws[seg].map(d =>
            !pos || b < 1
                ? Math.log(d.amps.reduce((x, y) => x + y, 0) / R)
                : Math.log(Math.max(drawValue(d, pos), 1e-9) / b),
        );
        const m = logs.reduce((a, x) => a + x, 0) / logs.length;
        return Math.sqrt(logs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, logs.length - 1));
    });

    // Reported values describe the fit to every lab, at the latest one.
    const L = full.layout;
    const last = n - 1;
    const levels: number[] = [];
    const amplitudes: number[] = [];
    let kSum = 0;
    let aSum = 0;
    const routeLog = new Array(R).fill(0);
    const baseLast = Math.exp(
        logPredAt(
            grid,
            L,
            Array.from({ length: R }, () => 1),
            corners(0, 0),
            last,
        ),
    );
    for (const th of full.draws) {
        const { amps, k, a } = unpack(L, th);
        const cs = corners(k, a);
        const pred = Math.exp(logPredAt(grid, L, amps, cs, last));
        const shape = Math.exp(
            logPredAt(
                grid,
                L,
                Array.from({ length: R }, () => 1),
                cs,
                last,
            ),
        );
        levels.push(pred / baseLast);
        amplitudes.push(Math.log(pred / shape));
        kSum += k;
        aSum += a;
        for (let r = 0; r < R; r++) routeLog[r] += Math.log(amps[r]);
    }
    const D = full.draws.length;
    levels.sort((x, y) => x - y);
    const kMul = Math.exp(kSum / D);
    const absMul = Math.exp(aSum / D);
    const routeScales: Partial<Record<Route, number>> = {};
    if (L.hasRoutes) grid.routes.forEach((r, i) => (routeScales[r] = clampFactor(Math.exp(routeLog[i] / D))));

    return {
        factorFn,
        factorSdFn,
        scale: clampFactor(Math.exp(amplitudes.reduce((a, x) => a + x, 0) / D)),
        latestInterval: [clampFactor(quantile(levels, 0.05)), clampFactor(quantile(levels, 0.95))],
        kMul,
        halfLifeDeltaPct: (1 / kMul - 1) * 100,
        absMul,
        routeScales: L.hasRoutes ? routeScales : undefined,
        discounted: full.tWeights.filter(w => w < BAYES_DISCOUNTED_WEIGHT).length,
        rHat: full.rHat,
    };
}
