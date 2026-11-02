import { describe, expect, it } from 'vitest';
import {
    combinedTestosteroneSuppressionFactor,
    estradiolTestosteroneSuppressionFactor,
    Ester,
    expectedTestosteroneNgDl,
    interpolateConcentration_T,
    Route,
    runSimulation,
} from '../logic';
import { BW, NOW_H, dose } from './helpers';

describe('estradiol testosterone suppression factor (adjunct to antiandrogens)', () => {
    it('no suppression at zero estradiol', () => {
        expect(estradiolTestosteroneSuppressionFactor(0)).toBe(1);
    });

    it('suppresses ~90% at 200 pg/mL estradiol', () => {
        const r = estradiolTestosteroneSuppressionFactor(200);
        expect(r).toBeGreaterThan(0.05);
        expect(r).toBeLessThan(0.2);
    });

    it('suppresses ~95% at 500 pg/mL estradiol', () => {
        const r = estradiolTestosteroneSuppressionFactor(500);
        expect(r).toBeLessThan(0.1);
        expect(r).toBeGreaterThan(0);
    });

    it('suppresses less at low estradiol', () => {
        const low = estradiolTestosteroneSuppressionFactor(50);
        const high = estradiolTestosteroneSuppressionFactor(200);
        expect(low).toBeGreaterThan(high);
    });

    it('combined factor is no larger than estradiol-only factor', () => {
        const e2 = estradiolTestosteroneSuppressionFactor(200);
        const combined = combinedTestosteroneSuppressionFactor(200, true);
        expect(combined).toBeLessThanOrEqual(e2);
    });

    it('combined factor without antiandrogen equals estradiol-only factor', () => {
        expect(combinedTestosteroneSuppressionFactor(200, false)).toBe(estradiolTestosteroneSuppressionFactor(200));
    });

    it('expected testosterone scales baseline by combined factor', () => {
        const base = 600;
        const e2 = 200;
        const expected = expectedTestosteroneNgDl(base, e2, false);
        expect(expected).toBeCloseTo(base * estradiolTestosteroneSuppressionFactor(e2), 6);
    });
});

describe('optional endogenous testosterone suppression in runSimulation', () => {
    it('is off by default: no baseline keeps T curve at 0 without T doses', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 10)], BW)!;
        const t = NOW_H - 7;
        expect(interpolateConcentration_T(sim, t)).toBe(0);
    });

    it('anchors T curve to a supplied baseline', () => {
        const baseline = 600;
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 10)], BW, null, {
            testosteroneBaselineNgDl: baseline,
        })!;
        const t = NOW_H - 7;
        const val = interpolateConcentration_T(sim, t)!;
        expect(val).toBeGreaterThan(0);
        expect(val).toBeLessThan(baseline);
    });

    it('antiandrogen flag pushes the anchored T curve lower', () => {
        const baseline = 600;
        const without = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 10)], BW, null, {
            testosteroneBaselineNgDl: baseline,
        })!;
        const withAA = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 10)], BW, null, {
            testosteroneBaselineNgDl: baseline,
            antiandrogen: true,
        })!;
        const t = NOW_H - 7;
        expect(interpolateConcentration_T(withAA, t)!).toBeLessThanOrEqual(interpolateConcentration_T(without, t)!);
    });
});
