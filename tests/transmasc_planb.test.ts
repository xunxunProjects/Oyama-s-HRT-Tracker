import { describe, expect, it } from 'vitest';
import {
    Ester,
    Route,
    runSimulation,
    dhtFromTestosterone,
    endogenousBackground,
    transitCompartmentAmount,
    gnrhSuppression,
    DEFAULT_GNRH_DEPOT,
} from '../logic';
import { BW, NOW_H, dose } from './helpers';

describe('Plan B transmasculine wiring', () => {
    it('populates T bioavailable and hct arrays', () => {
        const sim = runSimulation([dose(Route.injection, Ester.TC, 100, NOW_H - 100)], BW)!;
        expect(sim.concNGdL_T_bioavailable).toBeDefined();
        expect(sim.hct).toBeDefined();
        expect(sim.amenorrheaProb).toBeDefined();
        expect(sim.tMuscle).toBeDefined();
        expect(sim.tVisceralFat).toBeDefined();
        expect(sim.dhtNgDl).toBeDefined();
        expect(sim.endogenousE2PgMl).toBeDefined();
    });
    it('bioavailable <= total', () => {
        const sim = runSimulation([dose(Route.injection, Ester.TC, 100, NOW_H - 100)], BW)!;
        const free = sim.concNGdL_T_free![sim.concNGdL_T_free!.length - 1];
        const bio = sim.concNGdL_T_bioavailable![sim.concNGdL_T_bioavailable!.length - 1];
        expect(bio).toBeGreaterThanOrEqual(free);
    });
    it('dhtFromTestosterone finite', () => {
        expect(Number.isFinite(dhtFromTestosterone(500, 0))).toBe(true);
    });
    it('transitCompartmentAmount finite', () => {
        expect(Number.isFinite(transitCompartmentAmount(10, 100, 1, 0.1, 3))).toBe(true);
    });
    it('gnrhSuppression in [0,1]', () => {
        const r = gnrhSuppression(10, DEFAULT_GNRH_DEPOT);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
    });
    it('endogenousBackground bso', () => {
        const r = endogenousBackground('bso', 0.5, 10);
        expect(r.e2Endo).toBeGreaterThan(0);
    });
});
