/**
 * Suspected problems found while writing these tests. logic.ts is left as it
 * is; each test states the behaviour we believe is correct and is marked
 * `it.fails`, so it passes while the problem is present and starts failing
 * (as a reminder to drop the marker) once someone fixes it.
 */
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PK_PARAMS,
    Ester,
    ExtraKey,
    Route,
    computeCalibration,
    getDoseAdvisory,
    interpolateConcentration_E2,
    interpolateConcentration_T,
    runSimulation,
    runSimulationWithParams,
} from '../logic';
import { BW, NOW_H, VD_E2_ML, dose, lab, regimen, relErr, scan } from './helpers';
import { upstreamE2Amount } from './reference/pkcoreUpstream';

const E2 = interpolateConcentration_E2;
// Steady-state level of one 100 µg/day estradiol patch at 70 kg, ≈ 72.6 pg/mL.
const ONE_PATCH_100 = ((0.1 / 24 / 0.41) * 1e9) / VD_E2_ML;

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
        const sim = runSimulation(
            [
                dose(Route.patchApply, Ester.E2, 0, t0, rate),
                dose(Route.patchApply, Ester.E2, 0, t0, rate),
                dose(Route.patchRemove, Ester.E2, 0, t0 + 24),
                dose(Route.patchRemove, Ester.E2, 0, t0 + 84),
            ],
            BW,
        )!;
        const onePatch = ((0.05 / 24 / 0.41) * 1e9) / VD_E2_ML; // ≈ 36 pg/mL
        // 70 h in, the first patch is long off and the second is still on. Today
        // this reads about 0 pg/mL instead of one patch's level.
        expect(relErr(interpolateConcentration_E2(sim, t0 + 70)!, onePatch)).toBeLessThan(0.01);
    });
});

