import { afterEach, describe, expect, it } from 'vitest';
import {
    CalibrationMethod,
    DEFAULT_PK_PARAMS,
    Ester,
    Route,
    applyPKOverrides,
    computeCalibration,
    computeCalibrationPoints,
    geometricMeanRatio,
    interpolateConcentration_E2,
    normalizeCalibrationMethod,
    runSimulation,
    runSimulationWithParams,
} from '../logic';
import { BW, NOW_H, lab, regimen, relErr } from './helpers';

const E2 = interpolateConcentration_E2;

afterEach(() => applyPKOverrides(null));

// Ten weekly EV injections; the last one 3.5 days before now.
const events = regimen(Route.injection, Ester.EV, 5, 168, 10, NOW_H - 84);
const sim = runSimulation(events, BW)!;
const model = (t: number) => E2(sim, t)!;

// Lab times spread over the last six weeks, at different points of the cycle.
const LAB_TIMES = [NOW_H - 1000, NOW_H - 800, NOW_H - 560, NOW_H - 400, NOW_H - 230, NOW_H - 100];

describe('computeCalibrationPoints', () => {
    it('pairs each E2 lab with the model value at that time, oldest first', () => {
        const labs = [lab(NOW_H - 100, 150), lab(NOW_H - 400, 300)];
        const points = computeCalibrationPoints(sim, labs);
        expect(points.map(p => p.timeH)).toEqual([NOW_H - 400, NOW_H - 100]);
        for (const p of points) {
            expect(p.pred).toBeCloseTo(model(p.timeH), 9);
            expect(p.ratio).toBeCloseTo(p.obs / p.pred, 12);
        }
    });

    it('converts pmol/L to pg/mL (÷ 3.671)', () => {
        const [p] = computeCalibrationPoints(sim, [lab(NOW_H - 100, 367.1, 'pmol/l')]);
        expect(p.obs).toBeCloseTo(100, 9);
    });

    it('leaves out testosterone labs, non-positive values and labs where the model is below 1 pg/mL', () => {
        const before = NOW_H - 10_000; // long before the first injection
        const points = computeCalibrationPoints(sim, [
            lab(NOW_H - 100, 500, 'ng/dl'),
            lab(NOW_H - 100, 20, 'nmol/l'),
            lab(NOW_H - 100, 0),
            lab(NOW_H - 100, -5),
            lab(before, 30),
        ]);
        expect(points).toEqual([]);
    });

    it('returns nothing without a simulation or without labs', () => {
        expect(computeCalibrationPoints(null, [lab(NOW_H, 100)])).toEqual([]);
        expect(computeCalibrationPoints(sim, [])).toEqual([]);
    });
});

describe('geometricMeanRatio', () => {
    const pt = (ratio: number) => ({ id: 'x', timeH: 0, obs: ratio, pred: 1, ratio });

    it('is 1 with no points and the geometric mean otherwise', () => {
        expect(geometricMeanRatio([])).toBe(1);
        expect(geometricMeanRatio([pt(2), pt(8)])).toBeCloseTo(4, 12);
    });

    it('clamps each ratio into [0.01, 100] first', () => {
        expect(geometricMeanRatio([pt(1e6)])).toBeCloseTo(100, 9);
        expect(geometricMeanRatio([pt(1e-9)])).toBeCloseTo(0.01, 12);
    });
});

describe('normalizeCalibrationMethod', () => {
    it('keeps current ids, maps legacy ones and defaults to mipd', () => {
        for (const m of ['off', 'ekf', 'ou_kalman', 'mipd'] as const) expect(normalizeCalibrationMethod(m)).toBe(m);
        expect(normalizeCalibrationMethod('average')).toBe('mipd');
        expect(normalizeCalibrationMethod('adaptive')).toBe('ekf');
        expect(normalizeCalibrationMethod(undefined)).toBe('mipd');
        expect(normalizeCalibrationMethod(null)).toBe('mipd');
        expect(normalizeCalibrationMethod('something-else')).toBe('mipd');
    });
});

