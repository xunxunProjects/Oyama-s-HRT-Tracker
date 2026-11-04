import { Ester, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { T_DepotPK, T_EsterPK, getToE2Factor } from '../constants';
import { _getTInjFF } from './t-injection';
import { tClearance, zeroPKParams } from '../shared/params';
import { buildTwoPartAmount } from '../shared/amounts';

export const tScModule: PkRouteModule = {
    routes: [Route.sc],
    esters: [Ester.T, Ester.TC, Ester.TE, Ester.TU],
    bioavailability(_route, ester) {
        return ester === Ester.T ? 0 : _getTInjFF(ester) * getToE2Factor(ester);
    },
    resolveParams(event, birthYear) {
        const k3 = tClearance(event, birthYear);
        if (event.ester === Ester.T) return zeroPKParams(k3);

        const Frac_fast = (T_DepotPK.Frac_fast as any)[event.ester] ?? 0.35;
        const k1_fast = ((T_DepotPK.k1_fast as any)[event.ester] ?? 0.025) * 0.5;
        const k1_slow = ((T_DepotPK.k1_slow as any)[event.ester] ?? 0.005) * 0.5;
        const k2 = (T_EsterPK.k2 as any)[event.ester] ?? 0.2;
        const F = _getTInjFF(event.ester) * getToE2Factor(event.ester);
        return { Frac_fast, k1_fast, k1_slow, k2, k3, F, rateMGh: 0, F_fast: F, F_slow: F };
    },
    buildAmount(event, _allEvents, params) {
        return buildTwoPartAmount(event, params);
    },
};
