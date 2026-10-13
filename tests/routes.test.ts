import { describe, expect, it } from 'vitest';
import {
    Ester,
    ExtraKey,
    Route,
    getBioavailabilityMultiplier,
    getToE2Factor,
    interpolateConcentration_CPA,
    interpolateConcentration_E2,
    interpolateConcentration_T,
    runSimulation,
    SimulationResult,
} from '../logic';
import { BW, NOW_H, VD_CPA_ML, VD_E2_ML, VD_T_ML, dose, regimen, relErr, scan, trapz } from './helpers';
import { UpstreamCompound, upstreamE2Amount } from './reference/pkcoreUpstream';

const E2 = interpolateConcentration_E2;
const T = interpolateConcentration_T;
const CPA = interpolateConcentration_CPA;

const toPgMl = (amountMG: number) => (amountMG * 1e9) / VD_E2_ML;

/**
 * Exposure check that holds for every linear route: once a dose has fully
 * washed out, the area under the amount curve is F·D/k_elim, whatever the
 * absorption rates. The dose is placed far enough in the past that the grid
 * covers its whole tail.
 */
function e2AucFor(route: Route, ester: Ester, doseMG: number, washoutH: number, extras = {}) {
    const sim = runSimulation([dose(route, ester, doseMG, NOW_H - washoutH, extras)], BW)!;
    return trapz(sim.timeH, sim.concPGmL_E2);
}

describe('injection (estradiol esters)', () => {
    const esters = [Ester.EB, Ester.EV, Ester.EC, Ester.EN, Ester.EU];
    const formation: Record<string, number> = {
        [Ester.EB]: 0.1092,
        [Ester.EV]: 0.0623,
        [Ester.EC]: 0.1173,
        [Ester.EN]: 0.12,
        [Ester.EU]: 0.04,
    };

    it.each(esters)('%s: total exposure equals F·D/k3 with F = formation fraction × MW factor', ester => {
        const D = 5;
        const F = formation[ester] * getToE2Factor(ester);
        const expected = toPgMl((D * F) / 0.041);
        expect(relErr(e2AucFor(Route.injection, ester, D, 25_000), expected)).toBeLessThan(0.005);
    });

    it.each(esters)('%s: nothing before the injection, then a positive curve', ester => {
        const sim = runSimulation([dose(Route.injection, ester, 5, NOW_H - 100)], BW)!;
        expect(E2(sim, NOW_H - 100.5)).toBe(0);
        expect(E2(sim, NOW_H - 50)!).toBeGreaterThan(0);
    });

    // Single-dose time to peak, against the targets in "Algorithm Explanation.md"
    // (2025-09-03 entry: EV ≈ 2.1 d, EC ≈ 4 d, EN ≈ 6.5 d). The model lands within
    // 15% of each; EN peaks earliest relative to its target (≈ 5.9 d).
    it.each([
        [Ester.EV, 2.1],
        [Ester.EC, 4.0],
        [Ester.EN, 6.5],
    ])('%s: single-dose Tmax is near the documented %s days', (ester, days) => {
        const t0 = NOW_H - 1000;
        const sim = runSimulation([dose(Route.injection, ester, 5, t0)], BW)!;
        const { tmaxH } = scan(sim, E2, t0, t0 + 24 * 20, 0.25);
        expect(relErr(tmaxH / 24, days)).toBeLessThan(0.15);
    });

    it('the esters keep their expected order of peak timing: EB < EV < EC < EN < EU', () => {
        const t0 = NOW_H - 2000;
        const tmax = esters.map(ester => {
            const sim = runSimulation([dose(Route.injection, ester, 5, t0)], BW)!;
            return scan(sim, E2, t0, t0 + 24 * 30, 0.25).tmaxH;
        });
        for (let i = 1; i < tmax.length; i++) expect(tmax[i]).toBeGreaterThan(tmax[i - 1]);
    });

    it('unesterified E2 has no hydrolysis step but still produces a curve (two-compartment fallback)', () => {
        const sim = runSimulation([dose(Route.injection, Ester.E2, 1, NOW_H - 100)], BW)!;
        expect(scan(sim, E2, NOW_H - 100, NOW_H, 0.25).cmax).toBeGreaterThan(0);
    });
});

