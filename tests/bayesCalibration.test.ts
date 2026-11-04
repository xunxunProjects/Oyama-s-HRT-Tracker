import { afterEach, describe, expect, it } from 'vitest';
import {
    Ester,
    LabAssay,
    LabResult,
    Route,
    applyPKOverrides,
    computeCalibration,
    interpolateConcentration_E2,
    runSimulation,
} from '../logic';
import { detectRegimens, forecastCurrent, type ForecastInput } from '../src/utils/regimen';
import { BW, NOW_H, lab, regimen } from './helpers';

// Full Bayes makes claims the other estimators do not: it can tell a fixed
// personal level from one that drifts, it knows how much to trust each lab,
// and it reports how sure it is. These tests check those claims rather than
// the plumbing the shared calibration tests already cover.

const E2 = interpolateConcentration_E2;

afterEach(() => applyPKOverrides(null));

// Ten weekly EV injections; the last one 3.5 days before now.
const events = regimen(Route.injection, Ester.EV, 5, 168, 10, NOW_H - 84);
const sim = runSimulation(events, BW)!;
const model = (t: number) => E2(sim, t)!;
const LAB_TIMES = [NOW_H - 1000, NOW_H - 800, NOW_H - 560, NOW_H - 400, NOW_H - 230, NOW_H - 100];
const labsAt = (scale: number, times = LAB_TIMES) => times.map(t => lab(t, model(t) * scale));
const withAssay = (r: LabResult, assay: LabAssay): LabResult => ({ ...r, assay });
const bayes = (labs: LabResult[], mode: 'forward' | 'retrospective' = 'retrospective') =>
    computeCalibration(sim, events, BW, labs, 'bayes', mode);

