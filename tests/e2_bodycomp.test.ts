import { describe, expect, it } from 'vitest';
import { Ester, Route, runSimulation, bodyCompCurve, DEFAULT_BODY_COMP_PARAMS, bodyCompStep } from '../logic';
import { BW, NOW_H, dose } from './helpers';

describe('body composition slow variables (A4)', () => {
    it('populates muscleM and visceralFat arrays', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        expect(sim.muscleM).toBeDefined();
        expect(sim.visceralFat).toBeDefined();
        expect(sim.muscleM).toHaveLength(sim.timeH.length);
        expect(sim.visceralFat).toHaveLength(sim.timeH.length);
    });

    it('muscle increases with sustained exposure', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 4, NOW_H - 200 * 24)], BW)!;
        const first = sim.muscleM![0];
        const last = sim.muscleM![sim.muscleM!.length - 1];
        expect(last).toBeGreaterThanOrEqual(first);
    });

    it('bodyCompCurve matches bodyCompStep integration', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        const bc = bodyCompCurve(sim, DEFAULT_BODY_COMP_PARAMS);
        expect(bc.m).toHaveLength(sim.timeH.length);
        expect(bc.fVisc).toHaveLength(sim.timeH.length);
    });

    it('bodyCompStep stays finite under fuzz', () => {
        const r = bodyCompStep(1, 1, 0.5, 1, DEFAULT_BODY_COMP_PARAMS);
        expect(Number.isFinite(r.m)).toBe(true);
        expect(Number.isFinite(r.fVisc)).toBe(true);
    });
});
