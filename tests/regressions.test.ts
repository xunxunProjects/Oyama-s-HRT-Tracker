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
    computeCalibration,
    getDoseAdvisory,
    getHormoneLevelAdvisory,
    interpolateConcentration_E2,
    interpolateConcentration_T,
    runSimulation,
    runSimulationWithParams,
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

    it('a removal long after every planned end is ignored', () => {
        const t0 = NOW_H - 1000;
        const wear = { [ExtraKey.releaseRateUGPerDay]: 100, [ExtraKey.patchWearH]: 84 };
        const alone = runSimulation([dose(Route.patchApply, Ester.E2, 0, t0, wear)], BW)!;
        const withStrayRemoval = runSimulation(
            [dose(Route.patchApply, Ester.E2, 0, t0, wear), dose(Route.patchRemove, Ester.E2, 0, t0 + 300)],
            BW,
        )!;
        for (const t of [t0 + 40, t0 + 84, t0 + 90, t0 + 200]) {
            expect(E2(withStrayRemoval, t)).toBeCloseTo(E2(alone, t)!, 9);
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
