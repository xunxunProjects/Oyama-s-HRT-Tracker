// Shared PK constants and drug classification helpers.
import { Ester, LabAssay } from './types';
import type { PKCustomParams } from './types';

export const T_ESTERS: ReadonlySet<Ester> = new Set<Ester>([Ester.T, Ester.TC, Ester.TE, Ester.TU]);

export function isTestosteroneEster(e: Ester): boolean {
    return T_ESTERS.has(e);
}

export const UNMODELLED_DRUGS: ReadonlySet<Ester> = new Set<Ester>([
    Ester.SPIRO,
    Ester.MPA,
    Ester.LEUP,
    Ester.TRIP,
    Ester.RLX,
]);
// Bicalutamide gained an optional PK submodel (issue #206 §3). It is no
// longer in UNMODELLED_DRUGS, but the model is off by default and only runs
// when runSimulation is called with bicalutamide enabled (see below).

/** GnRH agonists: a depot injection every few weeks rather than a daily pill. */
export const GNRH_AGONISTS: ReadonlySet<Ester> = new Set<Ester>([Ester.LEUP, Ester.TRIP]);

const KNOWN_ESTERS: ReadonlySet<string> = new Set<string>(Object.values(Ester));

/**
 * Whether this build knows the drug code. A newer version can log a drug this
 * one has never heard of; the import sanitiser keeps such a dose exactly as
 * stored, so the code reaching here is typed `Ester` but may be none of them.
 */
export function isKnownEster(e: unknown): e is Ester {
    return typeof e === 'string' && KNOWN_ESTERS.has(e);
}

/**
 * A syntactically valid drug code, whether or not this build knows the drug.
 * A newer version can use a code this one has never heard of; storage, sync,
 * and import preserve it exactly rather than rewriting it to a known ester.
 */
export function isDrugCode(e: unknown): e is Ester {
    return typeof e === 'string' && /^[A-Za-z0-9_]{1,24}$/.test(e);
}

/** No level model behind it: one of UNMODELLED_DRUGS, or a code this build doesn't know. */
export function isUnmodelledDrug(e: Ester): boolean {
    return !KNOWN_ESTERS.has(e) || UNMODELLED_DRUGS.has(e);
}

/** An estradiol form, i.e. what feeds the E2 curve: not testosterone, not cyproterone, not an unmodelled drug. */
export function isEstradiolEster(e: Ester): boolean {
    return !T_ESTERS.has(e) && e !== Ester.CPA && e !== Ester.BICA && !isUnmodelledDrug(e);
}

// HRT mode used by the UI/storage layer. Not persisted inside DoseEvent.

export const LAB_ASSAYS: readonly LabAssay[] = ['immuno', 'lcms', 'chemi'];
export const isLabAssay = (v: unknown): v is LabAssay => v === 'lcms' || v === 'immuno' || v === 'chemi';

export const CorePK = {
    vdPerKG: 2.0, // L/kg for E2
    vdPerKG_CPA: 14.0, // L/kg for CPA (Cyproterone Acetate, ~986L/70kg)
    vdPerKG_BICA: 2.295, // L/kg for bicalutamide, from CL/F 0.8 L/h and t1/2 5.8 d at 70 kg
    kClear: 0.41,
    kClearInjection: 0.041,
    depotK1Corr: 1.0,
};

export const EsterInfo = {
    [Ester.E2]: { name: 'Estradiol', mw: 272.38 },
    [Ester.EB]: { name: 'Estradiol Benzoate', mw: 376.5 },
    [Ester.EV]: { name: 'Estradiol Valerate', mw: 356.5 },
    [Ester.EC]: { name: 'Estradiol Cypionate', mw: 396.58 },
    [Ester.EN]: { name: 'Estradiol Enanthate', mw: 384.56 },
    [Ester.EU]: { name: 'Estradiol Undecylate', mw: 440.66 },
    [Ester.CPA]: { name: 'Cyproterone Acetate', mw: 416.94 },
    [Ester.SPIRO]: { name: 'Spironolactone', mw: 416.57 },
    [Ester.BICA]: { name: 'Bicalutamide', mw: 430.37 },
    [Ester.MPA]: { name: 'Medroxyprogesterone Acetate', mw: 386.52 },
    [Ester.LEUP]: { name: 'Leuprorelin', mw: 1209.42 },
    [Ester.TRIP]: { name: 'Triptorelin', mw: 1311.45 },
    [Ester.RLX]: { name: 'Raloxifene', mw: 473.58 },
    // Testosterone esters (MW = parent + ester group)
    [Ester.T]: { name: 'Testosterone', mw: 288.42 },
    [Ester.TC]: { name: 'Testosterone Cypionate', mw: 412.6 },
    [Ester.TE]: { name: 'Testosterone Enanthate', mw: 400.59 },
    [Ester.TU]: { name: 'Testosterone Undecanoate', mw: 456.7 },
};

