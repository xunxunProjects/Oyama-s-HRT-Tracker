import { _activePKParams } from '../shared/activeParams';

export function _getGelBio(siteKey: string): number {
    const p = _activePKParams;
    if (siteKey === 'arm') return p.e2_gel_arm;
    if (siteKey === 'thigh') return p.e2_gel_thigh;
    if (siteKey === 'scrotal') return p.e2_gel_scrotal;
    return p.e2_gel_arm;
}
