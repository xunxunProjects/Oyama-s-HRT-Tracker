/**
 * Estradiol's binding in plasma, and an optional model of SHBG that rises with
 * estradiol exposure (issue #203; Algorithm Explanation §18).
 *
 * The level model in logic.ts works in total estradiol: what labs measure and
 * what its clearance k3 was fitted to. It has no binding proteins, so the share
 * of that total that is free is, implicitly, a constant. This file sits beside
 * it and changes none of it:
 *
 *   - bindEstradiol splits a total into free, SHBG-bound and albumin-bound
 *     estradiol by mass action, both binders saturable, solved exactly.
 *   - shbgCurve follows SHBG over a simulation as a turnover model in which
 *     estradiol raises its synthesis in the liver, far more when swallowed.
 *   - freeEstradiol puts the two together, with SHBG either held at its
 *     baseline (the constant free fraction the app has always implied) or
 *     following shbgCurve.
 *
 * Nothing in the app calls it. The dynamic model stays off until timed lab
 * results with SHBG, ideally with measured free estradiol, show it predicts
 * better than a constant free fraction (§18 has the scenarios, the
 * sensitivity analysis and the decision rule).
 */
import type { SimulationResult } from './logic';

/** mol/L of estradiol per pg/mL (MW 272.38). */
const MOLAR_PER_PG_ML = 1e-9 / 272.38;
/** g/mol of human serum albumin. */
const ALBUMIN_G_PER_MOL = 66_500;

export interface BindingParams {
    /** Estradiol's association constant for one SHBG binding site at 37 °C, L/mol. */
    kShbg: number;
    /** Estradiol's association constant for albumin at 37 °C, L/mol. */
    kAlbumin: number;
    /**
     * Binding sites per SHBG molecule as the lab reports it. SHBG circulates
     * as a dimer with a site in each half, but kShbg was fitted counting one
     * site per molecule measured, as free hormone calculators do. 2 with the
     * same kShbg doubles SHBG's share, so change the two together.
     */
    sitesPerShbg: number;
    /** Albumin, g/L. */
    albuminGL: number;
}

/**
 * Södergård et al. 1982 (J Steroid Biochem 16:801), 37 °C, as quoted by free
 * estradiol calculators; the paper itself was not at hand. At SHBG 50 nmol/L
 * they put 2.3% of estradiol free, 36% on SHBG and 62% on albumin, against
 * 1.8%, 37% and 61% in Dunn et al. 1981's table for women and 1.5–2.2%
 * measured free by dialysis and ultrafiltration. Albumin 43 g/L is mid-range.
 */
export const DEFAULT_BINDING: BindingParams = {
    kShbg: 3.14e8,
    kAlbumin: 4.21e4,
    sitesPerShbg: 1,
    albuminGL: 43,
};

export interface E2Binding {
    freePgML: number;
    fractionFree: number;
    fractionShbg: number;
    fractionAlbumin: number;
}

/**
 * Free and bound estradiol at a total (pg/mL) and an SHBG level (nmol/L).
 * Exact for one ligand on two saturable binders; testosterone and DHT, which
 * compete for the same SHBG sites, are left out (at the levels of people on
 * estradiol they take a few percent of the sites at most).
 */
export function bindEstradiol(totalPgML: number, shbgNM: number, p: BindingParams = DEFAULT_BINDING): E2Binding {
    const total = Math.max(0, totalPgML) * MOLAR_PER_PG_ML;
    const sites = Math.max(0, shbgNM) * 1e-9 * p.sitesPerShbg;
    const albumin = Math.max(0, p.albuminGL) / ALBUMIN_G_PER_MOL;
    // Free estradiol f solves f + sites·Ks·f/(1 + Ks·f) + albumin·Ka·f/(1 + Ka·f) = total.
    // The left side rises and is concave in f, so Newton's method from f = 0
    // climbs to the root from below without overshooting. Its first step is
    // the unsaturated answer, total / (1 + sites·Ks + albumin·Ka), and
    // saturation only matters near pregnancy levels.
    let free = 0;
    for (let i = 0; i < 100; i++) {
        const onShbg = 1 + p.kShbg * free;
        const onAlbumin = 1 + p.kAlbumin * free;
        const excess = free + (sites * p.kShbg * free) / onShbg + (albumin * p.kAlbumin * free) / onAlbumin - total;
        const slope = 1 + (sites * p.kShbg) / (onShbg * onShbg) + (albumin * p.kAlbumin) / (onAlbumin * onAlbumin);
        const step = -excess / slope;
        free += step;
        if (step <= free * 1e-15) break;
    }
    // Bound per unit free; with no estradiol at all these give the limit.
    const shbgRatio = (sites * p.kShbg) / (1 + p.kShbg * free);
    const albuminRatio = (albumin * p.kAlbumin) / (1 + p.kAlbumin * free);
    const sum = 1 + shbgRatio + albuminRatio;
    const fractionFree = 1 / sum;
    return {
        freePgML: Math.max(0, totalPgML) * fractionFree,
        fractionFree,
        fractionShbg: shbgRatio / sum,
        fractionAlbumin: albuminRatio / sum,
    };
}

