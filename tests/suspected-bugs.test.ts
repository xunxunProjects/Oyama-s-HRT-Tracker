/**
 * Suspected problems found while writing these tests. logic.ts is left as it
 * is; each test states the behaviour we believe is correct and is marked
 * `it.fails`, so it passes while the problem is present and starts failing
 * (as a reminder to drop the marker) once someone fixes it.
 */
import { describe, expect, it } from 'vitest';
import { Ester, ExtraKey, Route, interpolateConcentration_E2, interpolateConcentration_T, runSimulation } from '../logic';
import { BW, NOW_H, VD_E2_ML, dose, regimen, relErr, scan } from './helpers';

describe('suspected: two patches applied at the same moment', () => {
    // computeMaxLifetimeH() finds "the" patch for an apply event by matching its
    // time (`allEvents.find(e => e.route === patchApply && e.timeH === eventTimeH)`).
    // When two patches go on at the same moment it always finds the first one, so
    // the second inherits the first one's wear time when deciding how long it can
    // contribute. If the first comes off earlier, the second patch's contribution
    // is dropped from the simulation while it is still being worn.
    it.fails('the patch removed later keeps delivering after the other one comes off', () => {
        const t0 = NOW_H - 300;
        const rate = { [ExtraKey.releaseRateUGPerDay]: 50 };
        const sim = runSimulation([
            dose(Route.patchApply, Ester.E2, 0, t0, rate),
            dose(Route.patchApply, Ester.E2, 0, t0, rate),
            dose(Route.patchRemove, Ester.E2, 0, t0 + 24),
            dose(Route.patchRemove, Ester.E2, 0, t0 + 84),
        ], BW)!;
        const onePatch = 0.05 / 24 / 0.41 * 1e9 / VD_E2_ML; // ≈ 36 pg/mL
        // 70 h in, the first patch is long off and the second is still on. Today
        // this reads about 0 pg/mL instead of one patch's level.
        expect(relErr(interpolateConcentration_E2(sim, t0 + 70)!, onePatch)).toBeLessThan(0.01);
    });
});

describe('suspected: dense sampling around dose peaks never applies to short-acting doses', () => {
    // runSimulation() adds extra sample points 0.25-48 h after a dose, but only
    // for doses that are still contributing at the END of the grid
    // (`endTime - startTimeH > 2 * maxLifetimeH` skips the rest). The grid always
    // ends at least 14 days after the last dose, so oral, sublingual and gel
    // doses (lifetimes of a few days at most) never get the extra points. With a
    // long history the grid is one point per hour, and a sublingual peak (Tmax
    // about 1 h) can be missed by up to about 7% for a single dose.
    it.fails('the most recent sublingual dose has sample points around its peak', () => {
        const last = NOW_H - 10;
        const events = regimen(Route.sublingual, Ester.E2, 2, 24, 365, last, { [ExtraKey.sublingualTier]: 2 });
        const sim = runSimulation(events, BW)!;
        for (const offset of [0.25, 0.5, 1, 2]) expect(sim.timeH).toContain(last + offset);
    });
});

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
