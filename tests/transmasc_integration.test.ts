import { describe, expect, it } from 'vitest';
import { Ester, Route, integrateTransmascState, runSimulation } from '../logic';
import { BW, NOW_H, regimen } from './helpers';

describe('transmasculine state integration (Phase 2/4/5/6/7 wiring)', () => {
    it('produces finite arrays aligned with sim', () => {
        const t0 = NOW_H - 24 * 30;
        const sim = runSimulation(regimen(Route.injection, Ester.TC, 100, 168, 5, t0), BW)!;
        const r = integrateTransmascState(sim);
        expect(r.hct.length).toBe(sim.timeH.length);
        expect(r.muscle.length).toBe(sim.timeH.length);
        expect(r.viscFat.length).toBe(sim.timeH.length);
        expect(r.amenorrheaProb.length).toBe(sim.timeH.length);
        for (let i = 0; i < r.hct.length; i++) {
            expect(Number.isFinite(r.hct[i])).toBe(true);
            expect(Number.isFinite(r.muscle[i])).toBe(true);
            expect(Number.isFinite(r.viscFat[i])).toBe(true);
            expect(r.amenorrheaProb[i]).toBeGreaterThanOrEqual(0);
            expect(r.amenorrheaProb[i]).toBeLessThanOrEqual(1);
        }
    });
    it('Hct rises over time on T', () => {
        const t0 = NOW_H - 24 * 60;
        const sim = runSimulation(regimen(Route.injection, Ester.TC, 100, 168, 10, t0), BW)!;
        const r = integrateTransmascState(sim);
        expect(r.hct[r.hct.length - 1]).toBeGreaterThanOrEqual(r.hct[0]);
    });
});