describe('oral', () => {
    it('E2: exposure equals F·D/k3 with F = 3%', () => {
        expect(relErr(e2AucFor(Route.oral, Ester.E2, 2, 200), toPgMl((2 * 0.03) / 0.41))).toBeLessThan(0.005);
    });

    it('EV: exposure carries the valerate molecular-weight factor', () => {
        const F = 0.03 * getToE2Factor(Ester.EV);
        expect(relErr(e2AucFor(Route.oral, Ester.EV, 2, 200), toPgMl((2 * F) / 0.41))).toBeLessThan(0.005);
    });

    it('E2 goes through the estrone pool: it peaks about 10 h after the dose, then halves every 14.4 h', () => {
        const t0 = NOW_H - 200;
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, t0)], BW)!;
        const { tmaxH } = scan(sim, E2, t0, t0 + 48);
        expect(tmaxH).toBeGreaterThan(9);
        expect(tmaxH).toBeLessThan(12);
        const halfLife = (24 * Math.LN2) / Math.log(E2(sim, t0 + 48)! / E2(sim, t0 + 72)!);
        expect(relErr(halfLife, 14.36)).toBeLessThan(0.02);
    });

    it('EV falls at its absorption rate (half-life 13.9 h) and peaks earlier than E2', () => {
        const t0 = NOW_H - 200;
        const e2 = scan(runSimulation([dose(Route.oral, Ester.E2, 2, t0)], BW)!, E2, t0, t0 + 48);
        const evSim = runSimulation([dose(Route.oral, Ester.EV, 2, t0)], BW)!;
        const ev = scan(evSim, E2, t0, t0 + 48);
        expect(ev.tmaxH).toBeLessThan(e2.tmaxH);
        const halfLife = (24 * Math.LN2) / Math.log(E2(evSim, t0 + 48)! / E2(evSim, t0 + 72)!);
        expect(relErr(halfLife, Math.LN2 / 0.05)).toBeLessThan(0.02);
    });

    it('CPA lands on the CPA curve in ng/mL with F = 0.7 and k = 0.017/h, and leaves E2 at zero', () => {
        const sim = runSimulation([dose(Route.oral, Ester.CPA, 10, NOW_H - 3000)], BW)!;
        const auc = trapz(sim.timeH, sim.concPGmL_CPA);
        expect(relErr(auc, (((10 * 0.7) / 0.017) * 1e6) / VD_CPA_ML)).toBeLessThan(0.005);
        expect(Math.max(...sim.concPGmL_E2)).toBe(0);
        expect(CPA(sim, NOW_H - 2990)!).toBeGreaterThan(0);
    });
});

