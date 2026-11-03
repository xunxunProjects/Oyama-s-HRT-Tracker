import { describe, expect, it } from 'vitest';
import { DEFAULT_GNRH_DEPOT, gnrhSuppression } from '../logic';

describe('GnRH agonist depot desensitisation (Phase 8.2)', () => {
    it('zero suppression before lag', () => {
        expect(gnrhSuppression(0, DEFAULT_GNRH_DEPOT)).toBe(0);
        expect(gnrhSuppression(5, DEFAULT_GNRH_DEPOT)).toBe(0);
    });
    it('rises after lag', () => {
        const a = gnrhSuppression(10, DEFAULT_GNRH_DEPOT);
        const b = gnrhSuppression(40, DEFAULT_GNRH_DEPOT);
        expect(b).toBeGreaterThan(a);
    });
    it('bounded by maxSuppression', () => {
        const v = gnrhSuppression(365, DEFAULT_GNRH_DEPOT);
        expect(v).toBeLessThanOrEqual(DEFAULT_GNRH_DEPOT.maxSuppression + 1e-9);
    });
});