describe('computeCalibration', () => {
    const METHODS: CalibrationMethod[] = ['ekf', 'ou_kalman', 'mipd'];
    const labsAt = (scale: number, times = LAB_TIMES) => times.map(t => lab(t, model(t) * scale));

    it('off, or no usable labs, returns the identity', () => {
        const off = computeCalibration(sim, events, BW, labsAt(2), 'off');
        expect(off.factorFn(NOW_H)).toBe(1);
        expect(off.scale).toBe(1);
        expect(off.kMul).toBe(1);
        expect(off.n).toBe(LAB_TIMES.length);
        expect(off.fitErrPct).toBeNull();

        for (const method of METHODS) {
            const none = computeCalibration(sim, events, BW, [], method);
            expect(none.factorFn(NOW_H)).toBe(1);
            expect(none.n).toBe(0);
            expect(computeCalibration(null, events, BW, labsAt(2), method).scale).toBe(1);
        }
    });

    it.each(METHODS)('%s: labs that match the model leave it essentially unchanged', (method) => {
        const cal = computeCalibration(sim, events, BW, labsAt(1), method);
        expect(cal.scale).toBeGreaterThan(0.97);
        expect(cal.scale).toBeLessThan(1.03);
        expect(Math.abs(cal.kMul - 1)).toBeLessThan(0.03);
        expect(cal.factorFn(NOW_H - 300)).toBeGreaterThan(0.95);
        expect(cal.factorFn(NOW_H - 300)).toBeLessThan(1.05);
    });

    it.each(METHODS)('%s: labs running at twice the model pull the estimate up, towards 2', (method) => {
        const cal = computeCalibration(sim, events, BW, labsAt(2), method);
        const f = cal.factorFn(NOW_H - 100);
        expect(f).toBeGreaterThan(1.6);
        expect(f).toBeLessThan(2.4);
        expect(cal.n).toBe(LAB_TIMES.length);
    });

    it.each(METHODS)('%s: labs at half the model pull the estimate down', (method) => {
        const f = computeCalibration(sim, events, BW, labsAt(0.5), method).factorFn(NOW_H - 100);
        expect(f).toBeGreaterThan(0.35);
        expect(f).toBeLessThan(0.65);
    });

    it.each(METHODS)('%s: the factor always stays within [0.01, 100]', (method) => {
        const huge = computeCalibration(sim, events, BW, labsAt(1e6), method);
        const tiny = computeCalibration(sim, events, BW, labsAt(1e-6), method);
        for (const t of [NOW_H - 2000, NOW_H - 500, NOW_H, NOW_H + 500]) {
            expect(huge.factorFn(t)).toBeLessThanOrEqual(100);
            expect(tiny.factorFn(t)).toBeGreaterThanOrEqual(0.01);
        }
    });

    it('mipd shrinks a single lab towards the population model, and trusts more labs more', () => {
        const one = computeCalibration(sim, events, BW, labsAt(2, [NOW_H - 100]), 'mipd');
        const two = computeCalibration(sim, events, BW, labsAt(2, LAB_TIMES.slice(-2)), 'mipd');
        expect(one.scale).toBeGreaterThan(1.5);
        expect(one.scale).toBeLessThan(2);
        expect(two.scale).toBeGreaterThan(one.scale);
        expect(two.scale).toBeLessThan(2);
    });

    it('mipd resists a single outlier better than ekf', () => {
        const labs = labsAt(1);
        labs[3] = lab(labs[3].timeH, labs[3].concValue * 10);
        const mipd = computeCalibration(sim, events, BW, labs, 'mipd');
        const ekf = computeCalibration(sim, events, BW, labs, 'ekf');
        expect(Math.abs(Math.log(mipd.scale))).toBeLessThan(Math.abs(Math.log(ekf.scale)));
    });

    it('clearance only moves once there are at least three labs', () => {
        const two = LAB_TIMES.slice(-2);
        for (const method of ['ekf', 'mipd'] as const) {
            const cal = computeCalibration(sim, events, BW, labsAt(1.5, two), method);
            expect(cal.kMul).toBeCloseTo(1, 3);
            expect(cal.halfLifeDeltaPct).toBeCloseTo(0, 1);
        }
    });

    it('recovers a faster personal clearance from labs generated with one', () => {
        // Labs produced by the same model with clearance ×1.5 and amplitude ×1.2.
        const truth = runSimulationWithParams(events, BW, {
            ...DEFAULT_PK_PARAMS,
            e2_kClear: DEFAULT_PK_PARAMS.e2_kClear * 1.5,
            e2_kClearInj: DEFAULT_PK_PARAMS.e2_kClearInj * 1.5,
        })!;
        const labs = LAB_TIMES.map(t => lab(t, E2(truth, t)! * 1.2));
        for (const method of ['ekf', 'mipd'] as const) {
            const cal = computeCalibration(sim, events, BW, labs, method);
            expect(cal.kMul).toBeGreaterThan(1.1);
            expect(cal.halfLifeDeltaPct).toBeLessThan(0);
            expect(cal.halfLifeDeltaPct).toBeCloseTo((1 / cal.kMul - 1) * 100, 9);
            // The calibrated curve sits closer to the truth than the raw model at every lab.
            for (const t of LAB_TIMES) {
                const truthAt = E2(truth, t)! * 1.2;
                expect(relErr(model(t) * cal.factorFn(t), truthAt)).toBeLessThan(relErr(model(t), truthAt));
            }
        }
    });

    it('does not disturb the active PK parameters while fitting clearance', () => {
        applyPKOverrides({ ...DEFAULT_PK_PARAMS, e2_kClearInj: 0.05 });
        const before = runSimulation(events, BW)!;
        computeCalibration(before, events, BW, labsAt(1.5), 'ekf');
        const after = runSimulation(events, BW)!;
        expect(after.concPGmL_E2).toEqual(before.concPGmL_E2);
    });

    describe('history modes', () => {
        it.each(['ekf', 'mipd', 'ou_kalman'] as const)('%s forward: no correction before the first lab', (method) => {
            const cal = computeCalibration(sim, events, BW, labsAt(2), method, 'forward');
            expect(cal.factorFn(LAB_TIMES[0] - 1)).toBe(1);
            expect(cal.factorFn(LAB_TIMES[0] + 1)).toBeGreaterThan(1.2);
        });

        it.each(['ekf', 'mipd', 'ou_kalman'] as const)('%s forward: adding a later lab never rewrites the past', (method) => {
            const early = labsAt(2, LAB_TIMES.slice(0, 3));
            const later = [...early, lab(NOW_H - 100, model(NOW_H - 100) * 0.5)];
            const a = computeCalibration(sim, events, BW, early, method, 'forward');
            const b = computeCalibration(sim, events, BW, later, method, 'forward');
            for (const t of [LAB_TIMES[0] + 10, LAB_TIMES[1] + 50, LAB_TIMES[2] + 10, NOW_H - 101]) {
                expect(b.factorFn(t)).toBeCloseTo(a.factorFn(t), 9);
            }
        });

        it('retrospective: a new lab may revise earlier estimates', () => {
            const early = labsAt(2, LAB_TIMES.slice(0, 3));
            const later = [...early, lab(NOW_H - 100, model(NOW_H - 100) * 0.5)];
            const a = computeCalibration(sim, events, BW, early, 'mipd', 'retrospective');
            const b = computeCalibration(sim, events, BW, later, 'mipd', 'retrospective');
            expect(b.factorFn(LAB_TIMES[0] + 10)).not.toBeCloseTo(a.factorFn(LAB_TIMES[0] + 10), 3);
        });
    });

    describe('ou_kalman', () => {
        it('the correction relaxes back towards the model far from any lab', () => {
            const cal = computeCalibration(sim, events, BW, labsAt(2), 'ou_kalman');
            const nearLab = cal.factorFn(LAB_TIMES[LAB_TIMES.length - 1]);
            const farAfter = cal.factorFn(LAB_TIMES[LAB_TIMES.length - 1] + 24 * 60);
            expect(nearLab).toBeGreaterThan(1.6);
            expect(farAfter).toBeLessThan(1.1);
            expect(farAfter).toBeGreaterThanOrEqual(1);
        });

        it('reports no clearance change', () => {
            const cal = computeCalibration(sim, events, BW, labsAt(2), 'ou_kalman');
            expect(cal.kMul).toBe(1);
            expect(cal.halfLifeDeltaPct).toBe(0);
        });
    });

    it('fit error is null with fewer than two labs and small when labs follow the model', () => {
        expect(computeCalibration(sim, events, BW, labsAt(2, [NOW_H - 100]), 'mipd').fitErrPct).toBeNull();
        const good = computeCalibration(sim, events, BW, labsAt(1.3), 'mipd');
        expect(good.fitErrPct!).toBeGreaterThanOrEqual(0);
        expect(good.fitErrPct!).toBeLessThan(5);
    });
});
