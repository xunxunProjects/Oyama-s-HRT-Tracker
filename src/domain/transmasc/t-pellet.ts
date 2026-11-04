import { Ester, ExtraKey, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { getToE2Factor } from '../constants';
import { tClearance } from '../shared/params';
import { buildWearAmount } from '../shared/amounts';

export const tPelletModule: PkRouteModule = {
    routes: [Route.pellet],
    esters: [Ester.T, Ester.TC, Ester.TE, Ester.TU],
    bioavailability(_route, ester) {
        return getToE2Factor(ester);
    },
    resolveParams(event, birthYear) {
        const F = getToE2Factor(event.ester);
        const k3 = tClearance(event, birthYear);
        const releaseRateUGPerDayP = (event.extras ?? {})[ExtraKey.releaseRateUGPerDay];
        const rateMGhP =
            typeof releaseRateUGPerDayP === 'number' &&
            Number.isFinite(releaseRateUGPerDayP) &&
            releaseRateUGPerDayP > 0
                ? (releaseRateUGPerDayP / 24 / 1000) * F
                : 0.05 * F; // default slow release
        if (rateMGhP > 0) {
            return {
                Frac_fast: 1.0,
                k1_fast: 0,
                k1_slow: 0,
                k2: 0,
                k3,
                F,
                rateMGh: rateMGhP,
                F_fast: F,
                F_slow: F,
            };
        }
        return {
            Frac_fast: 1.0,
            k1_fast: 0.001,
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
        return buildWearAmount(event, allEvents, params);
    },
};
