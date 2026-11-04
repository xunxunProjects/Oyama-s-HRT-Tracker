import type { DoseEvent, PKParams } from '../types';
import type { AmountModel } from './module';
import { _analytic2C, _analytic3C, oneCompAmount } from './math';
import { resolvePatchWearH } from './patch';

/**
 * Two- or three-compartment depot (injection and subcutaneous). The 3C kernel
 * needs k2 > 0; unesterified estradiol has k2 = 0, so it uses the 2C form.
 */
export function buildTwoPartAmount(event: DoseEvent, params: PKParams): AmountModel {
    const startTime = event.timeH;
    const dose = event.doseMG;

    const amount = (timeH: number) => {
        const tau = timeH - startTime;
        if (tau < 0) return 0;
        const doseFast = dose * params.Frac_fast;
        const doseSlow = dose * (1.0 - params.Frac_fast);

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

    return { amount, swallowed: () => 0 };
}

/**
 * First-order absorption with an optional estrone pool. `swallowed` is the same
 * curve for an oral dose (the SHBG model uses it); other routes pass `false`.
 */
export function buildOneCompAmount(event: DoseEvent, params: PKParams, swallowed = false): AmountModel {
    const startTime = event.timeH;
    const dose = event.doseMG;

    const amount = (timeH: number) => {
        const tau = timeH - startTime;
        if (tau < 0) return 0;
        if (params.k2 > 0) return _analytic3C(tau, dose, params.F, params.k1_fast, params.k2, params.k3);
        return oneCompAmount(tau, dose, params);
    };

    return { amount, swallowed: swallowed ? amount : () => 0 };
}

/** Sublingual dual branch: mucosal fast phase plus the swallowed slow phase. */
export function buildSublingualAmount(event: DoseEvent, params: PKParams): AmountModel {
    const startTime = event.timeH;
    const dose = event.doseMG;
    const doseF = dose * params.Frac_fast;
    const doseS = dose * (1.0 - params.Frac_fast);

    const fastAmount = (tau: number) =>
        params.k2 > 0
            ? _analytic3C(tau, doseF, params.F_fast, params.k1_fast, params.k2, params.k3)
            : _analytic2C(tau, doseF, params.F_fast, params.k1_fast, params.k3);

    const slowAmount = (tau: number) =>
        (params.k2_slow ?? 0) > 0
            ? _analytic3C(tau, doseS, params.F_slow, params.k1_slow, params.k2_slow!, params.k3)
            : _analytic2C(tau, doseS, params.F_slow, params.k1_slow, params.k3);

    const amount = (timeH: number) => {
        const tau = timeH - startTime;
        if (tau < 0) return 0;
        return fastAmount(tau) + slowAmount(tau);
    };

    const swallowed = (timeH: number) => {
        const tau = timeH - startTime;
        return tau < 0 ? 0 : slowAmount(tau);
    };

    return { amount, swallowed };
}

/** Zero-order or first-order delivery that stops at the resolved wear time. */
export function buildWearAmount(event: DoseEvent, allEvents: DoseEvent[], params: PKParams): AmountModel {
    const startTime = event.timeH;
    const dose = event.doseMG;
    const wearH = resolvePatchWearH(event, allEvents);

    const amount = (timeH: number) => {
        const tau = timeH - startTime;
        if (tau < 0) return 0;

        if (params.rateMGh > 0) {
            if (tau <= wearH) {
                return (params.rateMGh / params.k3) * (1 - Math.exp(-params.k3 * tau));
            }
            const amtRemoval = (params.rateMGh / params.k3) * (1 - Math.exp(-params.k3 * wearH));
            return amtRemoval * Math.exp(-params.k3 * (tau - wearH));
        }

        const amtUnderPatch = oneCompAmount(tau, dose, params);
        if (tau > wearH) {
            const amtAtRemoval = oneCompAmount(wearH, dose, params);
            return amtAtRemoval * Math.exp(-params.k3 * (tau - wearH));
        }
        return amtUnderPatch;
    };

    return { amount, swallowed: () => 0 };
}
