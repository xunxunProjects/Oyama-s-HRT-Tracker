import { _activePKParams } from '../shared/activeParams';

export function _getTGelBio(siteKey: string): number {
    const p = _activePKParams;
    if (siteKey === 'arm') return p.t_gel_arm;
    if (siteKey === 'thigh') return p.t_gel_thigh;
    if (siteKey === 'scrotal') return p.t_gel_scrotal;
    return p.t_gel_arm;
}
