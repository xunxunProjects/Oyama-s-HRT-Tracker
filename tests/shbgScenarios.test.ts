/**
 * Issue #203's question: does a dynamic SHBG change free estradiol enough to
 * matter? Four scenarios, at 70 kg with the default parameters, compare free
 * estradiol with SHBG following the turnover model against SHBG held constant,
 * and then vary the uncertain parameters one at a time. The issue's decision
 * rule: where AUC and Cmin both move by less than 10%, a constant free
 * fraction will do for that scenario.
 *
 * The issue body lost its sections 5–9 in pasting, where the scenarios were
 * spelled out, so these four follow its section 1: long-term exposure, oral
 * administration, and dose escalation, reduction, discontinuation and a
 * change of route.
 *
 * `SHBG_REPORT=1 npx vitest run tests/shbgScenarios.test.ts` prints the
 * tables in Algorithm Explanation §18.
 */
import { describe, expect, it } from 'vitest';
import { DoseEvent, Ester, ExtraKey, Route, runSimulation } from '../logic';
import {
    BindingParams,
    DEFAULT_BINDING,
    DEFAULT_SHBG_MODEL,
    Exposure,
    ShbgModel,
    exposureOver,
    freeEstradiol,
} from '../shbg';
import { BW, NOW_H, regimen } from './helpers';

const DAY = 24;
const WEEK = 7 * DAY;
const patch = (ugPerDay: number) => ({ [ExtraKey.releaseRateUGPerDay]: ugPerDay, [ExtraKey.patchWearH]: 84 });

interface Window {
    label: string;
    fromH: number;
    toH: number;
}

interface Case {
    id: string;
    name: string;
    events: DoseEvent[];
    windows: Window[];
    /** A change of regimen: also compare with SHBG measured just before it and then held. */
    changeH?: number;
}

/** Windows of one dosing interval starting `days` after a change (or ending at the end of a steady regimen). */
const after = (changeH: number, intervalH: number, days: number[]): Window[] =>
    days.map(d => ({ label: `day ${d}`, fromH: changeH + d * DAY, toH: changeH + d * DAY + intervalH }));
const steady = (endH: number, intervalH: number): Window[] => [
    { label: 'steady state', fromH: endH - intervalH, toH: endH },
];

// Everything ends a day before the frozen "now".
const END = NOW_H - DAY;
const START_26W = END - 26 * WEEK;

const cases: Case[] = [
    {
        id: '1a',
        name: 'oral E2 2 mg/day, 26 weeks',
        events: regimen(Route.oral, Ester.E2, 2, DAY, 182, END - DAY),
        windows: steady(END, DAY),
    },
    {
        id: '1b',
        name: 'oral E2 4 mg/day, 26 weeks',
        events: regimen(Route.oral, Ester.E2, 4, DAY, 182, END - DAY),
        windows: steady(END, DAY),
    },
    {
        id: '1c',
        name: 'sublingual E2 2 mg twice a day (standard hold), 26 weeks',
        events: regimen(Route.sublingual, Ester.E2, 2, DAY / 2, 364, END - DAY / 2, {
            [ExtraKey.sublingualTier]: 2,
        }),
        windows: steady(END, DAY),
    },
    {
        id: '2a',
        name: 'EV 5 mg injected weekly, 26 weeks',
        events: regimen(Route.injection, Ester.EV, 5, WEEK, 26, END - WEEK),
        windows: steady(END, WEEK),
    },
    {
        id: '2b',
        name: 'patch 100 µg/day, changed twice a week, 26 weeks',
        events: regimen(Route.patchApply, Ester.E2, 0, 84, 52, END - 84, patch(100)),
        windows: steady(END, 84),
    },
    (() => {
        const up = START_26W + 12 * WEEK;
        return {
            id: '3a',
            name: 'oral E2 2 → 6 mg/day after 12 weeks',
            events: [
                ...regimen(Route.oral, Ester.E2, 2, DAY, 84, up - DAY),
                ...regimen(Route.oral, Ester.E2, 6, DAY, 84, up + 83 * DAY),
            ],
            windows: after(up, DAY, [0, 7, 28, 83]),
            changeH: up,
        };
    })(),
    (() => {
        const down = START_26W + 12 * WEEK;
        return {
            id: '3b',
            name: 'oral E2 6 → 2 mg/day after 12 weeks',
            events: [
                ...regimen(Route.oral, Ester.E2, 6, DAY, 84, down - DAY),
                ...regimen(Route.oral, Ester.E2, 2, DAY, 84, down + 83 * DAY),
            ],
            windows: after(down, DAY, [0, 7, 28, 83]),
            changeH: down,
        };
    })(),
    (() => {
        const stop = START_26W + 12 * WEEK;
        return {
            id: '4a',
            name: 'oral E2 6 mg/day for 12 weeks, then stopped',
            events: regimen(Route.oral, Ester.E2, 6, DAY, 84, stop - DAY),
            // Levels are gone within two weeks; SHBG's return is in the SHBG column of the later rows.
            windows: after(stop, DAY, [0, 7]),
            changeH: stop,
        };
    })(),
    (() => {
        const change = START_26W + 12 * WEEK;
        return {
            id: '4b',
            name: 'oral E2 6 mg/day for 12 weeks, then a 200 µg/day patch',
            events: [
                ...regimen(Route.oral, Ester.E2, 6, DAY, 84, change - DAY),
                ...regimen(Route.patchApply, Ester.E2, 0, 84, 24, change + 23 * 84, patch(200)),
            ],
            windows: after(change, 84, [0, 7, 28, 77]),
            changeH: change,
        };
    })(),
];

