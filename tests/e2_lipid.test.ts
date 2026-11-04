import { describe, expect, it } from 'vitest';
import { Ester, Route, runSimulation, lipidCurve, DEFAULT_LIPID_PARAMS } from '../logic';
import { BW, NOW_H, dose } from './helpers';

describe('lipid / hepatic (A5)', () => {
    it('populates ldl arrays', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        expect(sim.ldl).toBeDefined();
        expect(sim.lipidLDL).toBeDefined();
        expect(sim.ldl).toHaveLength(sim.timeH.length);
    });
    it('ldl stays finite and positive', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        for (const v of sim.ldl!) expect(Number.isFinite(v) && v >= 0).toBe(true);
    });
    it('lipidCurve length matches', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        const c = lipidCurve(sim, DEFAULT_LIPID_PARAMS);
        expect(c).toHaveLength(sim.timeH.length);
    });
});
