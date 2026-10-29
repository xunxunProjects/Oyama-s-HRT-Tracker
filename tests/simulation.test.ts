import { describe, expect, it } from 'vitest';
import {
    Ester,
    ExtraKey,
    Route,
    SimulationResult,
    interpolateConcentration_CPA,
    interpolateConcentration_E2,
    interpolateConcentration_T,
    runSimulation,
} from '../logic';
import { BW, NOW_H, dose, regimen, relErr, scan, trapz } from './helpers';

const E2 = interpolateConcentration_E2;

describe('runSimulation: empty and invalid input', () => {
    it('returns null for an empty history', () => {
        expect(runSimulation([], BW)).toBeNull();
    });

    it('returns null for a zero or negative body weight', () => {
        const events = [dose(Route.oral, Ester.E2, 2, NOW_H - 10)];
        expect(runSimulation(events, 0)).toBeNull();
        expect(runSimulation(events, -70)).toBeNull();
    });

    it('a zero dose gives a flat zero curve, not null', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 0, NOW_H - 10)], BW)!;
        expect(sim).not.toBeNull();
        expect(Math.max(...sim.concPGmL_E2)).toBe(0);
    });

    it("does not reorder or mutate the caller's events", () => {
        const events = [dose(Route.oral, Ester.E2, 2, NOW_H - 10), dose(Route.oral, Ester.E2, 2, NOW_H - 40)];
        const copy = JSON.parse(JSON.stringify(events));
        runSimulation(events, BW);
        expect(events).toEqual(copy);
    });
});

describe('runSimulation: the time grid', () => {
    it('starts a day before the first dose and runs to two weeks after the last one or a day past now', () => {
        const old = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 1000)], BW)!;
        expect(old.timeH[0]).toBe(NOW_H - 1000 - 24);
        expect(old.timeH[old.timeH.length - 1]).toBeCloseTo(NOW_H + 24, 6);

        const recent = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 10)], BW)!;
        expect(recent.timeH[recent.timeH.length - 1]).toBeCloseTo(NOW_H - 10 + 24 * 14, 6);
    });

    it('is strictly increasing, includes every dose time and keeps all arrays the same length', () => {
        const events = regimen(Route.oral, Ester.E2, 2, 12, 20, NOW_H - 3.3);
        const sim = runSimulation(events, BW)!;
        for (let i = 1; i < sim.timeH.length; i++) expect(sim.timeH[i]).toBeGreaterThan(sim.timeH[i - 1]);
        for (const e of events) expect(sim.timeH).toContain(e.timeH);
        for (const arr of [sim.concPGmL, sim.concPGmL_E2, sim.concPGmL_CPA, sim.concNGdL_T]) {
            expect(arr.length).toBe(sim.timeH.length);
        }
    });

    it('has at least one point per hour and at least 2000 points', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 24 * 365)], BW)!;
        expect(sim.timeH.length).toBeGreaterThanOrEqual(24 * 365);
        const short = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 1)], BW)!;
        expect(short.timeH.length).toBeGreaterThanOrEqual(2000);
    });
});

