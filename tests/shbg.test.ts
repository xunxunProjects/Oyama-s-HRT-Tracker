/**
 * The optional SHBG submodel in shbg.ts (issue #203): exact binding, SHBG
 * turnover, and the swallowed share of estradiol that drives it. None of it
 * changes what runSimulation returns unless asked.
 */
import { describe, expect, it } from 'vitest';
import { Ester, ExtraKey, Route, runSimulation } from '../logic';
import {
    DEFAULT_BINDING,
    DEFAULT_SHBG_MODEL,
    bindEstradiol,
    exposureOver,
    freeEstradiol,
    shbgCurve,
    shbgRise,
} from '../shbg';
import { BW, NOW_H, dose, regimen, relErr } from './helpers';

const DAY = 24;
const patch = (ugPerDay: number, wearH = 84) => ({
    [ExtraKey.releaseRateUGPerDay]: ugPerDay,
    [ExtraKey.patchWearH]: wearH,
});
/** SHBG at time t, read off a curve on the simulation's grid. */
const shbgAt = (sim: { timeH: number[] }, shbg: number[], t: number) => exposureOver(sim.timeH, shbg, t, t + 1e-6).cmax;

describe('estradiol binding', () => {
    it('splits estradiol as published tables do at SHBG 50 nmol/L', () => {
        // Dunn et al. 1981, women: 1.81% free, 37.3% on SHBG, 60.8% on
        // albumin. Measured free fractions run 1.5–2.2%.
        const b = bindEstradiol(100, 50);
        expect(b.fractionFree).toBeGreaterThan(0.015);
        expect(b.fractionFree).toBeLessThan(0.025);
        expect(b.fractionShbg).toBeGreaterThan(0.33);
        expect(b.fractionShbg).toBeLessThan(0.4);
        expect(b.fractionAlbumin).toBeGreaterThan(0.58);
        expect(b.fractionAlbumin).toBeLessThan(0.65);
        expect(b.fractionFree + b.fractionShbg + b.fractionAlbumin).toBeCloseTo(1, 12);
    });

    it('balances mass exactly, saturated or not', () => {
        const p = DEFAULT_BINDING;
        const molar = 1e-9 / 272.38;
        for (const total of [0.01, 50, 1000, 20000, 1e7]) {
            for (const shbg of [0, 10, 50, 400]) {
                const b = bindEstradiol(total, shbg);
                const free = b.freePgML * molar;
                const sites = shbg * 1e-9 * p.sitesPerShbg;
                const albumin = p.albuminGL / 66_500;
                const back =
                    free +
                    (sites * p.kShbg * free) / (1 + p.kShbg * free) +
                    (albumin * p.kAlbumin * free) / (1 + p.kAlbumin * free);
                expect(relErr(back, total * molar)).toBeLessThan(1e-12);
            }
        }
    });

    it('holds the free fraction within 1% from trace levels to 1000 pg/mL, and saturates at pregnancy levels', () => {
        const trace = bindEstradiol(1e-3, 50).fractionFree;
        expect(relErr(bindEstradiol(1000, 50).fractionFree, trace)).toBeLessThan(0.01);
        // At 20,000 pg/mL the SHBG sites start to fill and more is left free.
        expect(bindEstradiol(20000, 50).fractionFree / trace).toBeGreaterThan(1.05);
    });

    it('frees less estradiol the more SHBG there is', () => {
        const fractions = [0, 25, 50, 100, 200].map(s => bindEstradiol(100, s).fractionFree);
        for (let i = 1; i < fractions.length; i++) expect(fractions[i]).toBeLessThan(fractions[i - 1]);
    });

    it('gives the unsaturated split with no estradiol at all', () => {
        const none = bindEstradiol(0, 50);
        expect(none.freePgML).toBe(0);
        expect(none.fractionFree).toBeCloseTo(bindEstradiol(1e-6, 50).fractionFree, 12);
    });

    it('counts sites per SHBG molecule: two sites at half the affinity bind as one site does until they fill', () => {
        const two = { ...DEFAULT_BINDING, sitesPerShbg: 2, kShbg: DEFAULT_BINDING.kShbg / 2 };
        expect(relErr(bindEstradiol(100, 50, two).fractionFree, bindEstradiol(100, 50).fractionFree)).toBeLessThan(
            1e-3,
        );
        // Two sites at the same affinity double SHBG's share instead.
        const doubled = bindEstradiol(100, 50, { ...DEFAULT_BINDING, sitesPerShbg: 2 });
        expect(doubled.fractionFree).toBeCloseTo(bindEstradiol(100, 100).fractionFree, 12);
    });
});

