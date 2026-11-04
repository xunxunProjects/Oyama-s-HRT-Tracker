import { Ester, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { T_GelPK, getToE2Factor } from '../constants';
import { _activePKParams } from '../shared/activeParams';
import { gelSiteFromExtras } from '../shared/gel';
import { tClearance } from '../shared/params';
import { buildOneCompAmount } from '../shared/amounts';

export function _getTGelBio(siteKey: string): number {
    const p = _activePKParams;
    if (siteKey === 'arm') return p.t_gel_arm;
    if (siteKey === 'thigh') return p.t_gel_thigh;
    if (siteKey === 'scrotal') return p.t_gel_scrotal;
    return p.t_gel_arm;
}

export const tGelModule: PkRouteModule = {
    routes: [Route.gel],
    esters: [Ester.T, Ester.TC, Ester.TE, Ester.TU],
    bioavailability(_route, ester, extras) {
        return _getTGelBio(gelSiteFromExtras(extras)) * getToE2Factor(ester);
    },
    resolveParams(event, birthYear) {
        const F = _getTGelBio(gelSiteFromExtras(event.extras ?? {})) * getToE2Factor(event.ester);
        return {
            Frac_fast: 1.0,
            k1_fast: T_GelPK.k1,
            k1_slow: 0,
            k2: 0,
            k3: tClearance(event, birthYear),
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
