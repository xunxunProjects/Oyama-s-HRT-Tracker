import { describe, expect, it } from 'vitest';
import { Ester, Route, runSimulation } from '../logic';
import { BW, NOW_H, dose } from './helpers';

const events = [dose(Route.oral, Ester.E2, 2, NOW_H - 100)];

describe('SimulationResult aliases', () => {
    it('keeps the default body-composition and lipid aliases identical to their canonical curves', () => {
        // F-10: these aliases are part of the frozen default-result contract
        // pinned in tests/defaultSimulationContract.test.ts. Keep them in sync.
        const sim = runSimulation(events, BW)!;
        expect(sim.bodyCompM).toBe(sim.muscleM);
        expect(sim.bodyCompFVisc).toBe(sim.visceralFat);
        expect(sim.lipidLDL).toBe(sim.ldl);
    });

    it('keeps the optional aliases identical when their models are requested', () => {
        const sim = runSimulation(events, BW, null, {
            swallowedE2: true,
            dynamicShbg: true,
            testosteroneBaseline: 300,
        })!;
        expect(sim.shbgNM).toBe(sim.shbgNmolL);
        expect(sim.shbgNmolL).toBe(sim.concNM_SHBG);
        expect(sim.concPGmL_E2_free_dynamic).toBe(sim.concPGmL_E2_freeDynamic);
        expect(sim.endogenousTNgDl).toBe(sim.endogenousT_ngDl);
    });
});
