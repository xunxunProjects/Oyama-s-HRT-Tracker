import { describe, expect, it } from 'vitest';
import {
    MAX_ANIMATION_MS,
    SPRING_CONFIG,
    STAGGER_MS,
    animationBudgetMs,
    extractLatexVariables,
} from '../src/lib/explainMath';

describe('extractLatexVariables', () => {
    it('returns variables in first-occurrence order, unique', () => {
        expect(extractLatexVariables('C(t) = \\frac{D}{V_d} \\cdot e^{-k_e t}')).toEqual([
            'C',
            't',
            'D',
            'V_d',
            'e',
            'k_e',
        ]);
    });

    it('ignores LaTeX commands and text/mathrm labels', () => {
        expect(
            extractLatexVariables('\\text{dose} = D \\mathrm{mg},\\; \\exp(x)'),
        ).toEqual(['D', 'x']);
    });

    it('handles braced subscripts', () => {
        expect(extractLatexVariables('C_{max} = \\frac{D}{V_{d}}')).toEqual(['C_max', 'D', 'V_d']);
    });

    it('returns empty array for no variables', () => {
        expect(extractLatexVariables('1 + 2 = 3')).toEqual([]);
    });

    it('returns empty array for empty input', () => {
        expect(extractLatexVariables('')).toEqual([]);
    });

    it('deduplicates repeated variables', () => {
        expect(extractLatexVariables('x + x^2 + x_{1}')).toEqual(['x', 'x_1']);
    });
});

describe('animation budget', () => {
    it('stays within 1.5 seconds for a typical variable count', () => {
        expect(animationBudgetMs(6)).toBeLessThanOrEqual(MAX_ANIMATION_MS);
    });

    it('stays within 1.5 seconds even for many variables', () => {
        expect(animationBudgetMs(20)).toBeLessThanOrEqual(MAX_ANIMATION_MS);
    });

    it('is zero or positive', () => {
        expect(animationBudgetMs(0)).toBeGreaterThanOrEqual(0);
    });
});

describe('spring config', () => {
    it('uses a non-bouncy spring', () => {
        expect(SPRING_CONFIG.bounce ?? 0).toBe(0);
    });
});

describe('constants', () => {
    it('MAX_ANIMATION_MS is 1500', () => {
        expect(MAX_ANIMATION_MS).toBe(1500);
    });

    it('STAGGER_MS is positive', () => {
        expect(STAGGER_MS).toBeGreaterThan(0);
    });
});
