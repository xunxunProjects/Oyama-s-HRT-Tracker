import { afterEach, describe, expect, it } from 'vitest';
import {
    Ester,
    ExtraKey,
    LabResult,
    Route,
    applyPKOverrides,
    computeCalibration,
    interpolateConcentration_E2,
    runSimulation,
} from '../logic';
import { e2RouteCurves } from '../src/domain/calibration/routeCurves';
import { splitRHat } from '../src/domain/calibration/mcmc';
import { BW, NOW_H, lab, regimen } from './helpers';

// Personal PK gives each person their own route levels, clearance and
// absorption speed, sampled by MCMC. These tests make synthetic labs from a
// known personal model and check that the sampler finds it again, plus the
// guarantees every estimator owes (shrinkage, robustness, forward mode,
// determinism).

const E2 = interpolateConcentration_E2;
afterEach(() => applyPKOverrides(null));

/** Labs from a "true" person: route multipliers, clearance and absorption multipliers. */
function personLabs(
    events: ReturnType<typeof regimen>,
    times: number[],
    truth: { route?: Partial<Record<Route, number>>; kMul?: number; absMul?: number; noise?: number[] },
): LabResult[] {
    const rc = e2RouteCurves(events, BW, null, times, truth.kMul ?? 1, truth.absMul ?? 1);
    return times.map((t, i) => {
        let v = 0;
        rc.routes.forEach((r, j) => (v += (truth.route?.[r] ?? 1) * rc.conc[j][i]));
        return lab(t, v * Math.exp(truth.noise?.[i] ?? 0));
    });
}

const run = (
    events: ReturnType<typeof regimen>,
    labs: LabResult[],
    mode: 'forward' | 'retrospective' = 'retrospective',
) => computeCalibration(runSimulation(events, BW), events, BW, labs, 'mcmc', mode);

// Weekly EV injections for a year plus twice-daily sublingual E2 for the last 20 weeks.
// 2 mg a dose: the mucosal burst is over within a few hours (OralPK.kElimSL),
// so at these lab times 1 mg made up only about a fifth of the level, too
// little for the sampler to move the sublingual factor far from its prior.
const injections = regimen(Route.injection, Ester.EV, 4, 168, 52, NOW_H - 60);
const sublingual = regimen(Route.sublingual, Ester.E2, 2, 12, 280, NOW_H - 6, { [ExtraKey.sublingualTier]: 1 });
const mixed = [...injections, ...sublingual];
// Labs before the sublingual started (injection only) and after (both), at varied phases.
const MIXED_TIMES = [
    NOW_H - 24 * 300 + 30,
    NOW_H - 24 * 260 + 100,
    NOW_H - 24 * 220 + 60,
    NOW_H - 24 * 180 + 140,
    NOW_H - 24 * 100 + 3,
    NOW_H - 24 * 70 + 9,
    NOW_H - 24 * 40 + 2,
    NOW_H - 24 * 10 + 7,
];

