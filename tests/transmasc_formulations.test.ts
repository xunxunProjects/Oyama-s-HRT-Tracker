import { describe, expect, it } from 'vitest';
import { Ester, Route, interpolateConcentration_T, runSimulation } from '../logic';
import { BW, NOW_H, dose, regimen } from './helpers';

describe('transmasculine formulations (Phase 1.2-1.4)', () => {
    it('nasal T produces finite positive concentration', () => {
        const sim = runSimulation(regimen(Route.nasal, Ester.T, 11, 8, 30, NOW_H - 8), BW)!;
        const c = interpolateConcentration_T(sim, NOW_H - 1);
        expect(Number.isFinite(c)).toBe(true);
        expect(c!).toBeGreaterThan(0);
    });

    it('SC TE produces finite positive concentration', () => {
        const sim = runSimulation(regimen(Route.sc, Ester.TE, 100, 168, 6, NOW_H - 168), BW)!;
        const c = interpolateConcentration_T(sim, NOW_H - 1);
        expect(Number.isFinite(c)).toBe(true);
        expect(c!).toBeGreaterThan(0);
    });

    it('pellet produces finite positive concentration', () => {
        const ev = [{ id: 'pellet-1', route: Route.pellet, ester: Ester.TE, doseMG: 750, timeH: NOW_H - 24 * 30, extras: { releaseRateUGPerDay: 10000 } }];
        const sim = runSimulation(ev as any, BW)!;
        const c = interpolateConcentration_T(sim, NOW_H - 1);
        expect(Number.isFinite(c)).toBe(true);
        expect(c!).toBeGreaterThan(0);
    });
});