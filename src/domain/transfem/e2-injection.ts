import { Ester } from '../types';
import { InjectionPK } from '../constants';
import { _activePKParams } from '../shared/activeParams';

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