/** What a dose delivers, in English: the hormone for an estradiol or testosterone ester, otherwise the drug itself. */
export function activeCompoundName(ester: Ester): string {
    if (!isKnownEster(ester)) return ester; // a newer version's drug: its code is all there is to go on
    if (isTestosteroneEster(ester)) return 'Testosterone';
    if (isEstradiolEster(ester)) return 'Estradiol';
    return EsterInfo[ester].name;
}

/**
 * mg of estradiol per mg of the dose as logged (for a testosterone ester, mg of
 * testosterone), from molecular weights. 1 for estradiol itself and for drugs
 * with no estradiol in them, cyproterone included.
 */
export function getToE2Factor(ester: Ester): number {
    if (ester === Ester.E2) return 1.0;
    // No estradiol in these (or nothing known about them): a dose stays the number it was typed as.
    if (isUnmodelledDrug(ester) || ester === Ester.CPA) return 1.0;
    if (isTestosteroneEster(ester)) {
        // "to‑T" factor: mg of ester → mg of free testosterone
        return EsterInfo[Ester.T].mw / EsterInfo[ester].mw;
    }
    return EsterInfo[Ester.E2].mw / EsterInfo[ester].mw;
}

// -----------------------------------------------------------------------------
// Transmasculine (testosterone) PK parameters
// -----------------------------------------------------------------------------
//
// Gel and injection levels are checked at 70 kg against the labels cited
// where their parameters are set (tests/literature.test.ts). Label populations
// are mostly heavier than that; one weight for every route keeps the routes
// consistent with each other.
//   - Androgel 50 mg/day → C_avg ≈ 555 ng/dL (AndroGel 1% label)
//   - Androderm 5 mg/day patch → C_avg ≈ 500–700 ng/dL
//   - TC / TE / TU injection levels: see DEFAULT_PK_PARAMS.t_ff_TE
//   - TU curve shape: see T_DepotPK
// These are research/teaching estimates; they are NOT for individual dosing decisions.
//
export const T_CorePK = {
    vdPerKG: 1.0, // L/kg for total testosterone (apparent)
    kClear: 0.5, // h⁻¹ — fast native T clearance (gel / patch / oral)
    kClearInjection: 0.035, // h⁻¹ — effective clearance used with the flip‑flop depot model
};

// Two-part depot absorption (fast + slow library), analogous to the E2 injection model.
//
// Undecanoate has a single depot. The Nebido label
// (https://www.rxreasoner.com/monographs/nebido/pharmacology) gives a peak
// 7 days after a first 1000 mg injection, a release half-life of 90 ± 40 days,
// and at steady state on 1000 mg every 10 weeks a peak of about 37 nmol/L and a
// trough of about 16 nmol/L, a trough/peak ratio of 0.43. A 50 day release
// half-life, at the low end of the label's range, gives that ratio. That
// depot on its own, or with the hydrolysis step at the other esters' 0.20/h,
// peaks at about day 5; slowing the step (T_EsterPK.k2) to about the injection
// clearance rate (DEFAULT_PK_PARAMS.t_kClearInj) moves the peak to day 7, the
// label's and Aveed's median, and changes levels by under 2%. That step stands
// for whatever delays the rise in the label data and was fitted to it, not
// measured on its own. The older parameters peaked at about 3 days and fell to
// a trough of 0.17 of the peak.
export const T_DepotPK = {
    Frac_fast: { [Ester.TC]: 0.35, [Ester.TE]: 0.4, [Ester.TU]: 0 },
    // Fast library k1 (h⁻¹) — controls Tmax/Cmax
    k1_fast: { [Ester.TC]: 0.025, [Ester.TE]: 0.035, [Ester.TU]: Math.LN2 / (50 * 24) },
    // Slow library k1 (h⁻¹) — controls terminal tail (flip‑flop)
    k1_slow: { [Ester.TC]: 0.005, [Ester.TE]: 0.008, [Ester.TU]: Math.LN2 / (50 * 24) },
};

// Hydrolysis rate (k2) for T esters in the 3-compartment analytical path.
// Kept much larger than the slow‑library k1 so terminal kinetics are flip‑flop.
// Undecanoate: see T_DepotPK.
export const T_EsterPK = {
    k2: { [Ester.TC]: 0.2, [Ester.TE]: 0.2, [Ester.TU]: 0.036 },
};