describe('swallowed share of estradiol', () => {
    const t0 = NOW_H - 30 * DAY;
    const mixed = [
        ...regimen(Route.oral, Ester.E2, 2, DAY, 20, NOW_H - DAY),
        ...regimen(Route.sublingual, Ester.E2, 1, DAY, 20, NOW_H - DAY / 2, { [ExtraKey.sublingualTier]: 2 }),
        ...regimen(Route.injection, Ester.EV, 5, 7 * DAY, 4, NOW_H - 2 * DAY),
        dose(Route.patchApply, Ester.E2, 0, t0, patch(100)),
        dose(Route.gel, Ester.E2, 1.5, t0 + DAY),
        dose(Route.oral, Ester.CPA, 12.5, t0),
    ];

    it('is only returned when asked for, and asking changes nothing else', () => {
        const plain = runSimulation(mixed, BW)!;
        const split = runSimulation(mixed, BW, null, { swallowedE2: true })!;
        expect(plain.concPGmL_E2_swallowed).toBeUndefined();
        expect(split.timeH).toEqual(plain.timeH);
        expect(split.concPGmL_E2).toEqual(plain.concPGmL_E2);
        expect(split.concPGmL_CPA).toEqual(plain.concPGmL_CPA);
        expect(split.auc).toBe(plain.auc);
        expect(split.concPGmL_E2_swallowed).toHaveLength(plain.timeH.length);
    });

    it('is all of an oral dose and none of an injection, patch or gel', () => {
        const oral = runSimulation([dose(Route.oral, Ester.EV, 2, t0)], BW, null, { swallowedE2: true })!;
        expect(oral.concPGmL_E2_swallowed).toEqual(oral.concPGmL_E2);
        const other = runSimulation(
            [
                dose(Route.injection, Ester.EV, 5, t0),
                dose(Route.patchApply, Ester.E2, 0, t0, patch(100)),
                dose(Route.gel, Ester.E2, 1.5, t0),
            ],
            BW,
            null,
            { swallowedE2: true },
        )!;
        expect(Math.max(...other.concPGmL_E2_swallowed!)).toBe(0);
        expect(Math.max(...other.concPGmL_E2)).toBeGreaterThan(0);
    });

    it("is a sublingual dose's swallowed branch: the oral curve of the share not absorbed in the mouth", () => {
        const theta = 0.11;
        for (const ester of [Ester.E2, Ester.EV]) {
            const sl = runSimulation(
                [dose(Route.sublingual, ester, 2, t0, { [ExtraKey.sublingualTheta]: theta })],
                BW,
                null,
                { swallowedE2: true },
            )!;
            const oral = runSimulation([dose(Route.oral, ester, 2 * (1 - theta), t0)], BW)!;
            for (const h of [1, 4, 12, 48]) {
                const i = sl.timeH.findIndex(t => t >= t0 + h);
                const j = oral.timeH.findIndex(t => t >= t0 + h);
                expect(sl.timeH[i]).toBe(oral.timeH[j]);
                expect(relErr(sl.concPGmL_E2_swallowed![i], oral.concPGmL_E2[j])).toBeLessThan(1e-12);
                // The mucosal share sits on top of it while it lasts. Plain
                // estradiol's is gone within a day (OralPK.kElimSL), after
                // which the two are the same number.
                if (h <= 12) expect(sl.concPGmL_E2_swallowed![i]).toBeLessThan(sl.concPGmL_E2[i]);
                else expect(sl.concPGmL_E2_swallowed![i]).toBeLessThanOrEqual(sl.concPGmL_E2[i]);
            }
        }
    });
});

