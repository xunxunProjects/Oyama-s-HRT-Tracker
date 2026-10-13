/**
 * An independent port of the estradiol part of the upstream PKcore model, used
 * only as a cross-check for logic.ts.
 *
 * Source: https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test
 * at commit 6136f4822c83334f22e8971f37321bdaabe2735c (2026-07-14):
 *   - HRT-Recorder/PlasmaConcentration/PKcore.swift  (ParameterResolver,
 *     ThreeCompartmentModel, PrecomputedEventModel)
 *   - PKSharedCatalog.json                           (parameter values)
 *
 * Upstream records every dose as an active-equivalent amount (mg of E2), while
 * logic.ts records the ester amount and folds the molecular-weight factor into
 * F. The two agree when the upstream dose is `esterMG * toE2Factor`, which is
 * what `upstreamE2Amount` expects its caller to pass.
 *
 * Only what upstream and logic.ts share is ported: injections of EB/EV/EC/EN,
 * oral E2/EV, sublingual E2/EV and patches. Upstream models gel (area based),
 * estradiol undecylate and every testosterone route differently or not at all,
 * so those have no reference here.
 */

export type UpstreamRoute = 'injection' | 'oral' | 'sublingual' | 'patchApply';
export type UpstreamCompound = 'E2' | 'EB' | 'EV' | 'EC' | 'EN';

const CORE = { kClear: 0.41, kClearInjection: 0.041, depotK1Corr: 1.0, patchFallbackK1: 0.0075 };

const TWO_PART_DEPOT: Record<string, { fracFast: number; k1Fast: number; k1Slow: number }> = {
    EB: { fracFast: 0.9, k1Fast: 0.144, k1Slow: 0.114 },
    EV: { fracFast: 0.4, k1Fast: 0.0216, k1Slow: 0.0138 },
    EC: { fracFast: 0.229164549, k1Fast: 0.005035046, k1Slow: 0.004510574 },
    EN: { fracFast: 0.05, k1Fast: 0.001, k1Slow: 0.005 },
};

const FORMATION_FRACTION: Record<string, number> = {
    EB: 0.10922376473734707,
    EV: 0.062258288229969413,
    EC: 0.117255838,
    EN: 0.12,
};

const HYDROLYSIS_K2: Record<string, number> = { EB: 0.09, EV: 0.07, EC: 0.045, EN: 0.015 };

const ORAL_KABS: Record<string, number> = { E2: 0.32, EV: 0.05 };
const ORAL_F: Record<string, number> = { E2: 0.03, EV: 0.03 };
const KABS_SL = 1.8;
const SL_THETA = [0.01, 0.04, 0.11, 0.18]; // quick, casual, standard, strict

