import { Ester, ExtraKey, GEL_SITE_ORDER, Route } from './types';
import type { DoseEvent, GelSite, PKParams } from './types';
import {
    CorePK,
    EsterPK,
    OralPK,
    SL_TIER_ORDER,
    T_DepotPK,
    T_EsterPK,
    T_GelPK,
    T_PatchPK,
    TwoPartDepotPK,
    getToE2Factor,
    isTestosteroneEster,
} from './constants';
import { _activePKParams } from './shared/activeParams';
import { ageClearanceMultiplier } from './features/popPK';
import { _getE2InjFF } from './transfem/e2-injection';
import { _getGelBio } from './transfem/e2-gel';
import { _getSLTheta } from './transfem/e2-sublingual';
import { CPA_ORAL, CPA_ORAL_F } from './transfem/cpa-oral';
import { BICALUTAMIDE_ORAL, BICALUTAMIDE_ORAL_F } from './transfem/bica-oral';
import { _getTGelBio } from './transmasc/t-gel';
import { _getTInjFF } from './transmasc/t-injection';

export function getBioavailabilityMultiplier(
    route: Route,
    ester: Ester,
    extras: Partial<Record<ExtraKey, number>> = {},
): number {
    const mwFactor = getToE2Factor(ester);

    // Cyproterone: what resolveParams uses, by mouth only.
    if (ester === Ester.CPA) return route === Route.oral ? CPA_ORAL_F : 0;

    // Bicalutamide: optional PK submodel (issue #206 §3), oral only.
    if (ester === Ester.BICA) return route === Route.oral ? BICALUTAMIDE_ORAL_F : 0;

    // Transmasculine (testosterone) path
    if (isTestosteroneEster(ester)) {
        switch (route) {
            case Route.injection: {
                if (ester === Ester.T) return 0;
                const formation = _getTInjFF(ester);
                return formation * mwFactor;
            }
            case Route.gel: {
                const siteIdx = Math.min(
                    GEL_SITE_ORDER.length - 1,
                    Math.max(0, Math.round(extras[ExtraKey.gelSite] ?? 0)),
                );
                const siteKey = GEL_SITE_ORDER[siteIdx] as GelSite;
                return _getTGelBio(siteKey) * mwFactor;
            }
            case Route.patchApply:
                return T_PatchPK.F * mwFactor;
            case Route.oral:
                // Oral testosterone undecanoate (self-emulsifying). Other T
                // esters are not given by mouth. Bioavailability is low and
                // variable (label range ~3-7% relative to IM); use the mid-point.
                return ester === Ester.TU ? 0.05 * mwFactor : 0;
            case Route.nasal:
                // Nasal testosterone gel (Natesto): fast absorption, low dose
                // 3x/day. Bioavailability ~6-10% relative to IM.
                return ester === Ester.T ? 0.08 * mwFactor : 0;
            case Route.sc: {
                if (ester === Ester.T) return 0;
                const formationSc = _getTInjFF(ester);
                return formationSc * mwFactor;
            }
            case Route.pellet:
                return 1.0 * mwFactor;
            case Route.patchRemove:
            default:
                return 0;
        }
    }

    switch (route) {
        case Route.injection: {
            const formation = _getE2InjFF(ester);
            return formation * mwFactor;
        }
        case Route.oral:
            return _activePKParams.e2_oral_bio * mwFactor;
        case Route.sublingual: {
            let theta = _activePKParams.e2_sl_standard;
            if (extras[ExtraKey.sublingualTheta] !== undefined) {
                const customTheta = extras[ExtraKey.sublingualTheta];
                if (typeof customTheta === 'number' && Number.isFinite(customTheta)) {
                    theta = Math.min(1, Math.max(0, customTheta));
                }
            } else if (extras[ExtraKey.sublingualTier] !== undefined) {
                const tierIdx = Math.min(
                    SL_TIER_ORDER.length - 1,
                    Math.max(0, Math.round(extras[ExtraKey.sublingualTier]!)),
                );
                const tierKey = SL_TIER_ORDER[tierIdx] || 'standard';
                theta = _getSLTheta(tierKey);
            }
            return (theta + (1 - theta) * _activePKParams.e2_oral_bio) * mwFactor;
        }
        case Route.gel: {
            const siteIdx = Math.min(GEL_SITE_ORDER.length - 1, Math.max(0, Math.round(extras[ExtraKey.gelSite] ?? 0)));
            const siteKey = GEL_SITE_ORDER[siteIdx] as GelSite;
            const bio = _getGelBio(siteKey);
            return bio * mwFactor;
        }
        case Route.patchApply:
            return 1.0 * mwFactor;
        case Route.patchRemove:
        default:
            return 0;
    }
}