describe('SHBG over time', () => {
    it('sits at the baseline before the first dose', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW, null, { swallowedE2: true })!;
        expect(shbgCurve(sim)[0]).toBe(DEFAULT_SHBG_MODEL.baselineNM);
    });

    it('moves halfway to a new level in one half-life', () => {
        // A patch holds its level within hours, so SHBG sees a step.
        const t0 = NOW_H - 120 * DAY;
        const sim = runSimulation(regimen(Route.patchApply, Ester.E2, 0, 84, 32, t0 + 31 * 84, patch(100)), BW, null, {
            swallowedE2: true,
        })!;
        const shbg = shbgCurve(sim);
        const base = DEFAULT_SHBG_MODEL.baselineNM;
        const settled = shbgAt(sim, shbg, t0 + 105 * DAY);
        const halfway = shbgAt(sim, shbg, t0 + 7 * DAY);
        expect((halfway - base) / (settled - base)).toBeGreaterThan(0.45);
        expect((halfway - base) / (settled - base)).toBeLessThan(0.55);
    });

    it('settles where the compiled data put it: about 2.1x on oral 2 mg/day, 1.25x on a 100 µg/day patch', () => {
        const oral = runSimulation(regimen(Route.oral, Ester.E2, 2, DAY, 120, NOW_H - DAY), BW, null, {
            swallowedE2: true,
        })!;
        const onPatch = runSimulation(
            regimen(Route.patchApply, Ester.E2, 0, 84, 35, NOW_H - 84, patch(100)),
            BW,
            null,
            {
                swallowedE2: true,
            },
        )!;
        const ratio = (sim: typeof oral) => shbgAt(sim, shbgCurve(sim), NOW_H) / DEFAULT_SHBG_MODEL.baselineNM;
        expect(ratio(oral)).toBeGreaterThan(2.0);
        expect(ratio(oral)).toBeLessThan(2.2);
        expect(ratio(onPatch)).toBeGreaterThan(1.2);
        expect(ratio(onPatch)).toBeLessThan(1.3);
    });

    it('rises more from swallowed estradiol than from the same level any other way', () => {
        expect(shbgRise(50, 0)).toBeGreaterThan(5 * shbgRise(0, 50));
        // Together, the routes share one ceiling.
        const { oral, parenteral } = DEFAULT_SHBG_MODEL.induction;
        expect(shbgRise(1e6, 1e6)).toBeLessThanOrEqual(Math.max(oral.emax, parenteral.emax));
        expect(shbgRise(1e9, 0)).toBeCloseTo(oral.emax, 3);
    });

    it('lags behind a stop, so the same total estradiol is less free after oral treatment', () => {
        // Twelve weeks of oral 6 mg/day, then a 100 µg/day patch: SHBG is
        // still high in the first weeks on the patch.
        const switchH = NOW_H - 12 * 7 * DAY;
        const events = [
            ...regimen(Route.oral, Ester.E2, 6, DAY, 84, switchH - DAY),
            ...regimen(Route.patchApply, Ester.E2, 0, 84, 24, switchH + 23 * 84, patch(100)),
        ];
        const sim = runSimulation(events, BW, null, { swallowedE2: true })!;
        const free = freeEstradiol(sim, { shbg: 'dynamic' });
        const early = exposureOver(sim.timeH, free.fractionFree, switchH + 7 * DAY, switchH + 7 * DAY + 84);
        const late = exposureOver(sim.timeH, free.fractionFree, switchH + 70 * DAY, switchH + 70 * DAY + 84);
        expect(early.cmax).toBeLessThan(late.cmin * 0.9);
    });

    it('needs the swallowed share', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        expect(() => shbgCurve(sim)).toThrow(/swallowedE2/);
    });
});

describe('free estradiol', () => {
    const sim = runSimulation(regimen(Route.oral, Ester.E2, 4, DAY, 60, NOW_H - DAY), BW, null, {
        swallowedE2: true,
    })!;

    it("holds SHBG and the free fraction steady with SHBG 'constant'", () => {
        const free = freeEstradiol(sim, { shbg: 'constant' });
        expect(new Set(free.shbgNM).size).toBe(1);
        const { cmax, cmin } = exposureOver(sim.timeH, free.fractionFree, sim.timeH[0], NOW_H);
        expect(relErr(cmin, cmax)).toBeLessThan(0.01);
    });

    it("matches 'constant' when estradiol raises no SHBG", () => {
        const none = { emax: 0, ec50PgML: 1, hill: 1 };
        const model = { ...DEFAULT_SHBG_MODEL, induction: { oral: none, parenteral: none } };
        const dynamic = freeEstradiol(sim, { shbg: 'dynamic', model });
        const constant = freeEstradiol(sim, { shbg: 'constant', model });
        for (let i = 0; i < sim.timeH.length; i += 97) {
            expect(relErr(dynamic.freePgML[i] + 1e-12, constant.freePgML[i] + 1e-12)).toBeLessThan(1e-12);
        }
    });

    it('is the total times the free fraction', () => {
        const free = freeEstradiol(sim, { shbg: 'dynamic' });
        const i = sim.timeH.length - 1;
        expect(free.freePgML[i]).toBeCloseTo(sim.concPGmL_E2[i] * free.fractionFree[i], 12);
    });
});

describe('exposureOver', () => {
    it('integrates and reads the ends by linear interpolation', () => {
        const t = [0, 1, 2, 3];
        const v = [0, 2, 4, 0];
        expect(exposureOver(t, v, 0.5, 2.5)).toEqual({ auc: 0.75 + 3 + 1.5, cmax: 4, cmin: 1 });
    });
});
