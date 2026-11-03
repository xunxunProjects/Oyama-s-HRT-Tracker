import { describe, expect, it } from 'vitest';
import { ekfStep, mipdDoseAdjust } from '../logic';

describe('calibration stack (Phase 9.1)', () => {
    it('EKF reduces uncertainty after measurement', () => {
        const s = ekfStep({ x: 1, P: 4 }, 1.1, (x) => x, (x) => x, 1, 1, 0.1, 0.5);
        expect(s.P).toBeLessThan(4);
        expect(Number.isFinite(s.x)).toBe(true);
    });
    it('MIPD adjusts dose toward target', () => {
        const d = mipdDoseAdjust(100, 50, 100);
        expect(d).toBe(200);
    });
    it('MIPD guards non-positive predicted', () => {
        expect(mipdDoseAdjust(100, 0, 100)).toBe(100);
    });
});