/** How strongly estradiol from one kind of route raises SHBG synthesis. */
export interface ShbgInduction {
    /** Largest rise, as a fraction of baseline: 2 is three times the baseline. */
    emax: number;
    /** Estradiol level from this kind of route that gives half the largest rise, pg/mL. */
    ec50PgML: number;
    /** Hill coefficient; 1 is a plain saturating curve. */
    hill: number;
}

/**
 * Swallowed estradiol reaches the liver, where SHBG is made, before the rest
 * of the body, so at the same level in the blood it raises SHBG far more. Oral
 * doses and the swallowed share of sublingual ones count as oral; injections,
 * patches, gel and what a sublingual dose absorbs through the mouth count as
 * parenteral.
 */
export type ShbgRouteClass = 'oral' | 'parenteral';

export interface ShbgModel {
    /** SHBG before any estradiol, nmol/L. */
    baselineNM: number;
    /** Half-life of SHBG in blood, hours. */
    halfLifeH: number;
    induction: Record<ShbgRouteClass, ShbgInduction>;
}

/**
 * Baseline: between adult men's typical SHBG (about 30–35 nmol/L) and women's
 * (about 50–60), since people start from either; a lab value is better.
 *
 * Half-life: 7 days, the figure Labcorp's test information gives; no primary
 * human measurement was at hand. With it a new level is 88% reached in three
 * weeks, the time Ropponen et al. 2005 found oral estradiol had already
 * raised SHBG.
 *
 * Induction: fitted to the route and dose table in Transfem Science's
 * "The Interactions of Sex Hormones with SHBG" (Aly 2020, Table 2), taking for
 * each regimen this model's own mean level at 70 kg, since that is what will
 * drive it. Oral: 1 and 2 mg/day raise SHBG 1.6 and 2.2 times (Kuhl 1998),
 * 4 mg/day 1.9–3.2 times, oral EV 6 mg/day 2.5–3.0 times; the fit gives 1.7,
 * 2.1, 2.6 and 2.7. Parenteral: patches of 50, 100, 200, 300 and 600 µg/day
 * raise it 1.1, 1.2, 1.5, 1.7 and 2.3 times, estradiol undecylate 100 mg a
 * month 2.0 and polyestradiol phosphate 320 mg a month 1.7; the fit gives 1.1,
 * 1.3, 1.5, 1.6, 1.9, 2.1 and 2.2. The data do not pin emax and ec50 apart,
 * only the curve across these levels, and they say nothing of a Hill
 * coefficient, so it is 1. Late pregnancy (5–10 times at about 20,000 pg/mL)
 * and injected EV with an antiandrogen in trans women (3.2 times) sit above
 * the parenteral fit; see §18 for why they were left out of it.
 */
export const DEFAULT_SHBG_MODEL: ShbgModel = {
    baselineNM: 40,
    halfLifeH: 7 * 24,
    induction: {
        oral: { emax: 3, ec50PgML: 75, hill: 1 },
        parenteral: { emax: 2, ec50PgML: 500, hill: 1 },
    },
};

/**
 * Fractional rise in SHBG synthesis (0 = none) from the estradiol levels each
 * kind of route has put in the blood. One route alone gives
 * emax·C^h / (ec50^h + C^h). Together they share one ceiling, as two agonists
 * on one receptor do: the rise is a weighted mean of the two emax values and
 * never exceeds the larger.
 */
export function shbgRise(
    oralPgML: number,
    parenteralPgML: number,
    induction: Record<ShbgRouteClass, ShbgInduction> = DEFAULT_SHBG_MODEL.induction,
): number {
    const drive = (c: number, p: ShbgInduction) => (c > 0 ? (c / p.ec50PgML) ** p.hill : 0);
    const oral = drive(oralPgML, induction.oral);
    const parenteral = drive(parenteralPgML, induction.parenteral);
    return (induction.oral.emax * oral + induction.parenteral.emax * parenteral) / (1 + oral + parenteral);
}

