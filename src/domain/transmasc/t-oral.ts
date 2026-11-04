import { Ester, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { getToE2Factor } from '../constants';
import { tClearance, zeroPKParams } from '../shared/params';
import { buildOneCompAmount } from '../shared/amounts';

// Oral testosterone undecanoate transit model.
//
// --- Oral TU transit compartments (Phase 1.5) ---
//
// Erlang transit model for delayed absorption (closed form; equivalent to
// N identical first-order transit compartments solved by ODE).
export function transitCompartmentAmount(t: number, dose: number, F: number, k: number, n: number): number {
    if (t <= 0 || n < 1 || k <= 0) return 0;
    // factorial(n-1)
    let fact = 1;
    for (let i = 2; i <= n - 1; i++) fact *= i;
    return (dose * F * Math.pow(k, n) * Math.pow(t, n - 1) * Math.exp(-k * t)) / fact;
}

export const tOralModule: PkRouteModule = {
    routes: [Route.oral],
    esters: [Ester.TU],
    bioavailability(_route, ester) {
        return ester === Ester.TU ? 0.05 * getToE2Factor(ester) : 0;
    },
    resolveParams(event, birthYear) {
        const k3 = tClearance(event, birthYear);
        if (event.ester !== Ester.TU) return zeroPKParams(k3);

        const F = 0.05 * getToE2Factor(event.ester);
        return {
            Frac_fast: 1.0,
            k1_fast: 0.4,
            k1_slow: 0,
            k2: 0,
            k3,
            F,
            rateMGh: 0,
            F_fast: F,
            F_slow: F,
        };
    },
    buildAmount(event, _allEvents, params) {
        return buildOneCompAmount(event, params);
    },
};
