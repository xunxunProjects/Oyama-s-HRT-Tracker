/**
 * Suspected problems found while writing these tests. logic.ts is left as it
 * is; each test states the behaviour we believe is correct and is marked
 * `it.fails`, so it passes while the problem is present and starts failing
 * (as a reminder to drop the marker) once someone fixes it.
 */
import { describe, expect, it } from 'vitest';
import { Ester, Route, interpolateConcentration_T, runSimulation } from '../logic';
import { BW, NOW_H, regimen, relErr, scan } from './helpers';

describe('suspected: testosterone injections run below their documented targets', () => {
    // The comment above T_CorePK in logic.ts says the parameters reproduce
    // TC 100 mg/week → ≈ 600 ng/dL, TE 100 mg/week → ≈ 600 ng/dL and
    // TU 1000 mg every 12 weeks → ≈ 500 ng/dL. At 70 kg, the weight at which
    // gel (595) and patch (595) land on their own targets, the injections come
    // out at about 425, 437 and 320 ng/dL. Either the formation fractions
    // (t_ff_* = 0.025) or the comment is off.
    it.fails.each([
        [Ester.TC, 100, 168, 600],
        [Ester.TE, 100, 168, 600],
        [Ester.TU, 1000, 24 * 7 * 12, 500],
    ])('%s %i mg every %i h averages within 20%% of %i ng/dL at 70 kg', (ester, mg, everyH, target) => {
        const sim = runSimulation(regimen(Route.injection, ester, mg, everyH, 12, NOW_H - everyH), BW)!;
        const { mean } = scan(sim, interpolateConcentration_T, NOW_H - everyH, NOW_H, 0.5);
        expect(relErr(mean, target)).toBeLessThan(0.2);
    });
});