export function resolveParams(event: DoseEvent, birthYear: number | null): PKParams {
    const defaultK3 =
        (event.route === Route.injection ? _activePKParams.e2_kClearInj : _activePKParams.e2_kClear) *
        ageClearanceMultiplier('e2', birthYear, event.timeH);
    const toE2 = getToE2Factor(event.ester);
    const extras = event.extras ?? {};

    // Transmasculine (testosterone) path — use the dedicated T PK parameters.
    if (isTestosteroneEster(event.ester)) {
        const tK3 =
            (event.route === Route.injection ? _activePKParams.t_kClearInj : _activePKParams.t_kClear) *
            ageClearanceMultiplier('t', birthYear, event.timeH);
        switch (event.route) {
            case Route.injection: {
                if (event.ester === Ester.T) {
                    // Shouldn't happen (bare T is not injected in practice), return zeroed params.
                    return {
                        Frac_fast: 0,
                        k1_fast: 0,
                        k1_slow: 0,
                        k2: 0,
                        k3: tK3,
                        F: 0,
                        rateMGh: 0,
                        F_fast: 0,
                        F_slow: 0,
                    };
                }
                const Frac_fast = (T_DepotPK.Frac_fast as any)[event.ester] ?? 0.35;
                const k1_fast = (T_DepotPK.k1_fast as any)[event.ester] ?? 0.025;
                const k1_slow = (T_DepotPK.k1_slow as any)[event.ester] ?? 0.005;
                const k2 = (T_EsterPK.k2 as any)[event.ester] ?? 0.2;
                const F = getBioavailabilityMultiplier(Route.injection, event.ester, extras);
                return { Frac_fast, k1_fast, k1_slow, k2, k3: tK3, F, rateMGh: 0, F_fast: F, F_slow: F };
            }
            case Route.gel: {
                const F = getBioavailabilityMultiplier(Route.gel, event.ester, extras);
                return {
                    Frac_fast: 1.0,
                    k1_fast: T_GelPK.k1,
                    k1_slow: 0,
                    k2: 0,
                    k3: tK3,
                    F,
                    rateMGh: 0,
                    F_fast: F,
                    F_slow: F,
                };
            }
            case Route.patchApply: {
                const F = getBioavailabilityMultiplier(Route.patchApply, event.ester, extras);
                const releaseRateUGPerDay = extras[ExtraKey.releaseRateUGPerDay];
                const rateMGh =
                    typeof releaseRateUGPerDay === 'number' &&
                    Number.isFinite(releaseRateUGPerDay) &&
                    releaseRateUGPerDay > 0
                        ? (releaseRateUGPerDay / 24 / 1000) * F
                        : 0;
                if (rateMGh > 0) {
                    return { Frac_fast: 1.0, k1_fast: 0, k1_slow: 0, k2: 0, k3: tK3, F, rateMGh, F_fast: F, F_slow: F };
                }
                return {
                    Frac_fast: 1.0,
                    k1_fast: T_PatchPK.k1,
                    k1_slow: 0,
                    k2: 0,
                    k3: tK3,
                    F,
                    rateMGh: 0,
                    F_fast: F,
                    F_slow: F,
                };
            }
            case Route.patchRemove:
                return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3: tK3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
            case Route.oral:
                if (event.ester !== Ester.TU) {
                    return {
                        Frac_fast: 0,
                        k1_fast: 0,
                        k1_slow: 0,
                        k2: 0,
                        k3: tK3,
                        F: 0,
                        rateMGh: 0,
                        F_fast: 0,
                        F_slow: 0,
                    };
                }
                {
                    const F = getBioavailabilityMultiplier(Route.oral, event.ester, extras);
                    return {
                        Frac_fast: 1.0,
                        k1_fast: 0.4,
                        k1_slow: 0,
                        k2: 0,
                        k3: tK3,
                        F,
                        rateMGh: 0,
                        F_fast: F,
                        F_slow: F,
                    };
                }
            case Route.nasal:
                if (event.ester !== Ester.T) {
                    return {
                        Frac_fast: 0,
                        k1_fast: 0,
                        k1_slow: 0,
                        k2: 0,
                        k3: tK3,
                        F: 0,
                        rateMGh: 0,
                        F_fast: 0,
                        F_slow: 0,
                    };
                }
                {
                    const F = getBioavailabilityMultiplier(Route.nasal, event.ester, extras);
                    return {
                        Frac_fast: 1.0,
                        k1_fast: 2.0,
                        k1_slow: 0,
                        k2: 0,
                        k3: tK3,
                        F,
                        rateMGh: 0,
                        F_fast: F,
                        F_slow: F,
                    };
                }
            case Route.sc: {
                if (event.ester === Ester.T) {
                    return {
                        Frac_fast: 0,
                        k1_fast: 0,
                        k1_slow: 0,
                        k2: 0,
                        k3: tK3,
                        F: 0,
                        rateMGh: 0,
                        F_fast: 0,
                        F_slow: 0,
                    };
                }
                const Frac_fastSc = (T_DepotPK.Frac_fast as any)[event.ester] ?? 0.35;
                const k1_fastSc = ((T_DepotPK.k1_fast as any)[event.ester] ?? 0.025) * 0.5;
                const k1_slowSc = ((T_DepotPK.k1_slow as any)[event.ester] ?? 0.005) * 0.5;
                const k2Sc = (T_EsterPK.k2 as any)[event.ester] ?? 0.2;
                const FSc = getBioavailabilityMultiplier(Route.sc, event.ester, extras);
                return {
                    Frac_fast: Frac_fastSc,
                    k1_fast: k1_fastSc,
                    k1_slow: k1_slowSc,
                    k2: k2Sc,
                    k3: tK3,
                    F: FSc,
                    rateMGh: 0,
                    F_fast: FSc,
                    F_slow: FSc,
                };
            }
            case Route.pellet: {
                const FP = getBioavailabilityMultiplier(Route.pellet, event.ester, extras);
                const releaseRateUGPerDayP = extras[ExtraKey.releaseRateUGPerDay];
                const rateMGhP =
                    typeof releaseRateUGPerDayP === 'number' &&
                    Number.isFinite(releaseRateUGPerDayP) &&
                    releaseRateUGPerDayP > 0
                        ? (releaseRateUGPerDayP / 24 / 1000) * FP
                        : 0.05 * FP; // default slow release
                if (rateMGhP > 0) {
                    return {
                        Frac_fast: 1.0,
                        k1_fast: 0,
                        k1_slow: 0,
                        k2: 0,
                        k3: tK3,
                        F: FP,
                        rateMGh: rateMGhP,
                        F_fast: FP,
                        F_slow: FP,
                    };
                }
                return {
                    Frac_fast: 1.0,
                    k1_fast: 0.001,
                    k1_slow: 0,
                    k2: 0,
                    k3: tK3,
                    F: FP,
                    rateMGh: 0,
                    F_fast: FP,
                    F_slow: FP,
                };
            }
            default:
                // Oral / sublingual T not supported in this MVP — fall through to zeroed params.
                return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3: tK3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
        }
    }

    // Cyproterone is modelled by mouth only. Any other route (it can only arrive
    // by import) used to fall through to the estradiol parameters below.
    if (event.ester === Ester.CPA && event.route !== Route.oral) {
        return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3: defaultK3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
    }

    // Bicalutamide is modelled by mouth only (issue #206 §3). Any other route
    // (it can only arrive by import) contributes nothing.
    if (event.ester === Ester.BICA && event.route !== Route.oral) {
        return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3: defaultK3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
    }

    switch (event.route) {
        case Route.injection: {
            const Frac_fast = TwoPartDepotPK.Frac_fast[event.ester] ?? 0.5;
            const k1_fast = (TwoPartDepotPK.k1_fast[event.ester] ?? 0.1) * CorePK.depotK1Corr;
            const k1_slow = (TwoPartDepotPK.k1_slow[event.ester] ?? 0.01) * CorePK.depotK1Corr;
            const k2 = EsterPK.k2[event.ester] ?? 0;
            const F = getBioavailabilityMultiplier(Route.injection, event.ester, extras);
            return { Frac_fast, k1_fast, k1_slow, k2, k3: defaultK3, F, rateMGh: 0, F_fast: F, F_slow: F };
        }

        case Route.sublingual: {
            let theta = _activePKParams.e2_sl_standard;
            if (extras[ExtraKey.sublingualTheta] !== undefined) {
                const customTheta = extras[ExtraKey.sublingualTheta];
                if (typeof customTheta === 'number' && Number.isFinite(customTheta)) {
                    theta = Math.min(1, Math.max(0, customTheta));
                }
            } else if (extras[ExtraKey.sublingualTier] !== undefined) {
                const tierRaw = extras[ExtraKey.sublingualTier];
                if (typeof tierRaw === 'number' && Number.isFinite(tierRaw)) {
                    const tierIdx = Math.min(SL_TIER_ORDER.length - 1, Math.max(0, Math.round(tierRaw)));
                    const tierKey = SL_TIER_ORDER[tierIdx] || 'standard';
                    theta = _getSLTheta(tierKey);
                }
            }
            // The swallowed share takes exactly the oral route's path, so θ = 0
            // is the oral curve.
            const k1_fast = OralPK.kAbsSL;
            const k1_slow = event.ester === Ester.EV ? OralPK.kAbsEV : OralPK.kAbsE2;
            const k2 = EsterPK.k2[event.ester] ?? 0;
            const k2_slow = event.ester === Ester.EV ? 0 : OralPK.kE1Pool;
            const F_fast = toE2;
            const F_slow = _activePKParams.e2_oral_bio * toE2;
            const F = theta * F_fast + (1 - theta) * F_slow;
            return { Frac_fast: theta, k1_fast, k1_slow, k2, k2_slow, k3: defaultK3, F, rateMGh: 0, F_fast, F_slow };
        }

        case Route.gel: {
            const F = getBioavailabilityMultiplier(Route.gel, event.ester, extras);
            // Under flip-flop kinetics (k1 << k3), the terminal decline is absorption-
            // limited, so k1 is set from the reported apparent elimination half-life of
            // transdermal E2 gel: k1 = ln(2)/36 ≈ 0.0193 h⁻¹.
            //
            // 36 h is EstroGel's, not Divigel's, which this comment previously
            // misattributed: "The apparent terminal exponential half-life for estradiol
            // was about 36 hours following administration of 1.25 g EstroGel"
            // (NDA 021166) versus "about 10 hours following administration of Divigel"
            // (NDA 022038). The two labels genuinely disagree, confounded by product,
            // formulation and site (arm vs thigh), so 36 h is a choice between them
            // rather than a consensus figure.
            //
            // k1 does not affect exposure either way: it cancels out of the kernel's
            // time-integral, so AUC = F·D/k3 regardless, and k1 sets only Tmax and the
            // peak-to-trough shape. Worth revisiting on its own evidence — the model's
            // gel Cmax runs low against both labels (predicted ~31 vs EstroGel's 46.4,
            // ~41 vs Divigel's 51.5) — but that is a k1 problem, not an F problem.
            const k1 = 0.0193;
            return {
                Frac_fast: 1.0,
                k1_fast: k1,
                k1_slow: 0,
                k2: 0,
                k3: defaultK3,
                F,
                rateMGh: 0,
                F_fast: F,
                F_slow: F,
            };
        }

        case Route.patchApply: {
            const F = getBioavailabilityMultiplier(Route.patchApply, event.ester, extras);
            const releaseRateUGPerDay = extras[ExtraKey.releaseRateUGPerDay];
            const rateMGh =
                typeof releaseRateUGPerDay === 'number' &&
                Number.isFinite(releaseRateUGPerDay) &&
                releaseRateUGPerDay > 0
                    ? (releaseRateUGPerDay / 24 / 1000) * F
                    : 0;
            if (rateMGh > 0) {
                return {
                    Frac_fast: 1.0,
                    k1_fast: 0,
                    k1_slow: 0,
                    k2: 0,
                    k3: defaultK3,
                    F,
                    rateMGh,
                    F_fast: F,
                    F_slow: F,
                };
            }
            const k1 = 0.0075;
            return {
                Frac_fast: 1.0,
                k1_fast: k1,
                k1_slow: 0,
                k2: 0,
                k3: defaultK3,
                F,
                rateMGh: 0,
                F_fast: F,
                F_slow: F,
            };
        }

        case Route.patchRemove:
            return {
                Frac_fast: 0,
                k1_fast: 0,
                k1_slow: 0,
                k2: 0,
                k3: defaultK3,
                F: 0,
                rateMGh: 0,
                F_fast: 0,
                F_slow: 0,
            };

        case Route.oral: {
            // === 针对 CPA 的特殊处理开始 ===
            // Only ka and the slow phase's β matter here, for how long the dose
            // counts (computeMaxLifetimeH); the curve itself is drawn from
            // CPA_ORAL in PrecomputedEventModel.
            if (event.ester === Ester.CPA) {
                return {
                    Frac_fast: 1.0,
                    k1_fast: CPA_ORAL.ka,
                    k1_slow: 0,
                    k2: 0,
                    k3: CPA_ORAL.beta,
                    F: CPA_ORAL_F,
                    rateMGh: 0,
                    F_fast: CPA_ORAL_F,
                    F_slow: CPA_ORAL_F,
                };
            }
            // Bicalutamide (issue #206 §3): single-compartment Bateman, oral only.
            if (event.ester === Ester.BICA) {
                return {
                    Frac_fast: 1.0,
                    k1_fast: BICALUTAMIDE_ORAL.ka,
                    k1_slow: 0,
                    k2: 0,
                    k3: BICALUTAMIDE_ORAL.ke,
                    F: BICALUTAMIDE_ORAL_F,
                    rateMGh: 0,
                    F_fast: BICALUTAMIDE_ORAL_F,
                    F_slow: BICALUTAMIDE_ORAL_F,
                };
            }
            // === 针对 CPA 的特殊处理结束 ===

            // EV: one step at kAbsEV. Everything else: absorption, then the
            // estrone pool (see OralPK.kE1Pool).
            const k1Value = event.ester === Ester.EV ? OralPK.kAbsEV : OralPK.kAbsE2;
            const k2Value = event.ester === Ester.EV ? 0 : OralPK.kE1Pool;
            const F = _activePKParams.e2_oral_bio * toE2;
            return {
                Frac_fast: 1.0,
                k1_fast: k1Value,
                k1_slow: 0,
                k2: k2Value,
                k3: defaultK3,
                F,
                rateMGh: 0,
                F_fast: F,
                F_slow: F,
            };
        }
    }

    return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3: defaultK3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
}

/**
 * First divided difference of s ↦ e^(−sτ) at x and y, (e^(−xτ) − e^(−yτ)) / (x − y),
 * taken without cancellation when x and y are close: it tends to −τ·e^(−xτ).
 */