/**
 * SHBG (nmol/L) at each point of a simulation:
 * dS/dt = k·(baseline·(1 + rise(t)) − S), k = ln 2 / half-life, starting at
 * the baseline 24 h before the first dose, as the level model starts from no
 * estradiol. Each step is integrated exactly with the target taken as linear
 * between grid points. The simulation must carry the swallowed share of its
 * estradiol: runSimulation(events, weight, birthYear, { swallowedE2: true }).
 */
export function shbgCurve(sim: SimulationResult, model: ShbgModel = DEFAULT_SHBG_MODEL): number[] {
    const swallowed = sim.concPGmL_E2_swallowed;
    if (!swallowed) throw new Error('shbgCurve needs runSimulation(..., { swallowedE2: true })');
    const k = Math.LN2 / model.halfLifeH;
    const target = sim.concPGmL_E2.map(
        (total, i) =>
            model.baselineNM *
            (1 + shbgRise(Math.max(0, swallowed[i]), Math.max(0, total - swallowed[i]), model.induction)),
    );
    const shbg = [model.baselineNM];
    for (let i = 1; i < target.length; i++) {
        const kdt = k * (sim.timeH[i] - sim.timeH[i - 1]);
        const prev = shbg[i - 1];
        if (!(kdt > 0)) {
            shbg.push(prev);
            continue;
        }
        const decay = Math.exp(-kdt);
        const lag = -Math.expm1(-kdt) / kdt;
        shbg.push(target[i] + (prev - target[i - 1]) * decay - (target[i] - target[i - 1]) * lag);
    }
    return shbg;
}

export interface FreeEstradiolOptions {
    /**
     * 'constant': SHBG stays at the model's baseline, so the free fraction is
     * constant up to the binding's saturation (under 1% below 1000 pg/mL).
     * 'dynamic': SHBG follows shbgCurve.
     */
    shbg: 'constant' | 'dynamic';
    model?: ShbgModel;
    binding?: BindingParams;
}

export interface FreeEstradiol {
    shbgNM: number[];
    freePgML: number[];
    fractionFree: number[];
}

/** Free estradiol (pg/mL) at each point of a simulation, on its time grid. */
export function freeEstradiol(sim: SimulationResult, options: FreeEstradiolOptions): FreeEstradiol {
    const model = options.model ?? DEFAULT_SHBG_MODEL;
    const binding = options.binding ?? DEFAULT_BINDING;
    const shbgNM = options.shbg === 'dynamic' ? shbgCurve(sim, model) : sim.timeH.map(() => model.baselineNM);
    const bound = sim.concPGmL_E2.map((total, i) => bindEstradiol(total, shbgNM[i], binding));
    return {
        shbgNM,
        freePgML: bound.map(b => b.freePgML),
        fractionFree: bound.map(b => b.fractionFree),
    };
}

export interface Exposure {
    /** Area under the curve, unit·h. */
    auc: number;
    cmax: number;
    cmin: number;
}

/** AUC (trapezoids), peak and trough of a curve over [fromH, toH], reading both ends by linear interpolation. */
export function exposureOver(timeH: number[], values: number[], fromH: number, toH: number): Exposure {
    const at = (t: number) => {
        let lo = 0;
        let hi = timeH.length - 1;
        if (t <= timeH[lo]) return values[lo];
        if (t >= timeH[hi]) return values[hi];
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (timeH[mid] <= t) lo = mid;
            else hi = mid;
        }
        return values[lo] + ((values[hi] - values[lo]) * (t - timeH[lo])) / (timeH[hi] - timeH[lo]);
    };
    const points: [number, number][] = [[fromH, at(fromH)]];
    for (let i = 0; i < timeH.length; i++) {
        if (timeH[i] > fromH && timeH[i] < toH) points.push([timeH[i], values[i]]);
    }
    points.push([toH, at(toH)]);
    let auc = 0;
    let cmax = -Infinity;
    let cmin = Infinity;
    for (let i = 0; i < points.length; i++) {
        const [t, c] = points[i];
        cmax = Math.max(cmax, c);
        cmin = Math.min(cmin, c);
        if (i > 0) auc += 0.5 * (c + points[i - 1][1]) * (t - points[i - 1][0]);
    }
    return { auc, cmax, cmin };
}