describe('suspected: dense sampling around dose peaks never applies to short-acting doses', () => {
    // runSimulation() adds extra sample points 0.25-48 h after a dose, but only
    // for doses that are still contributing at the END of the grid
    // (`endTime - startTimeH > 2 * maxLifetimeH` skips the rest). The grid always
    // ends at least 14 days after the last dose, so oral and sublingual
    // estradiol doses (lifetimes of a day or two) never get the extra points;
    // gel, ester and cyproterone doses last long enough and do. With a long
    // history the grid is about one point per hour, so a sublingual peak (Tmax
    // about 1 h) is drawn up to about 7% low, and the level read off shortly
    // after a dose can be half of what the model itself says.
    const sublingualYear = (last: number) =>
        regimen(Route.sublingual, Ester.E2, 2, 24, 365, last, { [ExtraKey.sublingualTier]: 2 });

    it.fails('the most recent sublingual dose has sample points around its peak', () => {
        const last = NOW_H - 10;
        const sim = runSimulation(sublingualYear(last), BW)!;
        for (const offset of [0.25, 0.5, 1, 2]) expect(sim.timeH).toContain(last + offset);
    });

    it.fails('the current level 15 minutes after a sublingual dose matches the model', () => {
        const events = sublingualYear(NOW_H - 0.25);
        // The model's own value, summed dose by dose with the independent port of
        // upstream PKcore (tests/reference), which routes.test.ts shows agrees
        // with logic.ts to 0.1% on its grid points.
        const exact =
            (events.reduce(
                (sum, d) =>
                    sum +
                    upstreamE2Amount(
                        { route: 'sublingual', compound: 'E2', doseE2MG: d.doseMG, timeH: d.timeH, tier: 2 },
                        NOW_H,
                    ),
                0,
            ) *
                1e9) /
            VD_E2_ML;
        // Today this reads about 285 pg/mL against 568.
        expect(relErr(E2(runSimulation(events, BW)!, NOW_H)!, exact)).toBeLessThan(0.05);
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

describe('suspected: patch removals are paired with the wrong patch', () => {
    // patchRemovalTimes() hands each logged removal to the oldest patch that has
    // not had one yet (first in, first out). That breaks in three ways.

    // 1. It ignores a patch's planned wear time. Patches from a regimen carry
    //    patchWearH and come off on their own (src/utils/plan.ts), so a single
    //    logged removal gets paired with the very first patch, which then counts
    //    as worn until that removal, weeks later, on top of every newer patch.
    //    Meanwhile the patch that was actually taken off keeps delivering.
    it.fails('a removal is not paired with a patch whose planned wear already ended', () => {
        const t0 = NOW_H - 1000;
        const twiceWeekly = { [ExtraKey.releaseRateUGPerDay]: 100, [ExtraKey.patchWearH]: 84 };
        const applies = Array.from({ length: 8 }, (_, k) =>
            dose(Route.patchApply, Ester.E2, 0, t0 + 84 * k, twiceWeekly),
        );
        const sim = runSimulation([...applies, dose(Route.patchRemove, Ester.E2, 0, t0 + 628)], BW)!;
        // Today about 145 pg/mL (two patches) at t0 + 300 and one patch's level
        // (73) at t0 + 668, after the last patch came off.
        expect(relErr(E2(sim, t0 + 300)!, ONE_PATCH_100)).toBeLessThan(1e-3);
        expect(E2(sim, t0 + 668)!).toBeLessThan(ONE_PATCH_100 * 1e-3);
    });

    // 2. A removal logged at the same moment as an application, when it comes
    //    after it in the list, pairs with it; resolvePatchWearH() then ignores a
    //    zero wear time, so that patch never comes off and the next removal is
    //    used up as well. The outcome depends on list order. The 120-day window
    //    the forecast simulates (src/hooks/useAppData.ts) can produce this.
    it.fails('a removal at the same moment as an application does not depend on list order', () => {
        const t0 = NOW_H - 1000;
        const apply = dose(Route.patchApply, Ester.E2, 0, t0, { [ExtraKey.releaseRateUGPerDay]: 100 });
        const removeNow = dose(Route.patchRemove, Ester.E2, 0, t0);
        const removeLater = dose(Route.patchRemove, Ester.E2, 0, t0 + 84);
        const a = E2(runSimulation([apply, removeNow, removeLater], BW)!, t0 + 200)!;
        const b = E2(runSimulation([removeNow, apply, removeLater], BW)!, t0 + 200)!;
        // Today a is one patch's level (73 pg/mL) long after both removals; b is 0.
        expect(a).toBeLessThan(1e-3);
        expect(b).toBeLessThan(1e-3);
    });

    // 3. One unmatched removal shifts every later pairing by one. At each change
    //    the old patch comes off and a new one goes on. When the log starts with
    //    a patch already on, the first removal has no application of its own;
    //    if each removal is logged a few minutes after the new application, it
    //    is paired with the patch just put on, and the whole history reads zero.
    //    Logged a few minutes before instead, it reads correctly.
    it.fails('the order of removal and application within a change does not wipe out the history', () => {
        const t0 = NOW_H - 1000;
        const rate = { [ExtraKey.releaseRateUGPerDay]: 100 };
        const changes = (removeOffsetH: number) =>
            Array.from({ length: 6 }, (_, k) => [
                dose(Route.patchApply, Ester.E2, 0, t0 + 84 * k, rate),
                dose(Route.patchRemove, Ester.E2, 0, t0 + 84 * k + removeOffsetH),
            ]).flat();
        const removedFirst = E2(runSimulation(changes(-0.1), BW)!, t0 + 300)!;
        const removedAfter = E2(runSimulation(changes(0.1), BW)!, t0 + 300)!;
        expect(relErr(removedFirst, ONE_PATCH_100)).toBeLessThan(0.01);
        // Today `removedAfter` is 0.
        expect(relErr(removedAfter, removedFirst)).toBeLessThan(0.01);
    });
});

describe('suspected: lab calibration', () => {
    const events = regimen(Route.injection, Ester.EV, 5, 168, 10, NOW_H - 84);
    const sim = runSimulation(events, BW)!;
    const LAB_TIMES = [NOW_H - 1000, NOW_H - 800, NOW_H - 560, NOW_H - 400, NOW_H - 230, NOW_H - 100];

    // The clearance grid spans 0.5x to 2x (KMUL_MIN, KMUL_MAX), and the curve
    // drawn is the nearest grid edge, but ekfFit() and mipdFit() only clamp the
    // estimate to [0.01, 100]. Beyond the grid the predicted values stop
    // changing while fieldGSlope() still reports the edge slope, so the
    // estimate keeps drifting outward. The kMul and half-life change shown to
    // the user then describe a curve other than the one drawn.
    it.fails.each(['ekf', 'mipd'] as const)('%s reports a clearance within the range it can draw', method => {
        const truth = runSimulationWithParams(events, BW, {
            ...DEFAULT_PK_PARAMS,
            e2_kClear: DEFAULT_PK_PARAMS.e2_kClear * 3,
            e2_kClearInj: DEFAULT_PK_PARAMS.e2_kClearInj * 3,
        })!;
        const cal = computeCalibration(
            sim,
            events,
            BW,
            LAB_TIMES.map(t => lab(t, E2(truth, t)!)),
            method,
        );
        // Today ekf reports 2.41 (half-life -58%) and mipd 4.40 (-77%), while both
        // draw the 2x curve (-50%).
        expect(cal.kMul).toBeLessThanOrEqual(2 + 1e-9);
        expect(cal.kMul).toBeGreaterThanOrEqual(0.5 - 1e-9);
    });

    // In forward mode a lab should only change the curve after its own date.
    // EKF decides whether clearance may move from the TOTAL number of labs
    // (`allowClearance` in computeCalibration), so the third lab unlocks it
    // for the first two as well and rewrites the curve between them. MIPD
    // decides per prefix and is not affected. (calibration.test.ts covers the
    // case where the count was already three or more.)
    it.fails('ekf forward: adding the third lab leaves the curve before it unchanged', () => {
        const model = (t: number) => E2(sim, t)!;
        const two = LAB_TIMES.slice(0, 2).map(t => lab(t, model(t) * 2));
        const three = [...two, lab(LAB_TIMES[2], model(LAB_TIMES[2]) * 2)];
        const a = computeCalibration(sim, events, BW, two, 'ekf', 'forward');
        const b = computeCalibration(sim, events, BW, three, 'ekf', 'forward');
        // Today 10 h after the first lab the factor moves from 1.93 to 2.03.
        for (const t of [LAB_TIMES[0] + 10, LAB_TIMES[0] + 100, LAB_TIMES[1] + 10, LAB_TIMES[1] + 100]) {
            expect(b.factorFn(t)).toBeCloseTo(a.factorFn(t), 9);
        }
    });
});

describe('suspected: injection dose advisory', () => {
    // _injectionWeeklyRate() divides the LATEST injection's dose by the median
    // gap between all injections of that hormone in the last 120 days, whatever
    // the ester, and does not check when the last one was.
    const NOON = NOW_H - 12;

    it.fails('switching from weekly cypionate to undecanoate is not read as 1000 mg/week', () => {
        const events = [
            ...regimen(Route.injection, Ester.TC, 100, 168, 16, NOON - 168),
            dose(Route.injection, Ester.TU, 1000, NOON),
        ];
        expect(getDoseAdvisory(events, NOW_H)).toBeNull();
    });

    it.fails('a regimen stopped about 100 days ago raises no advisory', () => {
        expect(getDoseAdvisory(regimen(Route.injection, Ester.TE, 250, 168, 3, NOW_H - 100 * 24), NOW_H)).toBeNull();
    });
});
