import { describe, expect, it } from 'vitest';
import { Ester, Route, runSimulation, hpgAxisCurve, DEFAULT_HPG_PARAMS } from '../logic';
import { BW, NOW_H, dose } from './helpers';

describe('HPG axis suppression wired (A3)', () => {
    it('populates rHPG when baseline supplied', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW, null, {
            testosteroneBaselineNgDl: 500,
        })!;
        expect(sim.rHPG).toBeDefined();
        expect(sim.endogenousTNgDl).toBeDefined();
        expect(sim.rHPG).toHaveLength(sim.timeH.length);
    });

    it('rHPG stays within [0,1]', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW, null, {
            testosteroneBaselineNgDl: 500,
        })!;
        for (const v of sim.rHPG!) expect(v).toBeGreaterThanOrEqual(0);
        for (const v of sim.rHPG!) expect(v).toBeLessThanOrEqual(1);
    });

    it('endogenous T = baseline * rHPG', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW, null, {
            testosteroneBaselineNgDl: 500,
        })!;
        for (let i = 0; i < sim.timeH.length; i += 10) {
            expect(Math.abs(sim.endogenousTNgDl![i] - 500 * sim.rHPG![i])).toBeLessThan(1e-9);
        }
    });

    it('hpgAxisCurve is deterministic and finite', () => {
        const e2 = [0, 50, 200, 500];
        const t = [0, 24, 48, 72];
        const r = hpgAxisCurve(e2, t, DEFAULT_HPG_PARAMS);
        expect(r).toHaveLength(4);
        for (const v of r) expect(Number.isFinite(v)).toBe(true);
    });

    it('does not populate rHPG when not requested and no baseline', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        expect(sim.rHPG).toBeUndefined();
        expect(sim.endogenousTNgDl).toBeUndefined();
    });
});
