import { Ester, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { getToE2Factor } from '../constants';
import { _activePKParams } from '../shared/activeParams';
import { gelSiteFromExtras } from '../shared/gel';
import { e2Clearance } from '../shared/params';
import { buildOneCompAmount } from '../shared/amounts';

export function _getGelBio(siteKey: string): number {
    const p = _activePKParams;
    if (siteKey === 'arm') return p.e2_gel_arm;
    if (siteKey === 'thigh') return p.e2_gel_thigh;
    if (siteKey === 'scrotal') return p.e2_gel_scrotal;
    return p.e2_gel_arm;
}

export const e2GelModule: PkRouteModule = {
    routes: [Route.gel],
    esters: [Ester.E2, Ester.EB, Ester.EV, Ester.EC, Ester.EN, Ester.EU],
    bioavailability(_route, ester, extras) {
        return _getGelBio(gelSiteFromExtras(extras)) * getToE2Factor(ester);
    },
    resolveParams(event, birthYear) {
        const F = _getGelBio(gelSiteFromExtras(event.extras ?? {})) * getToE2Factor(event.ester);
        // Under flip-flop kinetics (k1 << k3), the terminal decline is absorption-
        // limited, so k1 is set from the reported apparent elimination half-life of
        // transdermal E2 gel: k1 = ln(2)/36 ≈ 0.0193 h⁻¹.
        //
        // 36 h is EstroGel's, not Divigel's, which this comment previously
        // misattributed: "The apparent terminal exponential half-life for estradiol
        // was about 36 hours following administration of 1.25 g EstroGel"
        // (NDA 021166) versus "about 10 hours following administration of Divigel"
        // (NDA 022038). The two labels genuinely disagree, confounded by product,
        // formulation and site (arm vs thigh), so 36 h is a choice between them
        // rather than a consensus figure.
        //
        // k1 does not affect exposure either way: it cancels out of the kernel's
        // time-integral, so AUC = F·D/k3 regardless, and k1 sets only Tmax and the
        // peak-to-trough shape. Worth revisiting on its own evidence — the model's
        // gel Cmax runs low against both labels (predicted ~31 vs EstroGel's 46.4,
        // ~41 vs Divigel's 51.5) — but that is a k1 problem, not an F problem.
        const k1 = 0.0193;
        return {
            Frac_fast: 1.0,
            k1_fast: k1,
            k1_slow: 0,
            k2: 0,
            k3: e2Clearance(event, birthYear),
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
