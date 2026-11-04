import { describe, expect, it } from 'vitest';
import { Ester, Route, runSimulation } from '../logic';
import { DEFAULT_SHBG_MODEL, shbgCurve } from '../shbg';
import { BW, NOW_H, dose } from './helpers';

describe('dynamic SHBG wired into SimulationResult (A2)', () => {
    it('populates shbgNM and free_dynamic when requested', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW, null, {
            swallowedE2: true,
            dynamicShbg: true,
        })!;
        expect(sim.shbgNM).toBeDefined();
        expect(sim.concPGmL_E2_free_dynamic).toBeDefined();
        expect(sim.shbgNM).toHaveLength(sim.timeH.length);
        expect(sim.concPGmL_E2_free_dynamic).toHaveLength(sim.timeH.length);
    });

    it('matches shbgCurve output', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW, null, {
            swallowedE2: true,
            dynamicShbg: true,
        })!;
        const expected = shbgCurve(sim, DEFAULT_SHBG_MODEL);
        for (let i = 0; i < sim.timeH.length; i += 10) {
            expect(Math.abs(sim.shbgNM![i] - expected[i])).toBeLessThan(1e-9);
        }
    });

    it('does not populate shbgNM when not requested', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        expect(sim.shbgNM).toBeUndefined();
        expect(sim.concPGmL_E2_free_dynamic).toBeUndefined();
    });

    it('preserves swallowed contract when dynamic not requested', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        expect(sim.concPGmL_E2_swallowed).toBeUndefined();
    });
});
