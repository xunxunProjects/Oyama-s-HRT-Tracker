import { Ester, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { getToE2Factor } from '../constants';
import { tClearance, zeroPKParams } from '../shared/params';
import { buildOneCompAmount } from '../shared/amounts';

export const tNasalModule: PkRouteModule = {
    routes: [Route.nasal],
    esters: [Ester.T],
    bioavailability(_route, ester) {
        return ester === Ester.T ? 0.08 * getToE2Factor(ester) : 0;
    },
    resolveParams(event, birthYear) {
        const k3 = tClearance(event, birthYear);
        if (event.ester !== Ester.T) return zeroPKParams(k3);

        const F = 0.08 * getToE2Factor(event.ester);
        return {
            Frac_fast: 1.0,
            k1_fast: 2.0,
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