export const T_GelPK = {
    k1: 0.05, // h⁻¹ (Tmax ≈ a few hours after application)
    // Bioavailability (F) is site-dependent — see DEFAULT_PK_PARAMS.t_gel_*.
};

export const T_PatchPK = {
    k1: 0.03, // h⁻¹ — used only if no nominal µg/day release is provided
    F: 1.0, // zero‑order input uses the nominal release rate directly
};

export const TwoPartDepotPK = {
    Frac_fast: {
        [Ester.EB]: 0.9,
        [Ester.EV]: 0.4,
        [Ester.EC]: 0.229164549,
        [Ester.EN]: 0.05,
        [Ester.EU]: 0.08,
        [Ester.E2]: 1.0,
    },
    k1_fast: {
        [Ester.EB]: 0.144,
        [Ester.EV]: 0.0216,
        [Ester.EC]: 0.005035046,
        [Ester.EN]: 0.001,
        [Ester.EU]: 0.006,
        [Ester.E2]: 0.5,
    }, // Added non-zero k1 for E2
    k1_slow: {
        [Ester.EB]: 0.114,
        [Ester.EV]: 0.0138,
        [Ester.EC]: 0.004510574,
        [Ester.EN]: 0.005,
        [Ester.EU]: 0.0022,
        [Ester.E2]: 0,
    },
};

export const InjectionPK = {
    formationFraction: {
        [Ester.EB]: 0.1092,
        [Ester.EV]: 0.0623,
        [Ester.EC]: 0.1173,
        [Ester.EN]: 0.12,
        [Ester.EU]: 0.04,
        [Ester.E2]: 1.0,
    },
};

export const EsterPK = {
    k2: { [Ester.EB]: 0.09, [Ester.EV]: 0.07, [Ester.EC]: 0.045, [Ester.EN]: 0.015, [Ester.EU]: 0.012, [Ester.E2]: 0 },
};

export const OralPK = {
    kAbsE2: 0.32,
    kAbsEV: 0.05,
    // Swallowed estradiol mostly reaches the blood as estrone and estrone
    // sulfate, a large pool that turns back into estradiol over many hours, so
    // after an oral dose estradiol peaks late and falls slowly. Without this
    // step the model fell with the 2.2 h half-life of kAbsE2 and dropped to
    // almost nothing between daily doses. The pool's rate is set from the
    // estradiol half-life measured after oral estradiol valerate, 14.36 h
    // fasting (Zhang et al. 2024, Table 2, PMC11246651); that study's median
    // Tmax of 10 h and Cmax/AUC of 0.034/h are what the chain then gives
    // (10.3 h, 0.032/h). Oral EV already falls at kAbsEV (13.9 h) and is left
    // as it was, so it peaks earlier than E2 (about 6 h). Total exposure is
    // unchanged: F·D/k3 whatever the rates.
    //
    // The peak runs late against other data. 10 h is the fasting arm; the same
    // study's fed arm peaked at 2 to 2.25 h. A single 1 mg tablet of plain E2
    // peaks at a median of 6 h (Activella label) and was still rising at 8 h in
    // Doll 2022, but at steady state the Angeliq label gives a median of about
    // 2 h, where the chain peaks at 8.5 h. Sending part of the dose straight
    // to the blood cannot fit both single-dose and steady-state data, so the
    // shape is left to timed lab results (tests/literature.test.ts, known gaps).
    kE1Pool: Math.LN2 / 14.36,
    bioavailability: 0.03,
    kAbsSL: 1.8,
    // The rate at which the mucosal share of a sublingual dose of plain
    // estradiol leaves the blood, at the default clearance (CorePK.kClear).
    //
    // Estradiol absorbed in the mouth arrives as a burst, and every study with
    // serial samples shows the burst over within hours. 1 mg peaked at about
    // 450 pg/mL at 1 h and was at about 85 by 3 h (Price et al. 1997, PMID
    // 9052581: "high E2 levels that fall rapidly over the first 6 hours";
    // values as quoted by Kuhl 2005, PMID 16112947). With the clearance every
    // other route uses (0.41/h) the 3 h level was 0.59 of the 1 h level against
    // a measured 0.19, the peak came at 1.04 h against 30 to 60 minutes
    // (Casper & Yen 1981, PMID 7454177: "within 30 minutes"), and total
    // exposure was 4.6 times oral's against about 2.5 (Price) and 1.8 over 8 h
    // (Doll et al. 2022, PMID 34781041). At 1.2/h these are 0.19, 0.68 h and
    // 2.1. A fit of this rate and the standard θ together to the peaks of
    // eight studies, the decline, the exposure ratios and the trough levels of
    // Cortez et al. 2024 (PMC11220669) lands on 1.2/h and θ = 0.10
    // ("Algorithm Explanation.md" §6.4), so the tiers are left as they were.
    //
    // The other routes deliver estradiol slowly enough for one rate to
    // describe them. A burst shows the fast early phase (after an intravenous
    // dose the half-life is 0.5 to 2 h) that a one-compartment model cannot
    // draw otherwise. With it, a mg absorbed in the mouth carries
    // kClear / kElimSL = 0.34 of the exposure of a mg from another route,
    // which is what the measured sublingual-to-oral exposure ratios ask for.
    //
    // It scales with the clearance in effect (age, a custom e2_kClear, a
    // personal calibration), so that ratio holds whatever the clearance.
    //
    // Esters under the tongue get the same exposure and keep their shape. An
    // ester's mucosal share is released by hydrolysis (EsterPK.k2) over hours,
    // a slow input that the ordinary clearance describes, so its curve is
    // scaled by kClear / kElimSL rather than made to fall faster. No
    // serial-sample study of a sublingual ester was found; this follows from
    // the exposure evidence, which is not specific to plain estradiol. Without
    // it a mg of valerate under the tongue carried 1.6 times the exposure of a
    // mg of estradiol, though it holds 24% less, and 4.6 times oral
    // valerate's, the ratio that was too high for estradiol.
    //
    // The height of the peak is a separate question and stays open: per mg the
    // studies range from 144 pg/mL (Doll, LC-MS/MS) to about 450 (Price, RIA)
    // and beyond, and none says how long the tablet was held. See the
    // sublingual blocks in tests/literature.test.ts.
    kElimSL: 1.2,
};