describe('runSimulation: superposition and scaling', () => {
    // The model is linear, so overlapping doses must add up exactly. Each part is
    // simulated with the other doses present at zero size, so all runs share one
    // time grid and are compared point by point.
    it('overlapping doses of different routes sum to the individual curves', () => {
        const a = dose(Route.injection, Ester.EV, 5, NOW_H - 200);
        const b = dose(Route.oral, Ester.E2, 2, NOW_H - 150);
        const c = dose(Route.sublingual, Ester.E2, 1, NOW_H - 149.5, { [ExtraKey.sublingualTier]: 2 });
        const all = runSimulation([a, b, c], BW)!;
        const parts = [a, b, c].map(only =>
            runSimulation(
                [a, b, c].map(e => (e === only ? e : { ...e, doseMG: 0 })),
                BW,
            )!,
        );
        expect(parts.every(p => p.timeH.length === all.timeH.length)).toBe(true);
        all.timeH.forEach((_, i) => {
            const sum = parts.reduce((s, p) => s + p.concPGmL_E2[i], 0);
            expect(all.concPGmL_E2[i]).toBeCloseTo(sum, 9);
        });
    });

    it('two doses logged at the same moment equal one dose of twice the size', () => {
        const t0 = NOW_H - 50;
        const twice = runSimulation([dose(Route.oral, Ester.E2, 2, t0), dose(Route.oral, Ester.E2, 2, t0)], BW)!;
        const once = runSimulation([dose(Route.oral, Ester.E2, 4, t0)], BW)!;
        twice.timeH.forEach((_, i) => expect(twice.concPGmL_E2[i]).toBeCloseTo(once.concPGmL_E2[i], 9));
    });

    it('concentration scales linearly with dose and inversely with body weight', () => {
        const t0 = NOW_H - 50;
        const base = runSimulation([dose(Route.oral, Ester.E2, 2, t0)], 70)!;
        const doubleDose = runSimulation([dose(Route.oral, Ester.E2, 4, t0)], 70)!;
        const doubleWeight = runSimulation([dose(Route.oral, Ester.E2, 2, t0)], 140)!;
        const t = t0 + 3;
        expect(E2(doubleDose, t)! / E2(base, t)!).toBeCloseTo(2, 9);
        expect(E2(doubleWeight, t)! / E2(base, t)!).toBeCloseTo(0.5, 9);
    });

    it('the order events are passed in does not matter', () => {
        const events = [
            dose(Route.oral, Ester.E2, 2, NOW_H - 30),
            dose(Route.injection, Ester.EV, 5, NOW_H - 300),
            dose(Route.oral, Ester.E2, 2, NOW_H - 54),
        ];
        const forward = runSimulation(events, BW)!;
        const reversed = runSimulation([...events].reverse(), BW)!;
        expect(reversed.concPGmL_E2).toEqual(forward.concPGmL_E2);
    });

    it('repeated dosing reaches a steady state: later cycles repeat the earlier ones', () => {
        const sim = runSimulation(regimen(Route.oral, Ester.E2, 2, 24, 30, NOW_H - 24), BW)!;
        const day = (end: number) => scan(sim, E2, end - 24, end, 0.25);
        const last = day(NOW_H - 24);
        const before = day(NOW_H - 48);
        expect(relErr(last.mean, before.mean)).toBeLessThan(1e-3);
        expect(relErr(last.cmax, before.cmax)).toBeLessThan(1e-3);
    });

    // Checked at the recent dose times, which every grid contains, so
    // interpolation plays no part. The long history does coarsen the grid
    // elsewhere (one point per hour).
    it('a dose long washed out changes nothing about the present curve', () => {
        const recent = regimen(Route.oral, Ester.E2, 2, 24, 10, NOW_H - 5);
        const withOld = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 24 * 400), ...recent], BW)!;
        const without = runSimulation(recent, BW)!;
        for (const { timeH: t } of recent) {
            expect(withOld.timeH).toContain(t);
            expect(E2(withOld, t)!).toBeCloseTo(E2(without, t)!, 9);
        }
    });

    it('a year of daily doses runs and stays finite', () => {
        const sim = runSimulation(regimen(Route.oral, Ester.E2, 2, 24, 365, NOW_H - 2), BW)!;
        expect(sim.concPGmL_E2.every(Number.isFinite)).toBe(true);
        expect(sim.concPGmL_E2.every(c => c >= -1e-9)).toBe(true);
    });
});

