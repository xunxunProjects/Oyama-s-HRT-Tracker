import { describe, expect, it } from 'vitest';
import { endogenousBackground, hasUterus } from '../logic';

describe('gonadectomy state (Phase 4.1)', () => {
    it('BSO lowers endogenous E2 and T to adrenal levels', () => {
        const intact = endogenousBackground('intact', 1, 5);
        const bso = endogenousBackground('bso', 1, 5);
        expect(bso.e2Endo).toBeLessThan(intact.e2Endo);
        expect(bso.tEndo).toBeLessThan(intact.tEndo);
    });
    it('hysterectomy-only still has ovaries (E2 present)', () => {
        const h = endogenousBackground('hysterectomy-only', 1, 5);
        expect(h.e2Endo).toBeGreaterThan(5);
    });
    it('hasUterus is false after hysterectomy', () => {
        expect(hasUterus('intact')).toBe(true);
        expect(hasUterus('hysterectomy-only')).toBe(false);
        expect(hasUterus('bso')).toBe(false);
    });
});
