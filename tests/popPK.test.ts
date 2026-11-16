import { describe, expect, it } from 'vitest';
import { DEFAULT_POP_PK_COVARIATE_PARAMS, popPKCovariateFactors, weightK3Factor } from '../logic';

const WEIGHTS = [50, 70, 100, 150];

describe('weightK3Factor', () => {
    it('is exactly 1 at the 70 kg reference', () => {
        expect(weightK3Factor(70)).toBe(1);
    });

    it('applies (BW/70)^-0.25 so total CL scales as (BW/70)^0.75', () => {
        for (const kg of WEIGHTS) {
            const ratio = kg / 70;
            const { clFactor, vFactor } = popPKCovariateFactors(kg, null, null, DEFAULT_POP_PK_COVARIATE_PARAMS);

            expect(vFactor).toBeCloseTo(ratio, 12);
            expect(clFactor).toBeCloseTo(Math.pow(ratio, 0.75), 12);
            expect(weightK3Factor(kg)).toBeCloseTo(Math.pow(ratio, -0.25), 12);
            expect(weightK3Factor(kg)).toBeCloseTo(clFactor / vFactor, 12);
        }
    });
});
