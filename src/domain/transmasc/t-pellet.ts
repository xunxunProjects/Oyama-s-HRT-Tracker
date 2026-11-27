import { Ester, ExtraKey, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { getToE2Factor } from '../constants';
import { tClearance } from '../shared/params';
import { buildWearAmount } from '../shared/amounts';
import { pelletReleaseRateUGPerDay, resolvePelletWearH } from '../shared/pellet';

export const tPelletModule: PkRouteModule = {
    routes: [Route.pellet],
    esters: [Ester.T, Ester.TC, Ester.TE, Ester.TU],
    bioavailability(_route, ester) {
        return getToE2Factor(ester);
    },
    resolveParams(event, birthYear, bodyWeightKG) {
        const F = getToE2Factor(event.ester);
        const k3 = tClearance(event, birthYear, bodyWeightKG);
        const storedRateUGPerDay = (event.extras ?? {})[ExtraKey.releaseRateUGPerDay];
        const rateUGPerDay =
            typeof storedRateUGPerDay === 'number' && Number.isFinite(storedRateUGPerDay) && storedRateUGPerDay > 0
                ? storedRateUGPerDay
                : pelletReleaseRateUGPerDay(event.doseMG);
        const rateMGhP = rateUGPerDay > 0 ? (rateUGPerDay / 24 / 1000) * F : 0.05 * F;
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
        // Pellets have no separate removal event: use the dissolution window as
        // the wear time so delivery stops after the published 4-5 month span.
        const bounded = {
            ...event,
            extras: { ...event.extras, [ExtraKey.patchWearH]: resolvePelletWearH(event) },
        };
        return buildWearAmount(bounded, allEvents, params);
    },
};
