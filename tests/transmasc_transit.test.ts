import { describe, expect, it } from 'vitest';
import { transitCompartmentAmount } from '../logic';

describe('TU transit compartments (Phase 1.5)', () => {
    it('zero for t<=0', () => {
        expect(transitCompartmentAmount(0, 100, 0.05, 1, 3)).toBe(0);
        expect(transitCompartmentAmount(-1, 100, 0.05, 1, 3)).toBe(0);
    });
    it('finite and non-negative', () => {
        const v = transitCompartmentAmount(5, 100, 0.05, 0.5, 4);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
    });
    it('n=1 reduces to first-order absorption peak then decay', () => {
        const early = transitCompartmentAmount(1, 100, 0.05, 1, 1);
        const late = transitCompartmentAmount(20, 100, 0.05, 1, 1);
        expect(early).toBeGreaterThan(0);
        expect(late).toBeLessThan(early);
    });
});
