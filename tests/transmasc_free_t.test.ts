import { describe, expect, it } from 'vitest';
import { bioavailableTestosteroneNgDl, freeTestosteroneNgDl } from '../logic';

describe('free testosterone (Vermeulen, Phase 2)', () => {
    it('free T is a small fraction of total T', () => {
        const ft = freeTestosteroneNgDl(500, 30, 4.3);
        expect(ft).toBeGreaterThan(0);
        expect(ft).toBeLessThan(500 * 0.1);
    });
    it('higher SHBG lowers free T at the same total T', () => {
        const low = freeTestosteroneNgDl(500, 10, 4.3);
        const high = freeTestosteroneNgDl(500, 60, 4.3);
        expect(high).toBeLessThan(low);
    });
    it('bioavailable >= free', () => {
        const ft = freeTestosteroneNgDl(500, 30, 4.3);
        const bt = bioavailableTestosteroneNgDl(500, 30, 4.3);
        expect(bt).toBeGreaterThanOrEqual(ft);
    });
});