describe('sublingual', () => {
    const tierExtras = (tier: number) => ({ [ExtraKey.sublingualTier]: tier });

    it('with θ = 0 the whole trajectory is identical to the oral route (documented consistency check)', () => {
        for (const ester of [Ester.E2, Ester.EV]) {
            const t0 = NOW_H - 200;
            const sl = runSimulation([dose(Route.sublingual, ester, 2, t0, { [ExtraKey.sublingualTheta]: 0 })], BW)!;
            const oral = runSimulation([dose(Route.oral, ester, 2, t0)], BW)!;
            for (let t = t0; t <= t0 + 48; t += 0.5) {
                expect(E2(sl, t)!).toBeCloseTo(E2(oral, t)!, 9);
            }
        }
    });

    it('exposure follows θ·1 + (1 − θ)·3% for each tier', () => {
        const thetas = [0.01, 0.04, 0.11, 0.18];
        thetas.forEach((theta, tier) => {
            const F = theta + (1 - theta) * 0.03;
            expect(
                relErr(e2AucFor(Route.sublingual, Ester.E2, 1, 200, tierExtras(tier)), toPgMl(F / 0.41)),
            ).toBeLessThan(0.005);
        });
    });

    it('a longer hold (higher tier) never gives a lower peak', () => {
        const t0 = NOW_H - 100;
        const peaks = [0, 1, 2, 3].map(
            tier =>
                scan(runSimulation([dose(Route.sublingual, Ester.E2, 1, t0, tierExtras(tier))], BW)!, E2, t0, t0 + 12)
                    .cmax,
        );
        for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeGreaterThan(peaks[i - 1]);
    });

    it('E2 peaks about an hour after the dose ("Algorithm Explanation.md" §6, kSL = 1.8)', () => {
        const t0 = NOW_H - 100;
        const sim = runSimulation([dose(Route.sublingual, Ester.E2, 1, t0, tierExtras(2))], BW)!;
        const { tmaxH } = scan(sim, E2, t0, t0 + 12, 0.01);
        expect(tmaxH).toBeGreaterThan(0.8);
        expect(tmaxH).toBeLessThan(1.5);
    });

    it('an explicit θ wins over a tier, and is clamped into [0, 1]', () => {
        const both = getBioavailabilityMultiplier(Route.sublingual, Ester.E2, {
            [ExtraKey.sublingualTheta]: 0.5,
            [ExtraKey.sublingualTier]: 0,
        });
        expect(both).toBeCloseTo(0.5 + 0.5 * 0.03, 12);
        expect(getBioavailabilityMultiplier(Route.sublingual, Ester.E2, { [ExtraKey.sublingualTheta]: 7 })).toBeCloseTo(
            1,
            12,
        );
        expect(
            getBioavailabilityMultiplier(Route.sublingual, Ester.E2, { [ExtraKey.sublingualTheta]: -1 }),
        ).toBeCloseTo(0.03, 12);
    });

    it('tier codes are rounded and clamped; no tier at all means standard', () => {
        const F = (extras: object) => getBioavailabilityMultiplier(Route.sublingual, Ester.E2, extras);
        const standard = 0.11 + 0.89 * 0.03;
        expect(F({})).toBeCloseTo(standard, 12);
        expect(F(tierExtras(2.4))).toBeCloseTo(standard, 12);
        expect(F(tierExtras(99))).toBeCloseTo(0.18 + 0.82 * 0.03, 12);
        expect(F(tierExtras(-5))).toBeCloseTo(0.01 + 0.99 * 0.03, 12);
    });

    it('a non-finite tier falls back to standard in the simulation', () => {
        const t0 = NOW_H - 100;
        const nan = runSimulation([dose(Route.sublingual, Ester.E2, 1, t0, tierExtras(NaN))], BW)!;
        const std = runSimulation([dose(Route.sublingual, Ester.E2, 1, t0, tierExtras(2))], BW)!;
        expect(E2(nan, t0 + 1)).toBeCloseTo(E2(std, t0 + 1)!, 9);
    });
});

describe('gel', () => {
    it.each([
        [0, 0.05],
        [1, 0.05],
        [2, 0.25],
    ])('site %i: exposure equals F·D/k3 with F = %s', (site, F) => {
        expect(
            relErr(e2AucFor(Route.gel, Ester.E2, 1, 2000, { [ExtraKey.gelSite]: site }), toPgMl(F / 0.41)),
        ).toBeLessThan(0.005);
    });

    it('a missing or out-of-range site is treated as the arm, or clamped to the last site', () => {
        const F = (extras: object) => getBioavailabilityMultiplier(Route.gel, Ester.E2, extras);
        expect(F({})).toBe(0.05);
        expect(F({ [ExtraKey.gelSite]: 9 })).toBe(0.25);
        expect(F({ [ExtraKey.gelSite]: -3 })).toBe(0.05);
    });

    // Steady-state Cavg from the US labels quoted next to DEFAULT_PK_PARAMS:
    // Divigel 0.25/0.5/1.0 mg/day → 9.8/21/30.5 pg/mL, EstroGel 0.75 mg/day → 28.3.
    // Those figures are not baseline-corrected and Divigel reports %CV of 81-149%,
    // so the check is loose (±30% at 65 kg and 70 kg).
    it.each([
        [0.25, 9.8],
        [0.5, 21],
        [1.0, 30.5],
        [0.75, 28.3],
    ])('%s mg/day reproduces the label Cavg of %s pg/mL within 30%%', (mgPerDay, labelCavg) => {
        for (const weight of [65, 70]) {
            const sim = runSimulation(regimen(Route.gel, Ester.E2, mgPerDay, 24, 40, NOW_H - 24), weight)!;
            const { mean } = scan(sim, E2, NOW_H - 24, NOW_H, 0.1);
            expect(relErr(mean, labelCavg)).toBeLessThan(0.3);
        }
    });
});