describe('Full Bayes calibration', () => {
    it('shrinks one lab towards the population, and trusts more labs more', () => {
        const one = bayes(labsAt(2, [NOW_H - 100]));
        const two = bayes(labsAt(2, LAB_TIMES.slice(-2)));
        expect(one.scale).toBeGreaterThan(1.5);
        expect(one.scale).toBeLessThan(2);
        expect(two.scale).toBeGreaterThan(one.scale);
        expect(two.scale).toBeLessThan(2);
    });

    it('reports a 90% interval for the level at the latest lab that narrows with more labs', () => {
        const one = bayes(labsAt(1.5, [NOW_H - 100]));
        const six = bayes(labsAt(1.5));
        for (const cal of [one, six]) {
            const [lo, hi] = cal.latestInterval!;
            const level = cal.factorFn(NOW_H - 100);
            expect(lo).toBeLessThan(level);
            expect(hi).toBeGreaterThan(level);
        }
        const width = (c: typeof one) => Math.log(c.latestInterval![1] / c.latestInterval![0]);
        expect(width(six)).toBeLessThan(width(one));
    });

    it('discounts one inconsistent lab among consistent ones and says so', () => {
        const labs = labsAt(1);
        labs[3] = lab(labs[3].timeH, labs[3].concValue * 10);
        const cal = bayes(labs);
        expect(cal.discounted).toBe(1);
        expect(Math.abs(Math.log(cal.scale))).toBeLessThan(Math.log(1.1));
        const mipd = computeCalibration(sim, events, BW, labs, 'mipd');
        expect(Math.abs(Math.log(cal.scale))).toBeLessThanOrEqual(Math.abs(Math.log(mipd.scale)) + 0.01);
    });

    it('does not discount anything with fewer than three labs', () => {
        // Two labs cannot tell an outlier from a real difference (MIPD's rule).
        expect(bayes(labsAt(5, LAB_TIMES.slice(-2))).discounted).toBe(0);
    });

    it('favours no drift when the labs agree on one level (Occam)', () => {
        const cal = bayes(labsAt(1.4));
        const [family] = Object.entries(cal.drift!).sort((a, b) => b[1] - a[1])[0];
        expect(family).toBe('none');
        expect(Object.values(cal.drift!).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    });

    it('detects a level that moved, and follows the recent labs where MIPD averages', () => {
        // Three labs at twice the model, then three on it.
        const labs = LAB_TIMES.map((t, i) => lab(t, model(t) * (i < 3 ? 2 : 1)));
        const cal = bayes(labs);
        const mipd = computeCalibration(sim, events, BW, labs, 'mipd');
        expect(cal.drift!.none).toBeLessThan(0.1);
        const recent = NOW_H - 100;
        expect(Math.abs(Math.log(cal.factorFn(recent)))).toBeLessThan(Math.abs(Math.log(mipd.factorFn(recent))));
        expect(cal.fitErrPct!).toBeLessThan(mipd.fitErrPct!);
    });

    it('trusts a low LC-MS/MS reading more than the same immunoassay reading', () => {
        // One injection long ago: find where its tail has fallen to ~15 pg/mL.
        const single = regimen(Route.injection, Ester.EV, 5, 168, 1, NOW_H - 24 * 20);
        const singleSim = runSimulation(single, BW)!;
        let t = NOW_H - 24 * 19;
        while (E2(singleSim, t)! > 15 && t < NOW_H) t += 1;
        const reading = lab(t, E2(singleSim, t)! * 2);
        const lcms = computeCalibration(singleSim, single, BW, [withAssay(reading, 'lcms')], 'bayes');
        const immuno = computeCalibration(singleSim, single, BW, [withAssay(reading, 'immuno')], 'bayes');
        expect(lcms.scale).toBeGreaterThan(immuno.scale);
        expect(immuno.scale).toBeGreaterThan(1);
    });

    it('trusts a lab on a steep flank less than one at the peak', () => {
        const daily = regimen(Route.oral, Ester.E2, 2, 24, 10, NOW_H - 12);
        const dailySim = runSimulation(daily, BW)!;
        const doseH = NOW_H - 36;
        let peakH = doseH;
        for (let h = doseH; h <= doseH + 12; h += 0.05) {
            if (E2(dailySim, h)! > E2(dailySim, peakH)!) peakH = h;
        }
        const at = (h: number) => [lab(h, E2(dailySim, h)! * 1.5)];
        const peak = computeCalibration(dailySim, daily, BW, at(peakH), 'bayes');
        const flank = computeCalibration(dailySim, daily, BW, at(doseH + 0.5), 'bayes');
        expect(flank.scale).toBeLessThan(peak.scale);
    });

    it('is least uncertain at the labs and grows less sure as they age', () => {
        const cal = bayes(labsAt(1.3));
        const last = LAB_TIMES[LAB_TIMES.length - 1];
        const atLab = cal.factorSdFn!(last);
        expect(atLab).toBeGreaterThan(0);
        expect(cal.factorSdFn!(last + 24 * 90)).toBeGreaterThan(atLab);
        expect(cal.factorSdFn!(last + 24 * 365)).toBeGreaterThanOrEqual(cal.factorSdFn!(last + 24 * 90));
    });

    it('forward mode: no uncertainty and no correction before the first lab', () => {
        const cal = bayes(labsAt(2), 'forward');
        expect(cal.factorFn(LAB_TIMES[0] - 1)).toBe(1);
        expect(cal.factorSdFn!(LAB_TIMES[0] - 1)).toBe(0);
        expect(cal.factorSdFn!(LAB_TIMES[0] + 1)).toBeGreaterThan(0);
    });

    it('is deterministic', () => {
        const labs = labsAt(1.7, LAB_TIMES.slice(1, 5));
        const a = bayes(labs);
        const b = bayes(labs);
        for (const t of [NOW_H - 900, NOW_H - 300, NOW_H, NOW_H + 400]) {
            expect(a.factorFn(t)).toBe(b.factorFn(t));
            expect(a.factorSdFn!(t)).toBe(b.factorSdFn!(t));
        }
        expect(a.drift).toEqual(b.drift);
    });

    it('gives the forecast a range from its posterior even with a single lab', () => {
        // With one lab the fit error is undefined, so the other methods add no
        // calibration spread at all; Full Bayes still knows how unsure it is.
        const regimens = detectRegimens(events, NOW_H);
        const labs = labsAt(1.5, [NOW_H - 100]);
        const input = (method: 'mipd' | 'bayes'): ForecastInput => ({
            events,
            weight: BW,
            birthYear: null,
            labResults: labs,
            calibrationMethod: method,
            calibrationHistoryMode: 'retrospective',
            isTransmasc: false,
            nowH: NOW_H,
            horizonH: 24 * 28,
            fitErrPct: computeCalibration(sim, events, BW, labs, method).fitErrPct,
            target: null,
        });
        const width = (method: 'mipd' | 'bayes') => {
            const s = forecastCurrent(input(method), regimens)!;
            const i = s.band!.timeH.length - 1;
            return Math.log(s.band!.hi[i] / s.band!.lo[i]);
        };
        expect(width('bayes')).toBeGreaterThan(width('mipd'));
    });
});
