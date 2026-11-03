import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_COMP_PARAMS, bodyCompStep } from '../logic';

describe('body composition slow variables (Phase 7.1)', () => {
    it('muscle rises under exposure', () => {
        let m = 1,
            f = 1;
        for (let i = 0; i < 365; i++) ({ m, fVisc: f } = bodyCompStep(m, f, 1, 1, DEFAULT_BODY_COMP_PARAMS));
        expect(m).toBeGreaterThan(1);
    });
    it('visceral fat rises under exposure', () => {
        let m = 1,
            f = 1;
        for (let i = 0; i < 365; i++) ({ m, fVisc: f } = bodyCompStep(m, f, 1, 1, DEFAULT_BODY_COMP_PARAMS));
        expect(f).toBeGreaterThan(1);
    });
    it('no exposure keeps values bounded', () => {
        let m = 1,
            f = 1;
        for (let i = 0; i < 365; i++) ({ m, fVisc: f } = bodyCompStep(m, f, 0, 1, DEFAULT_BODY_COMP_PARAMS));
        expect(m).toBeLessThanOrEqual(1);
        expect(f).toBeLessThanOrEqual(1);
    });
});
