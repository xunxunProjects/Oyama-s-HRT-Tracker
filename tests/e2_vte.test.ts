import { describe, expect, it } from 'vitest';
import { Ester, Route, runSimulation, vteRiskCurve, logistic } from '../logic';
import { BW, NOW_H, dose } from './helpers';

describe('VTE / coagulation risk (A8)', () => {
    it('populates vteRisk array in [0,1]', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        expect(sim.vteRisk).toBeDefined();
        expect(sim.vteRisk).toHaveLength(sim.timeH.length);
        for (const v of sim.vteRisk!) expect(v).toBeGreaterThanOrEqual(0);
        for (const v of sim.vteRisk!) expect(v).toBeLessThanOrEqual(1);
    });
    it('logistic(0)=0.5', () => {
        expect(logistic(0)).toBeCloseTo(0.5, 5);
    });
    it('vteRiskCurve length matches', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        const r = vteRiskCurve(sim);
        expect(r).toHaveLength(sim.timeH.length);
    });
});
