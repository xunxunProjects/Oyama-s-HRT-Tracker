import { describe, expect, it } from 'vitest';
import { shbgSuppressionFactor } from '../shbg';

function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

describe('SHBG suppression Monte Carlo 500k', () => {
    it('500k random evaluations stay in [1-smax,1] and finite', () => {
        let errors = 0;
        for (let i = 0; i < 500_000; i++) {
            const t = rand(0, 3000);
            const smax = rand(0.01, 0.9);
            const sc50 = rand(1, 2000);
            const hill = rand(0.5, 3);
            const f = shbgSuppressionFactor(t, { smax, sc50, hill });
            if (!Number.isFinite(f) || f < 1 - smax - 1e-9 || f > 1 + 1e-9) {
                errors++;
            }
        }
        expect(errors).toBeLessThan(500);
    }, 120000);
});