// Define deterministic order for mapping integer tiers (0-3)   to keys
export const SL_TIER_ORDER = ['quick', 'casual', 'standard', 'strict'] as const;

export const SublingualTierParams = {
    quick: { theta: 0.01, hold: 2 },
    casual: { theta: 0.04, hold: 5 },
    standard: { theta: 0.11, hold: 10 },
    strict: { theta: 0.18, hold: 15 },
};

export const DEFAULT_PK_PARAMS: PKCustomParams = {
    e2_kClear: 0.41,
    e2_kClearInj: 0.041,
    e2_ff_EB: 0.1092,
    e2_ff_EV: 0.0623,
    e2_ff_EC: 0.1173,
    e2_ff_EN: 0.12,
    e2_ff_EU: 0.04,
    e2_oral_bio: 0.03,
    e2_sl_quick: 0.01,
    e2_sl_casual: 0.04,
    e2_sl_standard: 0.11,
    e2_sl_strict: 0.18,
    // Arm/thigh: ~5% of the applied dose arriving as circulating estradiol.
    // Back-calculated from the labels' own steady-state serum levels, because no
    // US estradiol gel label states a percentage at all — Divigel (NDA 022038)
    // and EstroGel (NDA 021166) both describe absorption only qualitatively.
    // Divigel 0.25/0.5/1.0 mg/day gives Cavg 9.8/21/30.5 pg/mL and EstroGel
    // 0.75 mg/day gives 28.3 pg/mL; this model reproduces those at F = 0.039–
    // 0.058 across 65–70 kg (mean 0.050). Those label figures are uncorrected for
    // baseline, so they are upper bounds and the true value likely sits nearer
    // 0.04. Treat 0.05 as one significant figure: Divigel reports %CV of 81–149%.
    //
    // The widely quoted "10%" is a DIFFERENT QUANTITY and must not be pasted in
    // here. It is the fraction crossing skin under the manufacturer's large-area
    // technique (Oestrogel SmPC, 750 cm² whole arm; Wikipedia "Pharmacokinetics
    // of estradiol" carries the same 10% via Sitruk-Ware 1989, for alcoholic
    // estradiol solutions as a class). Besins states 5–6% "Bioverfügbarkeit" for
    // the identical 0.06% gel in the German Gynokadin Fachinformation, off the
    // same 60–80 pg/mL serum data. F enters linearly and exactly once, so 0.10
    // doubles every predicted level — and because users titrate against the
    // prediction, an F that is 2x high pushes real doses toward under-treatment.
    //
    // Järvinen et al. 1999 (Maturitas) cannot establish this number and should
    // not be cited for it: "61% of tablet / 109% of patch" are RELATIVE
    // bioavailabilities. The patch arm does corroborate the magnitude, though —
    // 1.09 × 50 µg/day delivered from 1.5 mg applied works out to ~3.6%.
    //
    // Scrotal/genital: ~5x arm/thigh, extrapolated from scrotal E2
    // patch data (Premoli et al. 2005) and scrotal T gel data, since no direct
    // human study of scrotal E2 gel exists (see transfemscience.org/articles/genital-e2-application/).
    e2_gel_arm: 0.05,
    e2_gel_thigh: 0.05,
    e2_gel_scrotal: 0.25,
    t_kClear: 0.5,
    t_kClearInj: 0.035,
    // One formation fraction per mg of testosterone for all three esters: two
    // labels for different esters land on the same value at 70 kg.
    //   - Xyosted (enanthate, subcutaneous, weekly) label, week 12, N = 137:
    //     Cavg 553 ng/dL (https://medlibrary.org/lib/rx/meds/xyosted/page/4/).
    //     Doses were titrated; the FDA clinical pharmacology review gives
    //     25 men on 50 mg, 93 on 75 mg and 19 on 100 mg, a mean of 73.9 mg/week
    //     (https://www.accessdata.fda.gov/drugsatfda_docs/nda/2019/209863Orig1s000ClinPharmR.pdf).
    //     0.043 gives 555 ng/dL on 73.9 mg/week.
    //   - Aveed (undecanoate 750 mg at weeks 0 and 4, then every 10 weeks)
    //     label, after the third injection, N = 117: Cavg 495 ng/dL
    //     (https://medlibrary.org/lib/rx/meds/aveed/page/6/). 0.043 gives 503.
    // 100 mg/week of cypionate or enanthate then averages about 730–750 ng/dL.
    // The old value, 0.025, put 100 mg/week at about 430 ng/dL, under the 600
    // this file used to state as its target, and gave about 0.6 of both labels.
    // The Azmiro (cypionate 200 mg IM) label reports less, but its values are
    // baseline-corrected after a dose that suppresses the men's own
    // testosterone, which understates the dose's share; tests/literature.test.ts
    // keeps it as a lower bound.
    // Fitting at 70 kg may read low. Aveed's label also splits by weight:
    // Cavg 568 ng/dL at 65–100 kg and 426 at 100 kg or more, a ratio that
    // matches the model's 1/weight scaling for group means near 85 and 113 kg.
    // Fitted at those weights the fraction would be about 0.055–0.06, so a
    // 70 kg person's real level may be about 1.3–1.4x what the model shows;
    // Spratt et al. (tests/literature.test.ts) point the same way. 70 kg is
    // kept, as for gel, until timed lab results say how far to move it.
    t_ff_TC: 0.043,
    t_ff_TE: 0.043,
    t_ff_TU: 0.043,
    // Arm/thigh: ~10% absolute bioavailability, matching AndroGel/Testim FDA
    // labeling. Scrotal: scrotal skin is ~5–8x more permeable to androgens than
    // arm/thigh skin (Iyer et al. 2017, Andrology; Kuhnert et al. 2005) — 0.50
    // uses the conservative end of that range rather than the full 8x.
    t_gel_arm: 0.1,
    t_gel_thigh: 0.1,
    t_gel_scrotal: 0.5,
};

