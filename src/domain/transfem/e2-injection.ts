import { Ester, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { CorePK, EsterPK, InjectionPK, TwoPartDepotPK, getToE2Factor } from '../constants';
import { _activePKParams } from '../shared/activeParams';
import { e2Clearance } from '../shared/params';
import { buildTwoPartAmount } from '../shared/amounts';

export function _getE2InjFF(ester: Ester): number {
    const p = _activePKParams;
    if (ester === Ester.EB) return p.e2_ff_EB;
    if (ester === Ester.EV) return p.e2_ff_EV;
    if (ester === Ester.EC) return p.e2_ff_EC;
    if (ester === Ester.EN) return p.e2_ff_EN;
    if (ester === Ester.EU) return p.e2_ff_EU;
    if (ester === Ester.E2) return InjectionPK.formationFraction[Ester.E2];
    return 0.08;
}

export const e2InjectionModule: PkRouteModule = {
    routes: [Route.injection],
    esters: [Ester.E2, Ester.EB, Ester.EV, Ester.EC, Ester.EN, Ester.EU],
    bioavailability(_route, ester) {
        return _getE2InjFF(ester) * getToE2Factor(ester);
    },
    resolveParams(event, birthYear) {
        const F = _getE2InjFF(event.ester) * getToE2Factor(event.ester);
        const Frac_fast = TwoPartDepotPK.Frac_fast[event.ester] ?? 0.5;
        const k1_fast = (TwoPartDepotPK.k1_fast[event.ester] ?? 0.1) * CorePK.depotK1Corr;
        const k1_slow = (TwoPartDepotPK.k1_slow[event.ester] ?? 0.01) * CorePK.depotK1Corr;
        const k2 = EsterPK.k2[event.ester] ?? 0;
        return {
            Frac_fast,
            k1_fast,
            k1_slow,
            k2,
            k3: e2Clearance(event, birthYear),
            F,
            rateMGh: 0,
            F_fast: F,
            F_slow: F,
        };
    },
    buildAmount(event, _allEvents, params) {
        return buildTwoPartAmount(event, params);
    },
};
