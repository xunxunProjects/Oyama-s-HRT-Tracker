/**
 * Problems found while writing these tests and since fixed. Each test pins the
 * corrected behaviour, so the problem cannot come back unnoticed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
    type CalibrationResult,
    DEFAULT_PK_PARAMS,
    Ester,
    ExtraKey,
    Route,
    applyPKOverrides,
    computeCalibration,
    getBioavailabilityMultiplier,
    getDoseAdvisory,
    getHormoneLevelAdvisory,
    getToE2Factor,
    interpolateConcentration_E2,
    interpolateConcentration_T,
    runSimulation,
    runSimulationWithParams,
    sanitizePKParams,
    sublingualHoldFromTheta,
    sublingualThetaFromHold,
} from '../logic';
import { BW, NOW_H, VD_E2_ML, dose, lab, regimen, relErr, scan } from './helpers';

const E2 = interpolateConcentration_E2;
// Steady-state level of one 100 µg/day estradiol patch at 70 kg, ≈ 72.6 pg/mL.
const ONE_PATCH_100 = ((0.1 / 24 / 0.41) * 1e9) / VD_E2_ML;

describe('patch removals end the patch that is actually on', () => {
    // A removal says nothing about which patch it ends, so the engine pairs it
    // with the oldest patch of the same hormone that is plausibly still on:
    // applied at least an hour earlier and not already ended by its planned wear
    // (allowing a day's grace for a removal logged late).

    it('two patches applied at the same moment each keep their own removal', () => {
        // The lifetime lookup used to find a patch by its time, so the second of
        // two patches put on together inherited the first one's wear and was
        // dropped from the simulation while still worn.
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
        expect(relErr(E2(sim, t0 + 70)!, onePatch)).toBeLessThan(0.01);
        expect(E2(sim, t0 + 150)!).toBeLessThan(onePatch * 1e-6);
    });

    it('a removal is not paired with a patch whose planned wear already ended', () => {
        // Patches from a regimen carry patchWearH and come off on their own. One
        // early removal of the current patch used to be handed to the very first
        // patch in the history, which then counted as worn for weeks.
        const t0 = NOW_H - 1000;
        const twiceWeekly = { [ExtraKey.releaseRateUGPerDay]: 100, [ExtraKey.patchWearH]: 84 };
        const applies = Array.from({ length: 8 }, (_, k) =>
            dose(Route.patchApply, Ester.E2, 0, t0 + 84 * k, twiceWeekly),
        );
        const sim = runSimulation([...applies, dose(Route.patchRemove, Ester.E2, 0, t0 + 628)], BW)!;
        expect(relErr(E2(sim, t0 + 300)!, ONE_PATCH_100)).toBeLessThan(1e-3);
        expect(relErr(E2(sim, t0 + 620)!, ONE_PATCH_100)).toBeLessThan(1e-3);
        expect(E2(sim, t0 + 668)!).toBeLessThan(ONE_PATCH_100 * 1e-3);
    });

    it('a removal logged a little after the planned end still ends the old patch, not the new one', () => {
        const t0 = NOW_H - 1000;
        const wear = { [ExtraKey.releaseRateUGPerDay]: 100, [ExtraKey.patchWearH]: 84 };
        const sim = runSimulation(
            [
                dose(Route.patchApply, Ester.E2, 0, t0, wear),
                dose(Route.patchApply, Ester.E2, 0, t0 + 84, wear),
                dose(Route.patchRemove, Ester.E2, 0, t0 + 86), // the old one, logged 2 h late
            ],
            BW,
        )!;
        // The new patch keeps delivering until its own planned end.
        expect(relErr(E2(sim, t0 + 160)!, ONE_PATCH_100)).toBeLessThan(1e-3);
        expect(E2(sim, t0 + 220)!).toBeLessThan(ONE_PATCH_100 * 1e-3);
    });

    it('a removal long after the planned end still ends a patch left on, as an explicit removal takes precedence', () => {
        // Someone who forgot to change a patch logs its removal a day or more
        // late. The plan-based match skips it, and this removal used to be
        // dropped, so the patch read as off from its planned end.
        const t0 = NOW_H - 1000;
        const wear = { [ExtraKey.releaseRateUGPerDay]: 100, [ExtraKey.patchWearH]: 84 };
        for (const lateH of [30, 216]) {
            const sim = runSimulation(
                [dose(Route.patchApply, Ester.E2, 0, t0, wear), dose(Route.patchRemove, Ester.E2, 0, t0 + 84 + lateH)],
                BW,
            )!;
            expect(relErr(E2(sim, t0 + 84 + lateH - 2)!, ONE_PATCH_100)).toBeLessThan(0.01);
            expect(E2(sim, t0 + 84 + lateH + 72)!).toBeLessThan(ONE_PATCH_100 * 1e-3);
        }
    });

    it('a late removal does not reach back past a newer patch', () => {
        // A was replaced by B; both planned 84 h. A removal 30 h after B's plan
        // ended goes to B. A keeps its planned end.
        const t0 = NOW_H - 1000;
        const wear = { [ExtraKey.releaseRateUGPerDay]: 100, [ExtraKey.patchWearH]: 84 };
        const sim = runSimulation(
            [
                dose(Route.patchApply, Ester.E2, 0, t0, wear),
                dose(Route.patchApply, Ester.E2, 0, t0 + 84, wear),
                dose(Route.patchRemove, Ester.E2, 0, t0 + 168 + 30),
            ],
            BW,
        )!;
        expect(relErr(E2(sim, t0 + 120)!, ONE_PATCH_100)).toBeLessThan(0.01);
        expect(relErr(E2(sim, t0 + 190)!, ONE_PATCH_100)).toBeLessThan(0.01);
    });

    it('a removal weeks after the planned end is ignored', () => {
        // Logged to close out a patch after a pause or a change of route, it
        // used to keep the patch delivering through the whole gap.
        const t0 = NOW_H - 2000;
        const wear = { [ExtraKey.releaseRateUGPerDay]: 100, [ExtraKey.patchWearH]: 84 };
        const sim = runSimulation(
            [dose(Route.patchApply, Ester.E2, 0, t0, wear), dose(Route.patchRemove, Ester.E2, 0, t0 + 84 + 21 * 24)],
            BW,
        )!;
        expect(E2(sim, t0 + 84 + 72)!).toBeLessThan(ONE_PATCH_100 * 1e-3);
    });

    it('restarting after a break, with the old removal logged next to the new patch, does not fill the break', () => {
        const t0 = NOW_H - 2000;
        const wear = { [ExtraKey.releaseRateUGPerDay]: 100, [ExtraKey.patchWearH]: 84 };
        const restartH = t0 + 84 + 21 * 24;
        for (const removalAfterH of [-1 / 6, 0, 1 / 6]) {
            const sim = runSimulation(
                [
                    dose(Route.patchApply, Ester.E2, 0, t0, wear),
                    dose(Route.patchApply, Ester.E2, 0, restartH, wear),
                    dose(Route.patchRemove, Ester.E2, 0, restartH + removalAfterH),
                ],
                BW,
            )!;
            expect(E2(sim, t0 + 84 + 10 * 24)!).toBeLessThan(ONE_PATCH_100 * 1e-3);
            expect(relErr(E2(sim, restartH + 60)!, ONE_PATCH_100)).toBeLessThan(0.01);
        }
    });

    it('one removal for two patches put on together ends the same one however late it is logged', () => {
        // A 100 and a 50 µg/day patch, both planned for 84 h. A removal within
        // the day's grace and one past it used to end different patches.
        const t0 = NOW_H - 1000;
        const plan = { [ExtraKey.patchWearH]: 84 };
        for (const removeH of [100, 150]) {
            const sim = runSimulation(
                [
                    dose(Route.patchApply, Ester.E2, 0, t0, { ...plan, [ExtraKey.releaseRateUGPerDay]: 100 }),
                    dose(Route.patchApply, Ester.E2, 0, t0, { ...plan, [ExtraKey.releaseRateUGPerDay]: 50 }),
                    dose(Route.patchRemove, Ester.E2, 0, t0 + removeH),
                ],
                BW,
            )!;
            expect(relErr(E2(sim, t0 + removeH - 2)!, ONE_PATCH_100 / 2)).toBeLessThan(0.01);
        }
    });

    it('a removal naming neither hormone gives the same curves in any input order', () => {
        // Possible in an imported file: a removal carrying cyproterone at the same
        // moment as an estradiol removal.
        const t0 = NOW_H - 1000;
        const plan = { [ExtraKey.releaseRateUGPerDay]: 100, [ExtraKey.patchWearH]: 84 };
        const events = [
            dose(Route.patchApply, Ester.E2, 0, t0, plan),
            dose(Route.patchApply, Ester.T, 0, t0 + 1, plan),
            dose(Route.patchRemove, Ester.CPA, 0, t0 + 50),
            dose(Route.patchRemove, Ester.E2, 0, t0 + 50),
        ];
        const a = runSimulation(events, BW)!;
        const b = runSimulation([...events].reverse(), BW)!;
        for (const h of [40, 60, 80]) {
            expect(E2(b, t0 + h)).toBe(E2(a, t0 + h));
            expect(interpolateConcentration_T(b, t0 + h)).toBe(interpolateConcentration_T(a, t0 + h));
        }
    });

    it('a removal at the same moment as an application does not depend on list order', () => {
        // Such a removal used to pair with the application, be rejected for its
        // zero wear, and leave the patch on forever. The forecast's 120-day
        // window cuts histories in a way that produces exactly this.
        const t0 = NOW_H - 1000;
        const apply = dose(Route.patchApply, Ester.E2, 0, t0, { [ExtraKey.releaseRateUGPerDay]: 100 });
        const removeNow = dose(Route.patchRemove, Ester.E2, 0, t0);
        const removeLater = dose(Route.patchRemove, Ester.E2, 0, t0 + 84);
        for (const order of [
            [apply, removeNow, removeLater],
            [removeNow, apply, removeLater],
            [removeLater, removeNow, apply],
        ]) {
            const sim = runSimulation(order, BW)!;
            expect(relErr(E2(sim, t0 + 60)!, ONE_PATCH_100)).toBeLessThan(1e-3);
            expect(E2(sim, t0 + 200)!).toBeLessThan(1e-3);
        }
    });

    it('the order of removal and application within a change does not wipe out the history', () => {
        // When the log starts with a patch already on, its removal has no
        // application of its own. Logged a few minutes after the new patch went
        // on, it used to be paired with that new patch and shift every later
        // pairing by one, so the whole history read zero.
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
        expect(relErr(removedAfter, removedFirst)).toBeLessThan(0.01);
    });

    it('several patches put on together give the same curve in any input order', () => {
        const t0 = NOW_H - 500;
        const events = [
            dose(Route.patchApply, Ester.E2, 0, t0, { [ExtraKey.releaseRateUGPerDay]: 50, [ExtraKey.patchWearH]: 84 }),
            dose(Route.patchApply, Ester.E2, 0, t0, { [ExtraKey.releaseRateUGPerDay]: 100 }),
            dose(Route.patchApply, Ester.E2, 0, t0, { [ExtraKey.releaseRateUGPerDay]: 25, [ExtraKey.patchWearH]: 168 }),
            dose(Route.patchRemove, Ester.E2, 0, t0 + 50),
            dose(Route.patchRemove, Ester.E2, 0, t0 + 120),
        ];
        const reference = runSimulation(events, BW)!;
        for (const order of [[...events].reverse(), [events[2], events[4], events[0], events[3], events[1]]]) {
            const sim = runSimulation(order, BW)!;
            for (const t of [t0 + 10, t0 + 60, t0 + 100, t0 + 150, t0 + 250]) {
                expect(E2(sim, t)).toBeCloseTo(E2(reference, t)!, 9);
            }
        }
    });

    it('a testosterone patch removal does not end an estradiol patch', () => {
        const t0 = NOW_H - 500;
        const sim = runSimulation(
            [
                dose(Route.patchApply, Ester.E2, 0, t0, { [ExtraKey.releaseRateUGPerDay]: 100 }),
                dose(Route.patchApply, Ester.T, 0, t0, { [ExtraKey.releaseRateUGPerDay]: 5000 }),
                dose(Route.patchRemove, Ester.T, 0, t0 + 24),
            ],
            BW,
        )!;
        expect(relErr(E2(sim, t0 + 200)!, ONE_PATCH_100)).toBeLessThan(1e-3);
        const tAt24 = interpolateConcentration_T(sim, t0 + 24)!;
        expect(tAt24).toBeGreaterThan(0);
        expect(interpolateConcentration_T(sim, t0 + 200)!).toBeLessThan(tAt24 * 1e-6);
    });
});

describe('short-acting doses are sampled around their peaks', () => {
    // Extra sample points after a dose used to be added only for doses still
    // contributing at the end of the grid, which excluded every oral and
    // sublingual estradiol dose. On a long history (about one grid point per
    // hour) a sublingual peak was drawn up to about 7% low, and the level read
    // 15 minutes after a dose was about half the model's value.
    const sublingualYear = (last: number) =>
        regimen(Route.sublingual, Ester.E2, 2, 24, 365, last, { [ExtraKey.sublingualTier]: 2 });

    it('the most recent sublingual dose has sample points around its peak', () => {
        const last = NOW_H - 10;
        const sim = runSimulation(sublingualYear(last), BW)!;
        for (const offset of [0.25, 0.5, 1, 2]) expect(sim.timeH).toContain(last + offset);
    });

    it('the current time is a sample point', () => {
        const sim = runSimulation(sublingualYear(NOW_H - 5.3), BW)!;
        expect(sim.timeH).toContain(NOW_H);
    });

    it('the level 15 minutes after a sublingual dose on a long history matches a short history', () => {
        // Earlier days contribute nothing measurable after a few days, so the
        // last week alone, simulated on its own much finer grid, is the reference.
        const events = sublingualYear(NOW_H - 0.25);
        const long = E2(runSimulation(events, BW)!, NOW_H)!;
        const short = E2(runSimulation(events.slice(-7), BW)!, NOW_H)!;
        expect(relErr(long, short)).toBeLessThan(1e-3);
    });

    it.each([
        ['sublingual', Route.sublingual],
        ['oral', Route.oral],
    ] as const)('a %s peak on a year-long history matches the same peak on a short history', (_name, route) => {
        const last = NOW_H - 30;
        const events = regimen(route, Ester.E2, 2, 24, 365, last, { [ExtraKey.sublingualTier]: 2 });
        const long = scan(runSimulation(events, BW)!, E2, last, last + 6, 0.01).cmax;
        const short = scan(runSimulation(events.slice(-7), BW)!, E2, last, last + 6, 0.01).cmax;
        expect(relErr(long, short)).toBeLessThan(0.01);
    });
});

describe('lab calibration reports and draws the same thing', () => {
    const events = regimen(Route.injection, Ester.EV, 5, 168, 10, NOW_H - 84);
    const sim = runSimulation(events, BW)!;
    const model = (t: number) => E2(sim, t)!;
    const LAB_TIMES = [NOW_H - 1000, NOW_H - 800, NOW_H - 560, NOW_H - 400, NOW_H - 230, NOW_H - 100];
    const withClearance = (mul: number) =>
        runSimulationWithParams(events, BW, {
            ...DEFAULT_PK_PARAMS,
            e2_kClear: DEFAULT_PK_PARAMS.e2_kClear * mul,
            e2_kClearInj: DEFAULT_PK_PARAMS.e2_kClearInj * mul,
        })!;
    const curveRmsPct = (cal: CalibrationResult) => {
        const sse = cal.points.reduce((acc, p) => acc + Math.log(p.obs / (p.pred * cal.factorFn(p.timeH))) ** 2, 0);
        return (Math.exp(Math.sqrt(sse / cal.points.length)) - 1) * 100;
    };

    it.each(['ekf', 'mipd'] as const)('%s reports a clearance within the range it can draw', method => {
        // The estimate used to drift past the 0.5x-2x grid: labs from a 3x
        // clearance gave ekf 2.41 and mipd 4.40 while both drew the 2x curve.
        const truth = withClearance(3);
        const cal = computeCalibration(
            sim,
            events,
            BW,
            LAB_TIMES.map(t => lab(t, E2(truth, t)!)),
            method,
        );
        expect(cal.kMul).toBeLessThanOrEqual(2 + 1e-9);
        expect(cal.kMul).toBeGreaterThanOrEqual(0.5 - 1e-9);
        expect(cal.halfLifeDeltaPct).toBeCloseTo((1 / cal.kMul - 1) * 100, 9);
    });

    it.each(['ekf', 'mipd'] as const)('%s draws the curve of the clearance it reports', method => {
        // The drawn curve used to snap to the nearest grid knot while the fit
        // used the interpolated clearance. Compare with a fresh simulation at the
        // reported clearance, which the knot interpolation approximates closely.
        const truth = withClearance(1.37);
        const cal = computeCalibration(
            sim,
            events,
            BW,
            LAB_TIMES.map(t => lab(t, E2(truth, t)! * 1.1)),
            method,
        );
        expect(cal.kMul).toBeGreaterThan(1.05);
        const atReported = withClearance(cal.kMul);
        for (const t of [...LAB_TIMES, NOW_H - 300, NOW_H - 20]) {
            const drawn = model(t) * cal.factorFn(t);
            expect(relErr(drawn, E2(atReported, t)! * cal.scale)).toBeLessThan(0.01);
        }
    });

    it('ekf forward: adding the third lab leaves the curve before it unchanged', () => {
        // Clearance used to be unlocked from the total number of labs, so the
        // third lab rewrote the segments after the first two.
        const two = LAB_TIMES.slice(0, 2).map(t => lab(t, model(t) * 2));
        const three = [...two, lab(LAB_TIMES[2], model(LAB_TIMES[2]) * 2)];
        const a = computeCalibration(sim, events, BW, two, 'ekf', 'forward');
        const b = computeCalibration(sim, events, BW, three, 'ekf', 'forward');
        for (const t of [LAB_TIMES[0] + 10, LAB_TIMES[0] + 100, LAB_TIMES[1] + 10, LAB_TIMES[1] + 100]) {
            expect(b.factorFn(t)).toBeCloseTo(a.factorFn(t), 9);
        }
    });

    it('ekf leaves the curve on labs that match the model', () => {
        // A Jensen term used to lift the curve up to about 7% above such labs.
        for (const labs of [LAB_TIMES.slice(-1), LAB_TIMES.slice(-2), LAB_TIMES]) {
            const cal = computeCalibration(
                sim,
                events,
                BW,
                labs.map(t => lab(t, model(t))),
                'ekf',
            );
            for (const t of labs) expect(Math.abs(cal.factorFn(t) - 1)).toBeLessThan(0.005);
        }
    });

    it('mipd: a higher single lab never gives a lower curve', () => {
        // With one lab the robust likelihood used to discount a lab that was far
        // from the model, so the fitted level fell as the lab rose.
        let previous = 0;
        for (const ratio of [0.05, 0.1, 0.2, 0.5, 1, 2, 3, 5, 10, 20]) {
            const cal = computeCalibration(sim, events, BW, [lab(NOW_H - 100, model(NOW_H - 100) * ratio)], 'mipd');
            expect(cal.scale).toBeGreaterThan(previous);
            previous = cal.scale;
        }
    });

    it.each(['ekf', 'mipd'] as const)('%s: labs drawn at the same moment do not move clearance', method => {
        const t = NOW_H - 100;
        const labs = [lab(t, model(t) * 1.5), lab(t + 0.5, model(t + 0.5) * 1.4), lab(t + 1, model(t + 1) * 1.6)];
        const cal = computeCalibration(sim, events, BW, labs, method);
        expect(cal.kMul).toBe(1);
        expect(cal.halfLifeDeltaPct).toBe(0);
    });

    it.each(['ekf', 'mipd'] as const)('%s: a run of labs a few hours apart counts as several draws', method => {
        // Labs every 5 h used to chain into one cluster however long the run,
        // so four draws over 15 h, then two more days later, could not move
        // clearance while the same labs 24 h apart could.
        const truth = withClearance(1.6);
        const times = [NOW_H - 300, NOW_H - 295, NOW_H - 290, NOW_H - 285, NOW_H - 120, NOW_H - 115];
        const cal = computeCalibration(
            sim,
            events,
            BW,
            times.map(t => lab(t, E2(truth, t)!)),
            method,
        );
        expect(cal.kMul).toBeGreaterThan(1.2);
    });

    it.each([
        ['ekf', 'forward'],
        ['ekf', 'retrospective'],
        ['mipd', 'forward'],
        ['mipd', 'retrospective'],
        ['ou_kalman', 'forward'],
        ['ou_kalman', 'retrospective'],
    ] as const)('%s %s: the reported fit error describes the drawn curve', (method, mode) => {
        const truth = withClearance(1.4);
        const labs = LAB_TIMES.map((t, i) => lab(t, E2(truth, t)! * (i % 2 ? 1.3 : 0.9)));
        const cal = computeCalibration(sim, events, BW, labs, method, mode);
        expect(cal.fitErrPct).not.toBeNull();
        expect(cal.fitErrPct!).toBeCloseTo(curveRmsPct(cal), 9);
    });
});

describe('dose advisory reads each regimen as it is taken', () => {
    const NOON = NOW_H - 12;

    it('switching from weekly cypionate to undecanoate is not read as 1000 mg/week', () => {
        // The weekly rate used to divide the latest injection, whatever its
        // ester, by the median gap of every injection of that hormone.
        const events = [
            ...regimen(Route.injection, Ester.TC, 100, 168, 16, NOON - 168),
            dose(Route.injection, Ester.TU, 1000, NOON),
        ];
        expect(getDoseAdvisory(events, NOW_H)).toBeNull();
    });

    it('switching esters at the same weekly dose is not counted twice', () => {
        const events = [
            ...regimen(Route.injection, Ester.TE, 150, 168, 8, NOON - 2 * 168),
            ...regimen(Route.injection, Ester.TC, 150, 168, 2, NOON),
        ];
        expect(getDoseAdvisory(events, NOW_H)).toBeNull();
    });

    it('esters taken side by side add up', () => {
        const side = (mg: number) => [
            ...regimen(Route.injection, Ester.EV, mg, 168, 4, NOON),
            ...regimen(Route.injection, Ester.EC, mg, 168, 4, NOON - 84),
        ];
        expect(getDoseAdvisory(side(8), NOW_H)).toBeNull();
        expect(getDoseAdvisory(side(12), NOW_H)).toEqual({ kind: 'e2' });
    });

    it('going back to an earlier ester is not counted on top of the one in between', () => {
        // The return was not seen as a switch, as the earlier ester had started
        // before the other one ended, so both were summed (220 mg/week).
        const events = [
            ...regimen(Route.injection, Ester.TC, 110, 168, 10, NOON - 3 * 168),
            ...regimen(Route.injection, Ester.TE, 110, 168, 2, NOON - 168),
            dose(Route.injection, Ester.TC, 110, NOON),
        ];
        expect(getDoseAdvisory(events, NOW_H)).toBeNull();
    });

    it('a regimen still counts until the ester replacing it has shown its own cadence', () => {
        // 15 mg every 3.5 days (30 mg/week), then one injection of another ester.
        // The old ester used to be dropped at once, and the new one, with no gap
        // to read yet, added nothing.
        const events = [
            ...regimen(Route.injection, Ester.EV, 15, 84, 6, NOON - 84),
            dose(Route.injection, Ester.EC, 15, NOON),
        ];
        expect(getDoseAdvisory(events, NOW_H)).toEqual({ kind: 'e2' });
    });

    it('a shorter injection interval shows within a few injections', () => {
        // 100 mg weekly for four months, then every 3 days (about 233 mg/week).
        // The median of every gap in 120 days took about five weeks to move.
        const events = [
            ...regimen(Route.injection, Ester.TE, 100, 168, 17, NOON - 3 * 72),
            ...regimen(Route.injection, Ester.TE, 100, 72, 3, NOON),
        ];
        expect(getDoseAdvisory(events, NOW_H)).toEqual({ kind: 't' });
    });

    it('a Monday and Thursday rhythm reads as twice a week in either phase', () => {
        // Gaps alternate 72 h and 96 h. 9 mg twice a week is 18 mg/week, under the
        // 20 mg ceiling; when the middle gap was 72 h it read as 21.
        const monThu = (lastGapH: number) => {
            const times = [NOON];
            for (let i = 0; i < 9; i++) times.unshift(times[0] - (i % 2 ? 168 - lastGapH : lastGapH));
            return times.map(t => dose(Route.injection, Ester.EV, 9, t));
        };
        expect(getDoseAdvisory(monThu(72), NOW_H)).toBeNull();
        expect(getDoseAdvisory(monThu(96), NOW_H)).toBeNull();
    });

    it('a regimen stopped about 100 days ago raises no advisory', () => {
        expect(getDoseAdvisory(regimen(Route.injection, Ester.TE, 250, 168, 3, NOW_H - 100 * 24), NOW_H)).toBeNull();
    });

    it('a regimen still counts after one late injection, not after two missed ones', () => {
        expect(getDoseAdvisory(regimen(Route.injection, Ester.TE, 250, 168, 6, NOW_H - 10 * 24), NOW_H)).toEqual({
            kind: 't',
        });
        expect(getDoseAdvisory(regimen(Route.injection, Ester.TE, 250, 168, 6, NOW_H - 15 * 24), NOW_H)).toBeNull();
    });

    it('one dose split across two sites counts once', () => {
        // Two 50 mg shots an hour apart every week used to give a median gap of
        // one hour, read as 8400 mg/week.
        const split = (mg: number) =>
            Array.from({ length: 6 }, (_, i) => [
                dose(Route.injection, Ester.TC, mg, NOON - 168 * i - 1),
                dose(Route.injection, Ester.TC, mg, NOON - 168 * i),
            ]).flat();
        expect(getDoseAdvisory(split(50), NOW_H)).toBeNull();
        expect(getDoseAdvisory(split(150), NOW_H)).toEqual({ kind: 't' });
        // The single-dose guard sees the whole split dose too.
        expect(
            getDoseAdvisory(
                [dose(Route.injection, Ester.EU, 30, NOON - 1), dose(Route.injection, Ester.EU, 30, NOON)],
                NOW_H,
            ),
        ).toEqual({ kind: 'e2' });
    });
});

describe('dose advisory counts patches by what they deliver', () => {
    const NOON = NOW_H - 12;
    const rate = (ug: number) => ({ [ExtraKey.releaseRateUGPerDay]: ug });

    it('a patch logged by its reservoir is not added to oral milligrams', () => {
        // Two patches holding 7.6 mg each deliver about 200 µg/day; their
        // reservoirs used to count as 15.2 mg of estradiol taken that day.
        const events = [
            dose(Route.oral, Ester.E2, 6, NOON),
            dose(Route.patchApply, Ester.E2, 7.6, NOON),
            dose(Route.patchApply, Ester.E2, 7.6, NOON),
        ];
        expect(getDoseAdvisory(events, NOW_H)).toBeNull();
    });

    it('flags patches delivering more than 600 µg/day at once', () => {
        const patches = (n: number) =>
            Array.from({ length: n }, () => dose(Route.patchApply, Ester.E2, 0, NOON, rate(100)));
        expect(getDoseAdvisory(patches(6), NOW_H)).toBeNull();
        expect(getDoseAdvisory(patches(7), NOW_H)).toEqual({ kind: 'e2' });
    });

    it('a patch change is not counted as two patches', () => {
        // 400 µg/day changed twice a week, each removal logged at the moment
        // the next patch goes on.
        const events = Array.from({ length: 5 }, (_, i) => {
            const t = NOON - 84 * (4 - i);
            return [dose(Route.patchRemove, Ester.E2, 0, t), dose(Route.patchApply, Ester.E2, 0, t, rate(400))];
        })
            .flat()
            .slice(1);
        expect(getDoseAdvisory(events, NOW_H)).toBeNull();
    });

    it('a changeover that overlaps for minutes is not counted as two patches for the day', () => {
        // 400 µg/day changed every 84 h. The check used to take the rate at the
        // moment each patch went on, so any overlap doubled it.
        const removalAfter = Array.from({ length: 5 }, (_, i) => {
            const t = NOON - 84 * (4 - i);
            return [
                dose(Route.patchApply, Ester.E2, 0, t, { ...rate(400), [ExtraKey.patchWearH]: 84 }),
                dose(Route.patchRemove, Ester.E2, 0, t + 84 + 1 / 60),
            ];
        }).flat();
        expect(getDoseAdvisory(removalAfter, NOW_H)).toBeNull();

        // No removals, each new patch on 30 minutes before the old one's plan ends.
        const early = regimen(Route.patchApply, Ester.E2, 0, 83.5, 5, NOON, {
            ...rate(400),
            [ExtraKey.patchWearH]: 84,
        });
        expect(getDoseAdvisory(early, NOW_H)).toBeNull();
    });

    it('switching from tablets in the morning to a patch at night is not a full day of both', () => {
        // 6 mg oral at 08:00 for ten days, the last on the day the first
        // 400 µg/day patch goes on at 23:00. That day used to count its tablets
        // plus everything the patch delivers over the next 24 h.
        const D = NOW_H - 5 * 24; // a UTC midnight
        const events = [
            ...regimen(Route.oral, Ester.E2, 6, 24, 10, D + 8),
            ...regimen(Route.patchApply, Ester.E2, 0, 84, 2, D + 23 + 84, {
                ...rate(400),
                [ExtraKey.patchWearH]: 84,
            }),
        ];
        expect(getDoseAdvisory(events, NOW_H)).toBeNull();
        // The same doses on one full day still add up.
        expect(getDoseAdvisory([...events, dose(Route.oral, Ester.E2, 6, D + 24 + 8)], NOW_H)).toEqual({ kind: 'e2' });
    });

    it('a patch with no removal logged is not assumed to stay on', () => {
        // Twice-weekly 400 µg/day patches with no removals in the log.
        expect(getDoseAdvisory(regimen(Route.patchApply, Ester.E2, 0, 84, 5, NOON, rate(400)), NOW_H)).toBeNull();
    });

    it('oral and patch doses add up as shares of their own ceilings', () => {
        const events = [
            dose(Route.patchApply, Ester.E2, 0, NOON - 48, { ...rate(400), [ExtraKey.patchWearH]: 84 }),
            dose(Route.oral, Ester.E2, 8, NOON),
        ];
        expect(getDoseAdvisory(events, NOW_H)).toEqual({ kind: 'e2' });
        expect(getDoseAdvisory([events[0], dose(Route.oral, Ester.E2, 4, NOON)], NOW_H)).toBeNull();
    });
});

describe('dose advisory groups doses by local calendar day', () => {
    const DAY = NOW_H - 48; // a UTC midnight

    afterEach(() => {
        process.env.TZ = 'UTC';
    });

    it('two doses on one UTC day but different local days are not summed', () => {
        process.env.TZ = 'Asia/Shanghai';
        // 22:00 and 07:00 the next morning in Shanghai.
        const events = [dose(Route.oral, Ester.E2, 8, DAY + 14), dose(Route.oral, Ester.E2, 8, DAY + 23)];
        expect(getDoseAdvisory(events, NOW_H)).toBeNull();
    });

    it('two doses on one local evening are summed across UTC midnight', () => {
        process.env.TZ = 'America/New_York';
        // 19:00 and 21:00 the same evening in New York (UTC−4 in October).
        const events = [dose(Route.oral, Ester.E2, 7, DAY + 23), dose(Route.oral, Ester.E2, 7, DAY + 25)];
        expect(getDoseAdvisory(events, NOW_H)).toEqual({ kind: 'e2' });
    });
});

describe('lab advisory pairs the two hormones deterministically', () => {
    it('labs logged at the same moment are averaged, whatever their order', () => {
        // The latest lab used to be whichever same-time lab came first in the list.
        const e2 = [lab(10, 20), lab(10, 50)];
        const t = lab(10, 30, 'ng/dl');
        expect(getHormoneLevelAdvisory([...e2, t])).toBeNull();
        expect(getHormoneLevelAdvisory([e2[1], e2[0], t])).toBeNull();
        expect(getHormoneLevelAdvisory([lab(10, 20), lab(10, 30), t])).toEqual({ kind: 'both_low' });
    });

    it('labs drawn more than 30 days apart are not read as one moment', () => {
        expect(getHormoneLevelAdvisory([lab(0, 20), lab(29 * 24, 30, 'ng/dl')])).toEqual({ kind: 'both_low' });
        expect(getHormoneLevelAdvisory([lab(0, 20), lab(31 * 24, 30, 'ng/dl')])).toBeNull();
    });
});

describe('the dose kernels stay exact when two rates meet', () => {
    // The three-exponential closed form divides by differences of rates. It used
    // to nudge equal rates a millionth apart, which kept it finite but off by up
    // to about 1e-4 of the value: more than the curve moves when the rate itself
    // changes by 1e-4. Testosterone enanthate's absorption and elimination rates
    // are equal by default; the other two cases need a custom elimination rate.
    afterEach(() => applyPKOverrides(null));

    const at = (events: ReturnType<typeof dose>[], read: typeof E2, hours: number[]) => {
        const sim = runSimulation(events, BW)!;
        return hours.map(h => read(sim, events[0].timeH + h)!);
    };
    const HOURS = [0.25, 0.5, 1, 2, 4, 8, 24, 72];

    it.each([
        ['testosterone enanthate at the default elimination rate', Ester.TE, 't_kClearInj', 0.035],
        ['estradiol benzoate with elimination set to its hydrolysis rate', Ester.EB, 'e2_kClearInj', 0.09],
        ['estradiol valerate with elimination set to its absorption rate', Ester.EV, 'e2_kClearInj', 0.0216],
    ] as const)('%s lies between its neighbours', (_label, ester, key, k) => {
        const read = ester === Ester.TE ? interpolateConcentration_T : E2;
        const events = [dose(Route.injection, ester, 5, NOW_H - 200)];
        const curve = (kk: number) => {
            applyPKOverrides({ ...DEFAULT_PK_PARAMS, [key]: kk });
            return at(events, read, HOURS);
        };
        const lo = curve(k * (1 - 1e-4));
        const mid = curve(k);
        const hi = curve(k * (1 + 1e-4));
        mid.forEach((v, i) => {
            expect(v).toBeGreaterThan(0);
            expect(v).toBeLessThanOrEqual(Math.max(lo[i], hi[i]) * (1 + 1e-12));
            expect(v).toBeGreaterThanOrEqual(Math.min(lo[i], hi[i]) * (1 - 1e-12));
        });
    });
});

describe('cyproterone is modelled by mouth only', () => {
    it.each([Route.injection, Route.sublingual, Route.gel])('a %s dose adds nothing to any curve', route => {
        const sim = runSimulation([dose(route, Ester.CPA, 10, NOW_H - 20)], BW);
        for (const arr of [sim?.concPGmL_CPA ?? [], sim?.concPGmL_E2 ?? [], sim?.concNGdL_T ?? []]) {
            for (const v of arr) expect(v).toBe(0);
        }
    });

    it('the bioavailability shown for it matches the model, and it has no estradiol factor', () => {
        expect(getBioavailabilityMultiplier(Route.oral, Ester.CPA)).toBe(0.88);
        expect(getBioavailabilityMultiplier(Route.injection, Ester.CPA)).toBe(0);
        expect(getToE2Factor(Ester.CPA)).toBe(1);
    });
});

describe('small corrections', () => {
    afterEach(() => applyPKOverrides(null));

    it('the AUC covers estradiol only', () => {
        const e2 = dose(Route.oral, Ester.E2, 2, NOW_H - 20);
        const withCpa = runSimulation([e2, dose(Route.oral, Ester.CPA, 10, NOW_H - 20)], BW)!;
        expect(withCpa.auc).toBeCloseTo(runSimulation([e2], BW)!.auc, 9);
    });

    it('sanitizePKParams reads null, empty strings, booleans and arrays as missing, not as 0', () => {
        expect(sanitizePKParams({ e2_kClear: null })).toBeNull();
        expect(sanitizePKParams({ e2_kClear: '', e2_oral_bio: false, e2_ff_EV: [], t_kClear: true })).toBeNull();
        const out = sanitizePKParams({ e2_kClear: null, e2_oral_bio: ' 0.05 ' })!;
        expect(out.e2_kClear).toBe(DEFAULT_PK_PARAMS.e2_kClear);
        expect(out.e2_oral_bio).toBe(0.05);
    });

    it('a stored former default is read as the current one', () => {
        // The settings page saves every field, so anyone who once pressed Save
        // kept the old testosterone injection fraction of 0.025.
        const out = sanitizePKParams({ ...DEFAULT_PK_PARAMS, t_ff_TC: 0.025, t_ff_TE: 0.025, t_ff_TU: 0.025 })!;
        expect(out.t_ff_TC).toBe(DEFAULT_PK_PARAMS.t_ff_TC);
        expect(out.t_ff_TE).toBe(DEFAULT_PK_PARAMS.t_ff_TE);
        expect(out.t_ff_TU).toBe(DEFAULT_PK_PARAMS.t_ff_TU);
        expect(sanitizePKParams({ t_ff_TE: 0.03 })!.t_ff_TE).toBe(0.03);
    });

    it('a custom sublingual hold past the longest tier follows the tier model instead of a straight line', () => {
        // The straight line through the two longest tiers used to run on to
        // θ = 0.81 at 60 minutes.
        expect(sublingualThetaFromHold(10)).toBeCloseTo(0.11, 12);
        expect(sublingualThetaFromHold(12.5)).toBeCloseTo(0.145, 12);
        expect(sublingualThetaFromHold(15)).toBeCloseTo(0.18, 12);
        expect(sublingualThetaFromHold(30)).toBeCloseTo(0.343, 3);
        expect(sublingualThetaFromHold(60)).toBeCloseTo(0.453, 3);
        expect(sublingualThetaFromHold(1)).toBe(0);
        for (const h of [2, 5, 10, 15, 20, 30, 45, 60]) {
            expect(sublingualHoldFromTheta(sublingualThetaFromHold(h))).toBeCloseTo(h, 6);
        }
        // A θ saved while the line still ran on shows the longest hold offered.
        expect(sublingualHoldFromTheta(0.81)).toBe(60);
    });

    it('a custom sublingual hold reads the tiers in effect, custom ones included', () => {
        applyPKOverrides({ ...DEFAULT_PK_PARAMS, e2_sl_standard: 0.15 });
        expect(sublingualThetaFromHold(10)).toBeCloseTo(0.15, 12);
        expect(sublingualHoldFromTheta(0.15)).toBeCloseTo(10, 12);
    });
});
