import { Ester, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { DEFAULT_PK_PARAMS, T_DepotPK, T_EsterPK, getToE2Factor } from '../constants';
import { _activePKParams } from '../shared/activeParams';
import { tClearance, zeroPKParams } from '../shared/params';
import { buildTwoPartAmount } from '../shared/amounts';

export function _getTInjFF(ester: Ester): number {
    const p = _activePKParams;
    if (ester === Ester.TC) return p.t_ff_TC;
    if (ester === Ester.TE) return p.t_ff_TE;
    if (ester === Ester.TU) return p.t_ff_TU;
    return DEFAULT_PK_PARAMS.t_ff_TE;
}

export const tInjectionModule: PkRouteModule = {
    routes: [Route.injection],
    esters: [Ester.T, Ester.TC, Ester.TE, Ester.TU],
    bioavailability(_route, ester) {
        return ester === Ester.T ? 0 : _getTInjFF(ester) * getToE2Factor(ester);
    },
    resolveParams(event, birthYear) {
        const k3 = tClearance(event, birthYear);
        if (event.ester === Ester.T) return zeroPKParams(k3);

        const Frac_fast = (T_DepotPK.Frac_fast as any)[event.ester] ?? 0.35;
        const k1_fast = (T_DepotPK.k1_fast as any)[event.ester] ?? 0.025;
        const k1_slow = (T_DepotPK.k1_slow as any)[event.ester] ?? 0.005;
        const k2 = (T_EsterPK.k2 as any)[event.ester] ?? 0.2;
        const F = _getTInjFF(event.ester) * getToE2Factor(event.ester);
        return { Frac_fast, k1_fast, k1_slow, k2, k3, F, rateMGh: 0, F_fast: F, F_slow: F };
    },
    buildAmount(event, _allEvents, params) {
        return buildTwoPartAmount(event, params);
    },
};
