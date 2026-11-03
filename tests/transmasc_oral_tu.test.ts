import { describe, expect, it } from 'vitest';
import { Ester, Route, interpolateConcentration_T, runSimulation } from '../logic';
import { BW, NOW_H, dose, regimen } from './helpers';

describe('oral testosterone undecanoate (Phase 1.1)', () => {
    it('produces finite, positive concentrations', () => {
        const sim = runSimulation(regimen(Route.oral, Ester.TU, 220, 12, 14, NOW_H - 12), BW)!;
        const c = interpolateConcentration_T(sim, NOW_H - 1);
        expect(Number.isFinite(c)).toBe(true);
        expect(c!).toBeGreaterThan(0);
    });

    it('steady-state mean is within an order of magnitude of the normal male range', () => {
        const sim = runSimulation(regimen(Route.oral, Ester.TU, 220, 12, 30, NOW_H - 12), BW)!;
        // Loose: oral TU should land in the hundreds of ng/dL, not 0 or 1e6.
        let s = 0, n = 0;
        for (let t = NOW_H - 24; t <= NOW_H; t += 1) {
            const c = interpolateConcentration_T(sim, t);
            if (c !== null) { s += c; n++; }
        }
        const mean = s / n;
        expect(mean).toBeGreaterThan(50);
        expect(mean).toBeLessThan(5000);
    });
});