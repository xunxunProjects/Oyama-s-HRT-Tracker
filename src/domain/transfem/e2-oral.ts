import { Ester, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { OralPK, getToE2Factor } from '../constants';
import { _activePKParams } from '../shared/activeParams';
import { e2Clearance } from '../shared/params';
import { buildOneCompAmount } from '../shared/amounts';

export const e2OralModule: PkRouteModule = {
    routes: [Route.oral],
    esters: [Ester.E2, Ester.EB, Ester.EV, Ester.EC, Ester.EN, Ester.EU],
    bioavailability(_route, ester) {
        return _activePKParams.e2_oral_bio * getToE2Factor(ester);
    },
    resolveParams(event, birthYear) {
        const toE2 = getToE2Factor(event.ester);
        // EV: one step at kAbsEV. Everything else: absorption, then the estrone
        // pool (see OralPK.kE1Pool).
        const k1Value = event.ester === Ester.EV ? OralPK.kAbsEV : OralPK.kAbsE2;
        const k2Value = event.ester === Ester.EV ? 0 : OralPK.kE1Pool;
        const F = _activePKParams.e2_oral_bio * toE2;
        return {
            Frac_fast: 1.0,
            k1_fast: k1Value,
            k1_slow: 0,
            k2: k2Value,
            k3: e2Clearance(event, birthYear),
            F,
            rateMGh: 0,
            F_fast: F,
            F_slow: F,
        };
    },
    buildAmount(event, _allEvents, params) {
        return buildOneCompAmount(event, params, true);
    },
};