interface Row {
    id: string;
    window: string;
    shbgRatio: number;
    /** Dynamic against SHBG held at the untreated baseline. */
    vsBaseline: Exposure;
    /** Dynamic against SHBG measured just before the change and then held (changes of regimen only). */
    vsMeasured: Exposure | null;
}

const change = (a: Exposure, b: Exposure): Exposure => ({
    auc: a.auc / b.auc - 1,
    cmax: a.cmax / b.cmax - 1,
    cmin: a.cmin / b.cmin - 1,
});

function evaluate(c: Case, model: ShbgModel = DEFAULT_SHBG_MODEL, binding: BindingParams = DEFAULT_BINDING): Row[] {
    const sim = runSimulation(c.events, BW, null, { swallowedE2: true })!;
    const dynamic = freeEstradiol(sim, { shbg: 'dynamic', model, binding });
    const baseline = freeEstradiol(sim, { shbg: 'constant', model, binding });
    const measuredNM =
        c.changeH === undefined ? null : exposureOver(sim.timeH, dynamic.shbgNM, c.changeH, c.changeH).cmax;
    const measured =
        measuredNM === null
            ? null
            : freeEstradiol(sim, { shbg: 'constant', model: { ...model, baselineNM: measuredNM }, binding });
    return c.windows.map(w => {
        const over = (values: number[]) => exposureOver(sim.timeH, values, w.fromH, w.toH);
        const dyn = over(dynamic.freePgML);
        const shbg = over(dynamic.shbgNM);
        return {
            id: c.id,
            window: w.label,
            shbgRatio: shbg.auc / (w.toH - w.fromH) / model.baselineNM,
            vsBaseline: change(dyn, over(baseline.freePgML)),
            vsMeasured: measured ? change(dyn, over(measured.freePgML)) : null,
        };
    });
}

/** The issue's rule: AUC and Cmin both within 10%. */
const constantWillDo = (e: Exposure) => Math.abs(e.auc) < 0.1 && Math.abs(e.cmin) < 0.1;

const byId = (id: string) => cases.find(c => c.id === id)!;
const rows = cases.flatMap(c => evaluate(c));
const row = (id: string, window: string) => rows.find(r => r.id === id && r.window === window)!;

const variations: { name: string; model?: Partial<ShbgModel>; binding?: Partial<BindingParams> }[] = [
    { name: 'defaults' },
    { name: 'SHBG half-life 3.5 days', model: { halfLifeH: 3.5 * DAY } },
    { name: 'SHBG half-life 14 days', model: { halfLifeH: 14 * DAY } },
    { name: 'baseline SHBG 20 nmol/L', model: { baselineNM: 20 } },
    { name: 'baseline SHBG 80 nmol/L', model: { baselineNM: 80 } },
    { name: 'Dunn-type constants (SHBG 6.8e8, albumin 6.0e4 L/mol)', binding: { kShbg: 6.8e8, kAlbumin: 6.0e4 } },
    { name: 'two sites per SHBG at the same constant', binding: { sitesPerShbg: 2 } },
    { name: 'albumin 35 g/L', binding: { albuminGL: 35 } },
    {
        name: 'induction halved (both emax × 0.5)',
        model: {
            induction: {
                oral: { ...DEFAULT_SHBG_MODEL.induction.oral, emax: 1.5 },
                parenteral: { ...DEFAULT_SHBG_MODEL.induction.parenteral, emax: 1 },
            },
        },
    },
    {
        name: 'induction × 1.5 (both emax)',
        model: {
            induction: {
                oral: { ...DEFAULT_SHBG_MODEL.induction.oral, emax: 4.5 },
                parenteral: { ...DEFAULT_SHBG_MODEL.induction.parenteral, emax: 3 },
            },
        },
    },
    {
        name: 'parenteral least-squares fit (emax 1.4, EC50 262.5)',
        model: {
            induction: {
                ...DEFAULT_SHBG_MODEL.induction,
                parenteral: { emax: 1.4, ec50PgML: 262.5, hill: 1 },
            },
        },
    },
    {
        name: 'parenteral reaching pregnancy (emax 6, EC50 2000)',
        model: {
            induction: {
                ...DEFAULT_SHBG_MODEL.induction,
                parenteral: { emax: 6, ec50PgML: 2000, hill: 1 },
            },
        },
    },
];

