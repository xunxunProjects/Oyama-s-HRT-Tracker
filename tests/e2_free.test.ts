import { describe, expect, it } from 'vitest';
import { Ester, Route, runSimulation, interpolateConcentration_E2_free } from '../logic';
import { DEFAULT_BINDING, DEFAULT_SHBG_MODEL, bindEstradiol } from '../shbg';
import { BW, NOW_H, dose } from './helpers';

describe('free/bioavailable estradiol wired into SimulationResult (A1)', () => {
    it('populates concPGmL_E2_free and bioavailable arrays', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        expect(sim.concPGmL_E2_free).toBeDefined();
        expect(sim.concPGmL_E2_bioavailable).toBeDefined();
        expect(sim.concPGmL_E2_free).toHaveLength(sim.timeH.length);
        expect(sim.concPGmL_E2_bioavailable).toHaveLength(sim.timeH.length);
    });

    it('free E2 equals Vermeulen mass-action at the default SHBG baseline', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        const shbg = DEFAULT_SHBG_MODEL.baselineNM;
        for (let i = 0; i < sim.timeH.length; i += 7) {
            const expected = bindEstradiol(sim.concPGmL_E2[i], shbg, DEFAULT_BINDING).freePgML;
            expect(Math.abs(sim.concPGmL_E2_free![i] - expected)).toBeLessThan(1e-9);
        }
    });

    it('bioavailable E2 = total * (1 - fractionShbg)', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        const shbg = DEFAULT_SHBG_MODEL.baselineNM;
        for (let i = 0; i < sim.timeH.length; i += 7) {
            const b = bindEstradiol(sim.concPGmL_E2[i], shbg, DEFAULT_BINDING);
            const expected = sim.concPGmL_E2[i] * (1 - b.fractionShbg);
            expect(Math.abs(sim.concPGmL_E2_bioavailable![i] - expected)).toBeLessThan(1e-9);
        }
    });

    it('interpolateConcentration_E2_free reads the new array', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        const v = interpolateConcentration_E2_free(sim, sim.timeH[5]);
        expect(v).toBeCloseTo(sim.concPGmL_E2_free![5], 12);
    });
});
