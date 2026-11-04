import { Ester, ExtraKey, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { T_PatchPK, getToE2Factor } from '../constants';
import { tClearance, zeroPKParams } from '../shared/params';
import { buildWearAmount } from '../shared/amounts';

export const tPatchModule: PkRouteModule = {
    routes: [Route.patchApply, Route.patchRemove],
    esters: [Ester.T, Ester.TC, Ester.TE, Ester.TU],
    bioavailability(route, ester) {
        return route === Route.patchApply ? T_PatchPK.F * getToE2Factor(ester) : 0;
    },
    resolveParams(event, birthYear) {
        const k3 = tClearance(event, birthYear);
        if (event.route === Route.patchRemove) return zeroPKParams(k3);

        const F = T_PatchPK.F * getToE2Factor(event.ester);
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
            k1_fast: T_PatchPK.k1,
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