const sensitivityTargets: { id: string; window: string; against: 'baseline' | 'measured' }[] = [
    { id: '1b', window: 'steady state', against: 'baseline' },
    { id: '2a', window: 'steady state', against: 'baseline' },
    { id: '2b', window: 'steady state', against: 'baseline' },
    { id: '4b', window: 'day 7', against: 'measured' },
    { id: '4b', window: 'day 28', against: 'measured' },
];

const sensitivity = variations.map(v => {
    const model = { ...DEFAULT_SHBG_MODEL, ...v.model };
    const binding = { ...DEFAULT_BINDING, ...v.binding };
    return {
        name: v.name,
        results: sensitivityTargets.map(t => {
            const r = evaluate(byId(t.id), model, binding).find(x => x.window === t.window)!;
            return t.against === 'baseline' ? r.vsBaseline : r.vsMeasured!;
        }),
    };
});

const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

if (process.env.SHBG_REPORT) {
    const lines = [
        '| | Window | SHBG × baseline | ΔAUC | ΔCmax | ΔCmin | ΔAUC vs SHBG before the change | ΔCmin vs SHBG before the change |',
        '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
        ...rows.map(
            r =>
                `| ${r.id} | ${r.window} | ${r.shbgRatio.toFixed(2)} | ${pct(r.vsBaseline.auc)} | ${pct(r.vsBaseline.cmax)} | ${pct(r.vsBaseline.cmin)} | ${r.vsMeasured ? pct(r.vsMeasured.auc) : ''} | ${r.vsMeasured ? pct(r.vsMeasured.cmin) : ''} |`,
        ),
        '',
        `| Variation | ${sensitivityTargets.map(t => `${t.id} ${t.window}`).join(' | ')} |`,
        `| --- | ${sensitivityTargets.map(() => '---:').join(' | ')} |`,
        ...sensitivity.map(s => `| ${s.name} | ${s.results.map(e => `${pct(e.auc)} / ${pct(e.cmin)}`).join(' | ')} |`),
    ];
    console.log(cases.map(c => `${c.id}: ${c.name}`).join('\n') + '\n\n' + lines.join('\n'));
}

describe('dynamic SHBG against a constant free fraction (issue #203)', () => {
    it('matters on oral and sublingual estradiol at steady state', () => {
        for (const id of ['1a', '1b', '1c']) expect(constantWillDo(row(id, 'steady state').vsBaseline)).toBe(false);
        expect(row('1b', 'steady state').vsBaseline.auc).toBeCloseTo(-0.33, 2);
    });

    it('matters on weekly EV injections, and not on a 100 µg/day patch', () => {
        expect(constantWillDo(row('2a', 'steady state').vsBaseline)).toBe(false);
        expect(row('2a', 'steady state').vsBaseline.auc).toBeCloseTo(-0.16, 2);
        expect(constantWillDo(row('2b', 'steady state').vsBaseline)).toBe(true);
        expect(row('2b', 'steady state').vsBaseline.auc).toBeCloseTo(-0.07, 2);
    });

    it('lags a change of regimen, so even SHBG measured just before it misleads for weeks', () => {
        // The first day after a change SHBG has barely moved.
        expect(Math.abs(row('3a', 'day 0').vsMeasured!.auc)).toBeLessThan(0.01);
        expect(constantWillDo(row('3a', 'day 83').vsMeasured!)).toBe(false);
        expect(constantWillDo(row('3b', 'day 83').vsMeasured!)).toBe(false);
        expect(constantWillDo(row('4b', 'day 28').vsMeasured!)).toBe(false);
        expect(row('4b', 'day 28').vsMeasured!.auc).toBeCloseTo(0.36, 2);
    });

    it('keeps the oral and route-change conclusions under every variation', () => {
        for (const s of sensitivity) {
            expect(constantWillDo(s.results[0]), s.name).toBe(false);
            expect(constantWillDo(s.results[4]), s.name).toBe(false);
        }
    });
});