describe('patch', () => {
    const rate = (ugPerDay: number) => ({ [ExtraKey.releaseRateUGPerDay]: ugPerDay });

    it('zero-order release approaches rate/k3 while worn', () => {
        const sim = runSimulation([dose(Route.patchApply, Ester.E2, 0, NOW_H - 200, rate(50))], BW)!;
        expect(relErr(E2(sim, NOW_H - 100)!, toPgMl(0.05 / 24 / 0.41))).toBeLessThan(1e-6);
    });

    it('a planned wear time ends delivery, and the level then decays with k3', () => {
        const t0 = NOW_H - 200;
        const sim = runSimulation(
            [dose(Route.patchApply, Ester.E2, 0, t0, { ...rate(100), [ExtraKey.patchWearH]: 72 })],
            BW,
        )!;
        const atRemoval = E2(sim, t0 + 72)!;
        expect(E2(sim, t0 + 74)! / atRemoval).toBeCloseTo(Math.exp(-0.41 * 2), 2);
        expect(E2(sim, t0 + 150)!).toBeLessThan(atRemoval * 1e-6);
    });

    it('an explicit removal wins over the planned wear time', () => {
        const t0 = NOW_H - 200;
        const sim = runSimulation(
            [
                dose(Route.patchApply, Ester.E2, 0, t0, { ...rate(100), [ExtraKey.patchWearH]: 72 }),
                dose(Route.patchRemove, Ester.E2, 0, t0 + 24),
            ],
            BW,
        )!;
        expect(E2(sim, t0 + 48)!).toBeLessThan(E2(sim, t0 + 24)! * 1e-4);
    });

    it('with neither a removal nor a wear time the patch is worn indefinitely', () => {
        const sim = runSimulation([dose(Route.patchApply, Ester.E2, 0, NOW_H - 2000, rate(50))], BW)!;
        expect(relErr(E2(sim, NOW_H)!, toPgMl(0.05 / 24 / 0.41))).toBeLessThan(1e-6);
    });

    it('staggered patches each get their own removal (FIFO), so the second keeps delivering after the first comes off', () => {
        const t0 = NOW_H - 300;
        const sim = runSimulation(
            [
                dose(Route.patchApply, Ester.E2, 0, t0, rate(50)),
                dose(Route.patchApply, Ester.E2, 0, t0 + 48, rate(50)),
                dose(Route.patchRemove, Ester.E2, 0, t0 + 84),
                dose(Route.patchRemove, Ester.E2, 0, t0 + 132),
            ],
            BW,
        )!;
        const onePatch = toPgMl(0.05 / 24 / 0.41);
        expect(relErr(E2(sim, t0 + 40)!, onePatch)).toBeLessThan(1e-3); // only the first is on
        expect(relErr(E2(sim, t0 + 70)!, 2 * onePatch)).toBeLessThan(1e-3); // both on
        expect(relErr(E2(sim, t0 + 110)!, onePatch)).toBeLessThan(1e-3); // first off, second still on
        expect(E2(sim, t0 + 180)!).toBeLessThan(onePatch * 1e-6); // both off
    });

    it('without a release rate it falls back to first-order absorption from the dose (k1 = 0.0075)', () => {
        const t0 = NOW_H - 5000;
        const sim = runSimulation([dose(Route.patchApply, Ester.E2, 2, t0)], BW)!;
        const k1 = 0.0075,
            k3 = 0.41;
        const i = sim.timeH.findIndex(t => t >= t0 + 100);
        const tau = sim.timeH[i] - t0;
        const expected = toPgMl(((2 * k1) / (k1 - k3)) * (Math.exp(-k3 * tau) - Math.exp(-k1 * tau)));
        expect(relErr(sim.concPGmL_E2[i], expected)).toBeLessThan(1e-9);
    });

    it('a patch removal on its own contributes nothing', () => {
        expect(getBioavailabilityMultiplier(Route.patchRemove, Ester.E2)).toBe(0);
        const sim = runSimulation([dose(Route.patchRemove, Ester.E2, 0, NOW_H - 10)], BW)!;
        expect(Math.max(...sim.concPGmL_E2)).toBe(0);
    });
});

