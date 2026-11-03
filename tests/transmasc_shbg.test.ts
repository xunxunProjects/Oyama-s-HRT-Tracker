import { describe, expect, it } from 'vitest';
import { DEFAULT_T_SHBG_SUPPRESSION, shbgSuppressionFactor } from '../shbg';

describe('T-driven SHBG suppression (Phase 3.1)', () => {
    it('factor <= 1 and >= 1-smax', () => {
        const f = shbgSuppressionFactor(800, DEFAULT_T_SHBG_SUPPRESSION);
        expect(f).toBeLessThanOrEqual(1);
        expect(f).toBeGreaterThanOrEqual(1 - DEFAULT_T_SHBG_SUPPRESSION.smax - 1e-9);
    });
    it('higher T gives lower factor', () => {
        const low = shbgSuppressionFactor(200, DEFAULT_T_SHBG_SUPPRESSION);
        const high = shbgSuppressionFactor(1200, DEFAULT_T_SHBG_SUPPRESSION);
        expect(high).toBeLessThan(low);
    });
    it('zero T gives factor 1', () => {
        expect(shbgSuppressionFactor(0, DEFAULT_T_SHBG_SUPPRESSION)).toBe(1);
    });
});