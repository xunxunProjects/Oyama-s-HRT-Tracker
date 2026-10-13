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
    Route,
    computeCalibration,
    getDoseAdvisory,
    interpolateConcentration_E2,
    interpolateConcentration_T,
    runSimulation,
    runSimulationWithParams,
} from '../logic';
import { BW, NOW_H, dose, lab, regimen, relErr, scan } from './helpers';

const E2 = interpolateConcentration_E2;

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