describe('testosterone routes', () => {
    const tPerNgDl = (amountMG: number) => (amountMG * 1e8) / VD_T_ML;

    it.each([Ester.TC, Ester.TE, Ester.TU])(
        '%s injection: exposure equals F·D/k3 on the T curve, nothing on E2',
        ester => {
            const sim = runSimulation([dose(Route.injection, ester, 100, NOW_H - 30_000)], BW)!;
            const F = 0.025 * getToE2Factor(ester);
            expect(relErr(trapz(sim.timeH, sim.concNGdL_T), tPerNgDl((100 * F) / 0.035))).toBeLessThan(0.005);
            expect(Math.max(...sim.concPGmL_E2)).toBe(0);
        },
    );

    it('gel uses the site-specific T bioavailability (arm 10%, scrotal 50%) and k = 0.5/h', () => {
        for (const [site, F] of [
            [0, 0.1],
            [2, 0.5],
        ]) {
            const sim = runSimulation([dose(Route.gel, Ester.T, 50, NOW_H - 2000, { [ExtraKey.gelSite]: site })], BW)!;
            expect(relErr(trapz(sim.timeH, sim.concNGdL_T), tPerNgDl((50 * F) / 0.5))).toBeLessThan(0.005);
        }
    });

    // Steady-state targets from the comment above T_CorePK in logic.ts:
    // AndroGel 50 mg/day and Androderm 5 mg/day → C_avg ≈ 500-700 ng/dL.
    it('gel 50 mg/day and a 5 mg/day patch both average 500 to 700 ng/dL at 70 kg', () => {
        const gel = runSimulation(regimen(Route.gel, Ester.T, 50, 24, 30, NOW_H - 24), BW)!;
        const patch = runSimulation(
            regimen(Route.patchApply, Ester.T, 0, 24, 30, NOW_H - 24, {
                [ExtraKey.releaseRateUGPerDay]: 5000,
                [ExtraKey.patchWearH]: 24,
            }),
            BW,
        )!;
        for (const sim of [gel, patch]) {
            const { mean } = scan(sim, T, NOW_H - 24, NOW_H, 0.1);
            expect(mean).toBeGreaterThan(500);
            expect(mean).toBeLessThan(700);
        }
    });

    it('bare T cannot be injected, and oral or sublingual T is not modelled', () => {
        expect(getBioavailabilityMultiplier(Route.injection, Ester.T)).toBe(0);
        for (const route of [Route.injection, Route.oral, Route.sublingual]) {
            const sim = runSimulation([dose(route, Ester.T, 50, NOW_H - 10)], BW)!;
            expect(Math.max(...sim.concNGdL_T)).toBe(0);
        }
    });
});

describe('unmodelled drugs', () => {
    it.each([Ester.SPIRO, Ester.BICA, Ester.MPA, Ester.LEUP, Ester.TRIP, Ester.RLX])(
        '%s draws no curve and does not count as estradiol',
        ester => {
            expect(runSimulation([dose(Route.oral, ester, 100, NOW_H - 10)], BW)).toBeNull();
            const withE2 = runSimulation(
                [dose(Route.oral, ester, 100, NOW_H - 10), dose(Route.oral, Ester.E2, 2, NOW_H - 10)],
                BW,
            )!;
            const alone = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 10)], BW)!;
            expect(E2(withE2, NOW_H - 7)).toBeCloseTo(E2(alone, NOW_H - 7)!, 9);
        },
    );

    it('a drug code from a newer version is left out too', () => {
        expect(runSimulation([dose(Route.oral, 'FUTURE' as Ester, 5, NOW_H - 10)], BW)).toBeNull();
    });
});

