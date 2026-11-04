import { Ester, ExtraKey, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { getToE2Factor } from '../constants';
import { e2Clearance, zeroPKParams } from '../shared/params';
import { buildWearAmount } from '../shared/amounts';

export const e2PatchModule: PkRouteModule = {
    routes: [Route.patchApply, Route.patchRemove],
    esters: [Ester.E2, Ester.EB, Ester.EV, Ester.EC, Ester.EN, Ester.EU],
    bioavailability(route, ester) {
        return route === Route.patchApply ? getToE2Factor(ester) : 0;
    },
    resolveParams(event, birthYear) {
        const k3 = e2Clearance(event, birthYear);
        if (event.route === Route.patchRemove) return zeroPKParams(k3);

        const F = getToE2Factor(event.ester);
        const releaseRateUGPerDay = (event.extras ?? {})[ExtraKey.releaseRateUGPerDay];
        const rateMGh =
            typeof releaseRateUGPerDay === 'number' && Number.isFinite(releaseRateUGPerDay) && releaseRateUGPerDay > 0
                ? (releaseRateUGPerDay / 24 / 1000) * F
                : 0;
        if (rateMGh > 0) {
            return {
                Frac_fast: 1.0,
                k1_fast: 0,
                k1_slow: 0,
                k2: 0,
                k3,
                F,
                rateMGh,
                F_fast: F,
                F_slow: F,
            };
        }
        return {
            Frac_fast: 1.0,
            k1_fast: 0.0075,
            k1_slow: 0,
            k2: 0,
            k3,
            F,
            rateMGh: 0,
            F_fast: F,
            F_slow: F,
        };
    },
    buildAmount(event, allEvents, params) {
        if (event.route === Route.patchRemove) return { amount: () => 0, swallowed: () => 0 };
        return buildWearAmount(event, allEvents, params);
    },
};
