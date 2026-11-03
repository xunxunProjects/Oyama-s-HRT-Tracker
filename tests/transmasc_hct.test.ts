import { describe, expect, it } from 'vitest';
import { DEFAULT_HCT_PARAMS, hctStep } from '../logic';

describe('hematocrit turnover (Phase 5.1)', () => {
    it('rises under testosterone exposure', () => {
        let h = 0.42;
        for (let i = 0; i < 24 * 30; i++) h = hctStep(h, 600, 1, DEFAULT_HCT_PARAMS);
        expect(h).toBeGreaterThan(0.42);
    });
    it('stays near baseline with zero exposure', () => {
        let h = 0.42;
        for (let i = 0; i < 24 * 30; i++) h = hctStep(h, 0, 1, DEFAULT_HCT_PARAMS);
        expect(Math.abs(h - 0.42)).toBeLessThan(0.01);
    });
    it('higher free T gives higher Hct', () => {
        let a = 0.42,
            b = 0.42;
        for (let i = 0; i < 24 * 30; i++) {
            a = hctStep(a, 300, 1, DEFAULT_HCT_PARAMS);
            b = hctStep(b, 900, 1, DEFAULT_HCT_PARAMS);
        }
        expect(b).toBeGreaterThan(a);
    });
});
