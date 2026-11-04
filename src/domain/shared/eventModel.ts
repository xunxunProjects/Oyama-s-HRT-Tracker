import { Ester, Route } from '../types';
import type { DoseEvent, PKParams } from '../types';
import { _analytic2C, _analytic3C, oneCompAmount } from './math';
import { resolvePatchWearH } from './patch';
import { CPA_ORAL } from '../transfem/cpa-oral';
import { BICALUTAMIDE_ORAL } from '../transfem/bica-oral';

export class PrecomputedEventModel {
    private model: (t: number) => number;
    // The swallowed part of model(t): all of it for an oral dose, the slow
    // branch of a sublingual one, none for any other route.
    private swallowedModel: (t: number) => number = () => 0;

    constructor(event: DoseEvent, allEvents: DoseEvent[], params: PKParams) {
        const startTime = event.timeH;
        const dose = event.doseMG;

        switch (event.route) {
            case Route.injection:
            case Route.sc:
                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;
                    const doseFast = dose * params.Frac_fast;
                    const doseSlow = dose * (1.0 - params.Frac_fast);

                    // Unesterified estradiol has k2 = 0 — nothing to hydrolyse —
                    // and the 3C kernel multiplies by k2, so it returned exactly
                    // zero for all time: a logged dose that contributed nothing,
                    // silently. Fall back to the two-compartment form, matching
                    // what the sublingual branch already does for the same case.
                    if (params.k2 > 0) {
                        return (
                            _analytic3C(tau, doseFast, params.F, params.k1_fast, params.k2, params.k3) +
                            _analytic3C(tau, doseSlow, params.F, params.k1_slow, params.k2, params.k3)
                        );
                    }
                    return (
                        _analytic2C(tau, doseFast, params.F, params.k1_fast, params.k3) +
                        _analytic2C(tau, doseSlow, params.F, params.k1_slow, params.k3)
                    );
                };
                break;
            case Route.gel:
            case Route.oral:
            case Route.nasal:
                if (event.route === Route.oral && event.ester === Ester.CPA) {
                    const { F, ka, alpha, beta, wFast, wSlow } = CPA_ORAL;
                    this.model = (timeH: number) => {
                        const tau = timeH - startTime;
                        if (tau < 0) return 0;
                        return (
                            _analytic2C(tau, dose, F * wFast, ka, alpha) + _analytic2C(tau, dose, F * wSlow, ka, beta)
                        );
                    };
                    break;
                }
                if (event.route === Route.oral && event.ester === Ester.BICA) {
                    const { F, ka, ke } = BICALUTAMIDE_ORAL;
                    this.model = (timeH: number) => {
                        const tau = timeH - startTime;
                        if (tau < 0) return 0;
                        return _analytic2C(tau, dose, F, ka, ke);
                    };
                    // Bicalutamide is not part of the swallowed estradiol share
                    // that drives the SHBG model; keep swallowedModel at zero.
                    this.swallowedModel = () => 0;
                    break;
                }
                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;
                    if (params.k2 > 0) return _analytic3C(tau, dose, params.F, params.k1_fast, params.k2, params.k3);
                    return oneCompAmount(tau, dose, params);
                };
                if (event.route === Route.oral) this.swallowedModel = this.model;
                break;
            case Route.sublingual: {
                const doseF = dose * params.Frac_fast;
                const doseS = dose * (1.0 - params.Frac_fast);

                // Dual-branch first-order helper (same closed form as oneCompAmount).
                const fastAmount = (tau: number) =>
                    params.k2 > 0
                        ? _analytic3C(tau, doseF, params.F_fast, params.k1_fast, params.k2, params.k3)
                        : _analytic2C(tau, doseF, params.F_fast, params.k1_fast, params.k3);

                // Swallowed (gut) fraction follows the oral route's path.
                const slowAmount = (tau: number) =>
                    (params.k2_slow ?? 0) > 0
                        ? _analytic3C(tau, doseS, params.F_slow, params.k1_slow, params.k2_slow!, params.k3)
                        : _analytic2C(tau, doseS, params.F_slow, params.k1_slow, params.k3);

                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;
                    return fastAmount(tau) + slowAmount(tau);
                };
                this.swallowedModel = (timeH: number) => {
                    const tau = timeH - startTime;
                    return tau < 0 ? 0 : slowAmount(tau);
                };
                break;
            }
            case Route.patchApply:
            case Route.pellet: {
                const wearH = resolvePatchWearH(event, allEvents);

                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;

                    // Zero Order
                    if (params.rateMGh > 0) {
                        if (tau <= wearH) {
                            return (params.rateMGh / params.k3) * (1 - Math.exp(-params.k3 * tau));
                        } else {
                            const amtRemoval = (params.rateMGh / params.k3) * (1 - Math.exp(-params.k3 * wearH));
                            return amtRemoval * Math.exp(-params.k3 * (tau - wearH));
                        }
                    }
                    // First order legacy
                    const amtUnderPatch = oneCompAmount(tau, dose, params);
                    if (tau > wearH) {
                        const amtAtRemoval = oneCompAmount(wearH, dose, params);
                        return amtAtRemoval * Math.exp(-params.k3 * (tau - wearH));
                    }
                    return amtUnderPatch;
                };
                break;
            }
            default:
                this.model = () => 0;
        }
    }

    amount(timeH: number): number {
        return this.model(timeH);
    }

    swallowedAmount(timeH: number): number {
        return this.swallowedModel(timeH);
    }
}

// --- Simulation Engine ---

/**
 * Compute the maximum time (hours after dose) for which an event's PK model
 * contribution is non-negligible.  Once tau > maxLifetimeH the exponential
 * decay has reduced the amount to < 1e-6 of its peak, so we can safely skip
 * the evaluation — critical when there are hundreds of events (e.g. daily
 * oral recording for a year).
 */
export function computeMaxLifetimeH(params: PKParams, event: DoseEvent, allEvents: DoseEvent[]): number {
    // For patches: account for wear duration + post-removal decay. Resolve the
    // wear of this very event: two patches applied at the same moment can come
    // off at different times.
    if (event.route === Route.patchApply || event.route === Route.pellet) {
        const wearH = resolvePatchWearH(event, allEvents);
        if (wearH >= Number.MAX_VALUE) return Infinity; // Worn indefinitely, always contributes
        const decayH = params.k3 > 0 ? Math.ceil(13.816 / params.k3) : 10000;
        return wearH + decayH;
    }

    // Collect all non-zero rate constants that govern exponential decay
    const rates: number[] = [];
    if (params.k1_fast > 0) rates.push(params.k1_fast);
    if (params.k1_slow > 0) rates.push(params.k1_slow);
    if (params.k2 > 0) rates.push(params.k2);
    if ((params.k2_slow ?? 0) > 0) rates.push(params.k2_slow!);
    if (params.k3 > 0) rates.push(params.k3);

    if (rates.length === 0) return Infinity;

    // The slowest exponential dominates at large tau.
    // exp(-kMin * tau) < 1e-6  =>  tau > ln(1e6) / kMin ≈ 13.816 / kMin
    const kMin = Math.min(...rates);
    return Math.ceil(13.816 / kMin);
}

/**
 * `birthYear`: for the age adjustment (see AGE_REF_YEARS); null, or one isPlausibleBirthYear rejects, leaves it out.
 * `swallowedE2`: also return concPGmL_E2_swallowed, for the SHBG model in shbg.ts.
 */