describe('cross-check against upstream PKcore (estradiol)', () => {
    // logic.ts takes the ester amount; upstream takes the E2-equivalent amount.
    const cases: {
        name: string;
        route: Route;
        ester: Ester;
        tier?: number;
        extras?: object;
        upRoute: 'injection' | 'oral' | 'sublingual' | 'patchApply';
    }[] = [
        ...([Ester.EB, Ester.EV, Ester.EC, Ester.EN] as const).map(ester => ({
            name: `${ester} injection`,
            route: Route.injection,
            ester,
            upRoute: 'injection' as const,
        })),
        // Oral estradiol, and the swallowed share of sublingual estradiol, now
        // pass through an estrone pool that upstream does not model (see
        // OralPK.kE1Pool), so only the valerate forms are compared.
        { name: 'EV oral', route: Route.oral, ester: Ester.EV, upRoute: 'oral' },
        ...[0, 1, 2, 3].flatMap(tier =>
            [Ester.EV].map(ester => ({
                name: `${ester} sublingual tier ${tier}`,
                route: Route.sublingual,
                ester,
                tier,
                upRoute: 'sublingual' as const,
            })),
        ),
    ];

    // Compared on the simulation's own grid points, so linear interpolation
    // between points plays no part. logic.ts rounds upstream's formation
    // fractions to four decimals (EV 0.0623 vs 0.062258..., a 0.067% shift), hence
    // the 0.1% tolerance. Far in the tail logic.ts stops evaluating a dose once it
    // has decayed below about a millionth of its peak (computeMaxLifetimeH), so
    // points that small are compared against the peak instead.
    function matchesOnGrid(sim: SimulationResult, from: number, to: number, expectedPgMl: (t: number) => number) {
        const points = sim.timeH.filter(t => t >= from && t <= to);
        const peak = Math.max(...points.map(expectedPgMl));
        sim.timeH.forEach((t, i) => {
            if (t < from || t > to) return;
            const expected = expectedPgMl(t);
            const actual = sim.concPGmL_E2[i];
            if (Math.abs(actual - expected) <= 1e-5 * peak) return;
            expect(relErr(actual, expected)).toBeLessThan(1e-3);
        });
        expect(points.length).toBeGreaterThan(100);
    }

    it.each(cases)('$name matches the upstream curve', ({ route, ester, tier, upRoute }) => {
        const t0 = NOW_H - 24 * 60;
        const D = 4;
        const extras = tier === undefined ? {} : { [ExtraKey.sublingualTier]: tier };
        const sim = runSimulation([dose(route, ester, D, t0, extras)], BW)!;
        const up = {
            route: upRoute,
            compound: ester as UpstreamCompound,
            doseE2MG: D * getToE2Factor(ester),
            timeH: t0,
            tier,
        };
        matchesOnGrid(sim, t0 - 24, t0 + 24 * 60, t => toPgMl(upstreamE2Amount(up, t)));
    });

    it('zero-order and first-order patches match the upstream curve', () => {
        const t0 = NOW_H - 500;
        const zero = runSimulation(
            [
                dose(Route.patchApply, Ester.E2, 0, t0, {
                    [ExtraKey.releaseRateUGPerDay]: 100,
                    [ExtraKey.patchWearH]: 84,
                }),
            ],
            BW,
        )!;
        const first = runSimulation([dose(Route.patchApply, Ester.E2, 3, t0, { [ExtraKey.patchWearH]: 84 })], BW)!;
        matchesOnGrid(zero, t0, t0 + 200, t =>
            toPgMl(
                upstreamE2Amount(
                    { route: 'patchApply', compound: 'E2', doseE2MG: 0, timeH: t0, releaseUGPerDay: 100, wearH: 84 },
                    t,
                ),
            ),
        );
        matchesOnGrid(first, t0, t0 + 200, t =>
            toPgMl(upstreamE2Amount({ route: 'patchApply', compound: 'E2', doseE2MG: 3, timeH: t0, wearH: 84 }, t)),
        );
    });
});
