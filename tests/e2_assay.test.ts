import { describe, expect, it } from 'vitest';
import { assayPlatformSigma, assayPlatformNoise, DEFAULT_ASSAY_PLATFORM_PARAMS } from '../logic';

describe('assay platform error model (A6)', () => {
    it('immuno sigma > lcms sigma', () => {
        expect(assayPlatformSigma('immuno')).toBeGreaterThan(assayPlatformSigma('lcms'));
    });
    it('noise returns mean and sigma', () => {
        const r = assayPlatformNoise(100, 'lcms');
        expect(r.mean).toBe(100);
        expect(r.sigma).toBe(DEFAULT_ASSAY_PLATFORM_PARAMS.sigmaLcms);
    });
});