describe('runSimulation: hormones are kept apart', () => {
    it('estradiol, cyproterone and testosterone each fill only their own curve', () => {
        const sim = runSimulation(
            [
                dose(Route.oral, Ester.E2, 2, NOW_H - 20),
                dose(Route.oral, Ester.CPA, 10, NOW_H - 20),
                dose(Route.gel, Ester.T, 50, NOW_H - 20),
            ],
            BW,
        )!;
        const e2Only = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 20)], BW)!;
        const cpaOnly = runSimulation([dose(Route.oral, Ester.CPA, 10, NOW_H - 20)], BW)!;
        const tOnly = runSimulation([dose(Route.gel, Ester.T, 50, NOW_H - 20)], BW)!;
        const t = NOW_H - 17;
        expect(E2(sim, t)).toBeCloseTo(E2(e2Only, t)!, 9);
        expect(interpolateConcentration_CPA(sim, t)).toBeCloseTo(interpolateConcentration_CPA(cpaOnly, t)!, 9);
        expect(interpolateConcentration_T(sim, t)).toBeCloseTo(interpolateConcentration_T(tOnly, t)!, 9);
    });

    it('concPGmL is E2 plus CPA converted from ng/mL to pg/mL, and the AUC integrates E2 alone', () => {
        const sim = runSimulation(
            [dose(Route.oral, Ester.E2, 2, NOW_H - 20), dose(Route.oral, Ester.CPA, 10, NOW_H - 20)],
            BW,
        )!;
        sim.timeH.forEach((_, i) => {
            expect(sim.concPGmL[i]).toBeCloseTo(sim.concPGmL_E2[i] + sim.concPGmL_CPA[i] * 1000, 6);
        });
        expect(relErr(sim.auc, trapz(sim.timeH, sim.concPGmL_E2))).toBeLessThan(1e-9);
    });
});

describe('prediction (time after the last dose and into the future)', () => {
    it('future planned doses are simulated like past ones', () => {
        const future = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H + 48)], BW)!;
        expect(E2(future, NOW_H)).toBe(0);
        expect(E2(future, NOW_H + 51)!).toBeGreaterThan(0);
        expect(future.timeH[future.timeH.length - 1]).toBeCloseTo(NOW_H + 48 + 24 * 14, 6);
    });

    it('after the peak, the projected curve only falls', () => {
        const t0 = NOW_H - 100;
        const sim = runSimulation([dose(Route.injection, Ester.EV, 5, t0)], BW)!;
        const { tmaxH } = scan(sim, E2, t0, t0 + 300, 0.5);
        let prev = Infinity;
        sim.timeH.forEach((t, i) => {
            if (t < t0 + tmaxH + 1) return;
            expect(sim.concPGmL_E2[i]).toBeLessThanOrEqual(prev);
            prev = sim.concPGmL_E2[i];
        });
    });
});

describe('interpolateConcentration_*', () => {
    const sim: SimulationResult = {
        timeH: [10, 20, 30],
        concPGmL: [0, 0, 0],
        concPGmL_E2: [100, 200, 50],
        concPGmL_CPA: [1, 3, 2],
        concNGdL_T: [500, 300, 700],
        auc: 0,
    };

    it('returns the exact value at a grid point', () => {
        expect(interpolateConcentration_E2(sim, 20)).toBe(200);
        expect(interpolateConcentration_CPA(sim, 20)).toBe(3);
        expect(interpolateConcentration_T(sim, 20)).toBe(300);
    });

    it('interpolates linearly between grid points', () => {
        expect(interpolateConcentration_E2(sim, 15)).toBe(150);
        expect(interpolateConcentration_E2(sim, 27.5)).toBeCloseTo(87.5, 12);
        expect(interpolateConcentration_CPA(sim, 25)).toBe(2.5);
        expect(interpolateConcentration_T(sim, 25)).toBe(500);
    });

    it('holds the first and last values outside the grid', () => {
        expect(interpolateConcentration_E2(sim, -100)).toBe(100);
        expect(interpolateConcentration_E2(sim, 1e9)).toBe(50);
        expect(interpolateConcentration_CPA(sim, 0)).toBe(1);
        expect(interpolateConcentration_T(sim, 99)).toBe(700);
    });

    it('returns null for an empty simulation', () => {
        const empty: SimulationResult = {
            timeH: [],
            concPGmL: [],
            concPGmL_E2: [],
            concPGmL_CPA: [],
            concNGdL_T: [],
            auc: 0,
        };
        expect(interpolateConcentration_E2(empty, 5)).toBeNull();
        expect(interpolateConcentration_CPA(empty, 5)).toBeNull();
        expect(interpolateConcentration_T(empty, 5)).toBeNull();
    });

    it('T interpolation copes with an older result that has no T array', () => {
        const legacy = { ...sim, concNGdL_T: undefined } as unknown as SimulationResult;
        expect(interpolateConcentration_T(legacy, 15)).toBeNull();
    });
});