describe('Personal PK (MCMC) calibration', () => {
    it('evaluates per-route curves that add up to the simulation exactly', () => {
        const sim = runSimulation(mixed, BW)!;
        const rc = e2RouteCurves(mixed, BW, null, sim.timeH, 1, 1);
        expect(rc.routes).toEqual([Route.sublingual, Route.injection]);
        let worst = 0;
        sim.timeH.forEach((_, i) => {
            const sum = rc.conc[0][i] + rc.conc[1][i];
            worst = Math.max(worst, Math.abs(sum - sim.concPGmL_E2[i]) / Math.max(1, sim.concPGmL_E2[i]));
        });
        expect(worst).toBeLessThan(1e-9);
    });

    it('tells the routes apart: sublingual low, injections high', () => {
        const labs = personLabs(mixed, MIXED_TIMES, {
            route: { [Route.injection]: 1.3, [Route.sublingual]: 0.5 },
        });
        const cal = run(mixed, labs);
        const inj = cal.routeScales![Route.injection]!;
        const sl = cal.routeScales![Route.sublingual]!;
        expect(inj).toBeGreaterThan(1.1);
        expect(sl).toBeLessThan(0.8);
        expect(inj / sl).toBeGreaterThan(1.8);
        expect(cal.fitErrPct!).toBeLessThan(12);
        expect(cal.rHat!).toBeLessThan(1.1);
    }, 60000);

    it('finds a personal depot release speed from where labs sit in the injection interval', () => {
        const weekly = regimen(Route.injection, Ester.EV, 4, 168, 30, NOW_H - 10);
        const times = [6, 20, 40, 70, 100, 130, 160, 166].map((h, i) => NOW_H - 168 * (20 - 2 * i) - 10 + h);
        const fast = run(weekly, personLabs(weekly, times, { absMul: 2 }));
        expect(fast.absMul!).toBeGreaterThan(1.5);
        expect(fast.routeScales).toBeUndefined();
        const slow = run(weekly, personLabs(weekly, times, { absMul: 0.5 }));
        expect(slow.absMul!).toBeLessThan(0.7);
        expect(slow.fitErrPct!).toBeLessThan(8);
    }, 60000);

    it('leaves absorption near the model when it barely shows (daily oral)', () => {
        // The estrone pool smooths an oral dose: doubling uptake moves labs about 10%,
        // inside the lab noise, so the prior keeps most of its say.
        const oral = regimen(Route.oral, Ester.E2, 2, 24, 60, NOW_H - 10);
        const times = [2, 4, 6, 9, 13, 18, 22, 23.5].map((h, i) => NOW_H - 24 * (40 - 4 * i) - 10 + h);
        const cal = run(oral, personLabs(oral, times, { absMul: 2 }));
        expect(cal.absMul!).toBeGreaterThan(1);
        expect(cal.absMul!).toBeLessThan(2);
    }, 60000);

    it('shrinks one lab towards the population and keeps clearance and absorption fixed', () => {
        const one = run(injections, personLabs(injections, [NOW_H - 100], { route: { [Route.injection]: 2 } }));
        expect(one.scale).toBeGreaterThan(1.4);
        expect(one.scale).toBeLessThan(2);
        expect(one.kMul).toBe(1);
        expect(one.absMul).toBe(1);
        const [lo, hi] = one.latestInterval!;
        expect(lo).toBeLessThan(one.factorFn(NOW_H - 100));
        expect(hi).toBeGreaterThan(one.factorFn(NOW_H - 100));
    }, 60000);

    it('discounts one inconsistent lab among consistent ones', () => {
        const times = MIXED_TIMES.slice(0, 6);
        const noise = times.map((_, i) => (i === 3 ? Math.log(8) : 0));
        const cal = run(injections, personLabs(injections, times, { noise }));
        expect(cal.discounted).toBe(1);
        expect(Math.abs(Math.log(cal.scale))).toBeLessThan(Math.log(1.15));
    }, 60000);

    it('forward mode never rewrites the past and does nothing before the first lab', () => {
        const labs = personLabs(mixed, MIXED_TIMES.slice(0, 5), { route: { [Route.injection]: 1.6 } });
        const early = run(mixed, labs.slice(0, 3), 'forward');
        const late = run(mixed, labs, 'forward');
        expect(late.factorFn(MIXED_TIMES[0] - 1)).toBe(1);
        expect(late.factorSdFn!(MIXED_TIMES[0] - 1)).toBe(0);
        const between = MIXED_TIMES[1] + 30;
        expect(late.factorFn(between)).toBeCloseTo(early.factorFn(between), 2);
    }, 120000);

    it('is deterministic and draws a band', () => {
        const labs = personLabs(injections, MIXED_TIMES.slice(2, 6), { route: { [Route.injection]: 1.4 } });
        const a = run(injections, labs);
        const b = run(injections, labs);
        for (const t of [NOW_H - 24 * 300, NOW_H - 24 * 100, NOW_H, NOW_H + 300]) {
            expect(a.factorFn(t)).toBe(b.factorFn(t));
            expect(a.factorSdFn!(t)).toBe(b.factorSdFn!(t));
        }
        expect(a.factorSdFn!(MIXED_TIMES[4])).toBeGreaterThan(0);
    }, 60000);

    it('agrees with the plain model when the labs sit on it', () => {
        const sim = runSimulation(injections, BW)!;
        const labs = MIXED_TIMES.slice(0, 6).map(t => lab(t, E2(sim, t)!));
        const cal = run(injections, labs);
        for (const t of MIXED_TIMES) expect(Math.abs(Math.log(cal.factorFn(t)))).toBeLessThan(0.08);
    }, 60000);

    it('split R-hat flags chains that disagree', () => {
        const chain = (m: number) => Array.from({ length: 200 }, (_, i) => Float64Array.from([m + Math.sin(i)]));
        expect(splitRHat([chain(0), chain(0)], 1)).toBeLessThan(1.05);
        expect(splitRHat([chain(0), chain(5)], 1)).toBeGreaterThan(2);
    });
});
