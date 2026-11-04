import { describe, expect, it } from 'vitest';
import { popPKCovariateFactors } from '../logic';

describe('population PK covariate layer (A7)', () => {
    it('reference weight gives unit factors', () => {
        const r = popPKCovariateFactors(70);
        expect(r.clFactor).toBeCloseTo(1, 5);
        expect(r.vFactor).toBeCloseTo(1, 5);
    });
    it('heavier weight increases clearance factor', () => {
        const r = popPKCovariateFactors(100);
        expect(r.clFactor).toBeGreaterThan(1);
    });
});
