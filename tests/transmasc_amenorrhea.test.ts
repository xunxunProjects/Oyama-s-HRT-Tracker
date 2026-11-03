import { describe, expect, it } from 'vitest';
import { DEFAULT_AMENORRHEA_PARAMS, amenorrheaHazard } from '../logic';

describe('amenorrhea hazard (Phase 6.1)', () => {
    it('increases with higher average T', () => {
        const low = amenorrheaHazard(200, 40, DEFAULT_AMENORRHEA_PARAMS);
        const high = amenorrheaHazard(700, 40, DEFAULT_AMENORRHEA_PARAMS);
        expect(high).toBeGreaterThan(low);
    });
    it('increases when E2 is lower', () => {
        const highE2 = amenorrheaHazard(500, 80, DEFAULT_AMENORRHEA_PARAMS);
        const lowE2 = amenorrheaHazard(500, 20, DEFAULT_AMENORRHEA_PARAMS);
        expect(lowE2).toBeGreaterThan(highE2);
    });
    it('is non-negative', () => {
        expect(amenorrheaHazard(0, 100, DEFAULT_AMENORRHEA_PARAMS)).toBeGreaterThanOrEqual(0);
    });
});