/**
 * Bounds for the user-supplied numbers that feed the simulation.
 *
 * Finiteness alone is not enough. Body weight sets the distribution volume, so
 * `weight: 1e-9` — which passes a bare `> 0` check, whether typed in or
 * imported — divides a normal dose into a reading of ~1.2e13 pg/mL. A dose of
 * 1e12 mg does the same from the other side, and a timestamp far outside the
 * app's lifetime dilutes the simulation grid across geological time.
 */
export const BODY_WEIGHT_KG_MIN = 20;
export const BODY_WEIGHT_KG_MAX = 400;
export const DOSE_MG_MAX = 10000;
/** Hours since 1970: 1970-01-01 through roughly the year 2140. */
export const EVENT_TIME_H_MIN = 0;
export const EVENT_TIME_H_MAX = 1_500_000;

export function isPlausibleBodyWeightKG(kg: number): boolean {
    return Number.isFinite(kg) && kg >= BODY_WEIGHT_KG_MIN && kg <= BODY_WEIGHT_KG_MAX;
}

/**
 * Year of birth, for the age adjustment below. It is optional: none (null)
 * leaves the model as it was. Anything outside 1900 to the current year, typed
 * in or imported, is read as none.
 */
export const BIRTH_YEAR_MIN = 1900;

export function isPlausibleBirthYear(year: unknown, nowYear = new Date().getFullYear()): year is number {
    return typeof year === 'number' && Number.isInteger(year) && year >= BIRTH_YEAR_MIN && year <= nowYear;
}