function bateman(doseMG: number, F: number, ka: number, ke: number, t: number): number {
    if (!(t >= 0) || doseMG <= 0 || ka <= 0) return 0;
    if (Math.abs(ka - ke) < 1e-9) return doseMG * F * ka * t * Math.exp(-ke * t);
    return ((doseMG * F * ka) / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
}

function analytic3CRepeated(
    tau: number,
    scaledDose: number,
    k1: number,
    k2: number,
    k3: number,
    tol: number,
): number | null {
    const e12 = Math.abs(k1 - k2) < tol;
    const e13 = Math.abs(k1 - k3) < tol;
    const e23 = Math.abs(k2 - k3) < tol;
    if (e12 && e13) return scaledDose * k1 * k1 * tau * tau * 0.5 * Math.exp(-k1 * tau);
    if (e23) {
        const d = k1 - k2;
        if (Math.abs(d) < tol) return null;
        return (scaledDose * k1 * k2 * (Math.exp(-k1 * tau) + Math.exp(-k2 * tau) * (d * tau - 1))) / (d * d);
    }
    if (e12) {
        const d = k1 - k3;
        if (Math.abs(d) < tol) return null;
        return (scaledDose * k1 * k1 * (Math.exp(-k3 * tau) - Math.exp(-k1 * tau) * (1 + d * tau))) / (d * d);
    }
    if (e13) {
        const d = k2 - k1;
        if (Math.abs(d) < tol) return null;
        return (scaledDose * k1 * k2 * (Math.exp(-k2 * tau) + Math.exp(-k1 * tau) * (d * tau - 1))) / (d * d);
    }
    return null;
}

/** Upstream `_analytic3C`, including its exact repeated-rate branches. */
export function upstreamAnalytic3C(tau: number, doseMG: number, F: number, k1: number, k2: number, k3: number): number {
    if (!(tau >= 0) || k1 <= 0 || k2 <= 0 || k3 <= 0 || doseMG <= 0 || F <= 0) return 0;
    const repeated = analytic3CRepeated(tau, doseMG * F, k1, k2, k3, 1e-9);
    if (repeated !== null) return repeated;
    const k1k2 = k1 - k2,
        k1k3 = k1 - k3,
        k2k3 = k2 - k3;
    const term1 = Math.exp(-k1 * tau) / (k1k2 * k1k3);
    const term2 = Math.exp(-k2 * tau) / (-k1k2 * k2k3);
    const term3 = Math.exp(-k3 * tau) / (k1k3 * k2k3);
    return doseMG * F * k1 * k2 * (term1 + term2 + term3);
}

export interface UpstreamDose {
    route: UpstreamRoute;
    compound: UpstreamCompound;
    /** Active-equivalent dose in mg of E2 (upstream's convention). */
    doseE2MG: number;
    timeH: number;
    /** Sublingual tier code 0..3. */
    tier?: number;
    /** Patch release in µg/day (zero-order); omit for the first-order fallback. */
    releaseUGPerDay?: number;
    /** Hours the patch stays on. */
    wearH?: number;
}

/** Central-compartment E2 amount (mg) contributed by one dose at `timeH`. */
export function upstreamE2Amount(d: UpstreamDose, timeH: number): number {
    const tau = timeH - d.timeH;
    if (tau < 0) return 0;
    switch (d.route) {
        case 'injection': {
            const depot = TWO_PART_DEPOT[d.compound];
            const F = FORMATION_FRACTION[d.compound];
            const k2 = HYDROLYSIS_K2[d.compound] ?? 0;
            const k3 = CORE.kClearInjection;
            return (
                upstreamAnalytic3C(tau, d.doseE2MG * depot.fracFast, F, depot.k1Fast * CORE.depotK1Corr, k2, k3) +
                upstreamAnalytic3C(tau, d.doseE2MG * (1 - depot.fracFast), F, depot.k1Slow * CORE.depotK1Corr, k2, k3)
            );
        }
        case 'oral':
            // Upstream also stores k2 for oral EV, but the oral path is one-compartment
            // Bateman and never reads it.
            return bateman(d.doseE2MG, ORAL_F[d.compound], ORAL_KABS[d.compound], CORE.kClear, tau);
        case 'sublingual': {
            const theta = SL_THETA[d.tier ?? 2] ?? 0.11;
            const doseF = d.doseE2MG * theta;
            const doseS = d.doseE2MG * (1 - theta);
            const k1Slow = ORAL_KABS[d.compound];
            const FSlow = ORAL_F[d.compound];
            const slow = bateman(doseS, FSlow, k1Slow, CORE.kClear, tau);
            if (d.compound === 'EV') {
                return upstreamAnalytic3C(tau, doseF, 1.0, KABS_SL, HYDROLYSIS_K2.EV, CORE.kClear) + slow;
            }
            return bateman(doseF, 1.0, KABS_SL, CORE.kClear, tau) + slow;
        }
        case 'patchApply': {
            const wearH = d.wearH ?? Number.MAX_VALUE;
            const k3 = CORE.kClear;
            if (d.releaseUGPerDay !== undefined) {
                const rate = d.releaseUGPerDay / 24_000; // patchReleaseScale is 1.0 for E2
                if (tau <= wearH) return (rate / k3) * (1 - Math.exp(-k3 * tau));
                return (rate / k3) * (1 - Math.exp(-k3 * wearH)) * Math.exp(-k3 * (tau - wearH));
            }
            const under = bateman(d.doseE2MG, 1.0, CORE.patchFallbackK1, k3, Math.min(tau, wearH));
            return tau > wearH ? under * Math.exp(-k3 * (tau - wearH)) : under;
        }
    }
}
