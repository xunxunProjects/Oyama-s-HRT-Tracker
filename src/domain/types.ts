// Domain types and enums. Extracted from the former logic.ts monolith.

// --- Types & Enums ---

export enum Route {
    sublingual = 'sublingual',
    injection = 'injection',
    patchApply = 'patchApply',
    patchRemove = 'patchRemove',
    gel = 'gel',
    oral = 'oral',
    nasal = 'nasal',
    sc = 'sc',
    pellet = 'pellet',
}

export enum Ester {
    E2 = 'E2',
    EB = 'EB',
    EV = 'EV',
    EC = 'EC',
    EN = 'EN',
    EU = 'EU',
    CPA = 'CPA',
    // Anti-androgens and a SERM, as listed on mtf.wiki. None has a level model:
    // see UNMODELLED_DRUGS.
    SPIRO = 'SPIRO', // Spironolactone
    BICA = 'BICA', // Bicalutamide
    MPA = 'MPA', // Medroxyprogesterone acetate
    LEUP = 'LEUP', // Leuprorelin (GnRH agonist)
    TRIP = 'TRIP', // Triptorelin (GnRH agonist)
    RLX = 'RLX', // Raloxifene (SERM)
    // Transmasculine HRT (testosterone) esters
    T = 'T', // Unesterified testosterone (gel / patch base)
    TC = 'TC', // Testosterone Cypionate
    TE = 'TE', // Testosterone Enanthate
    TU = 'TU', // Testosterone Undecanoate
}

export type HRTMode = 'transfem' | 'transmasc';

export enum ExtraKey {
    concentrationMGmL = 'concentrationMGmL',
    areaCM2 = 'areaCM2',
    releaseRateUGPerDay = 'releaseRateUGPerDay',
    sublingualTheta = 'sublingualTheta',
    sublingualTier = 'sublingualTier',
    gelSite = 'gelSite',
    // Planned wear duration (hours) for a patch application. When set, the patch
    // is treated as removed `patchWearH` hours after it is applied, so a single
    // "apply" event self-completes without a separate "remove" event. An explicit
    // patchRemove event still takes precedence, up to PATCH_MAX_OVERWEAR_H past
    // the planned wear.
    patchWearH = 'patchWearH',
}

export enum GelSite {
    arm = 'arm',
    thigh = 'thigh',
    scrotal = 'scrotal',
}

export const GEL_SITE_ORDER = ['arm', 'thigh', 'scrotal'] as const;

export interface DoseEvent {
    id: string;
    route: Route;
    timeH: number; // Hours since 1970
    doseMG: number; // Dose in mg (of the ester/compound), NOT E2-equivalent
    ester: Ester;
    extras: Partial<Record<ExtraKey, number>>;
    // Epoch ms of the last edit, stamped by the app on write. Only cloud sync
    // reads it: when two devices hold the same id with different contents, this
    // is what says which edit came second. Optional because records written
    // before sync existed (and hand-made imports) simply don't have one.
    updatedAt?: number;
}

export interface SimulationResult {
    timeH: number[];
    concPGmL: number[];
    concPGmL_E2: number[];
    concPGmL_CPA: number[];
    // Bicalutamide (optional PK submodel, issue #206 §3): ng/mL. Empty/zero
    // unless runSimulation is called with bicalutamide enabled.
    concPGmL_BICA: number[];
    // Transmasculine: total testosterone concentration in ng/dL
    concNGdL_T: number[];
    // Transmasculine: free testosterone (Vermeulen) in ng/dL, derived from
    // concNGdL_T with default SHBG/albumin. Optional for backward compat.
    concNGdL_T_free?: number[];
    // Transfeminine: free estradiol (pg/mL), derived from concPGmL_E2 with
    // the default SHBG baseline (Vermeulen mass action). Always present.
    concPGmL_E2_free?: number[];
    // Transfeminine: bioavailable estradiol (pg/mL) = free + albumin-bound,
    // derived from concPGmL_E2 with the default SHBG baseline.
    concPGmL_E2_bioavailable?: number[];
    // Transfeminine: dynamic SHBG (nmol/L) over the simulation, from the
    // indirect-effect model in shbg.ts. Present when requested.
    shbgNM?: number[];
    shbgNmolL?: number[];
    concNM_SHBG?: number[];
    // Transfeminine: free estradiol (pg/mL) using the dynamic SHBG curve.
    concPGmL_E2_free_dynamic?: number[];
    concPGmL_E2_freeDynamic?: number[];
    // Transfeminine: HPG relative activity (0..1) over the simulation.
    rHPG?: number[];
    // Transfeminine: endogenous testosterone (ng/dL) implied by R_HPG, when a
    // baseline is supplied.
    endogenousTNgDl?: number[];
    endogenousT_ngDl?: number[];
    // Transfeminine: body-composition slow variables (relative units).
    muscleM?: number[];
    bodyCompM?: number[];
    visceralFat?: number[];
    bodyCompFVisc?: number[];
    // Transfeminine: lipid/hepatic steatosis slow variable (LDL, mg/dL).
    ldl?: number[];
    lipidLDL?: number[];
    // Transfeminine: VTE / coagulation risk flag (0..1).
    vteRisk?: number[];
    // Transmasculine: bioavailable testosterone (ng/dL) = free + albumin-bound.
    concNGdL_T_bioavailable?: number[];
    // Transmasculine: hematocrit (fraction) over the simulation.
    hct?: number[];
    // Transmasculine: amenorrhea probability over the simulation.
    amenorrheaProb?: number[];
    // Transmasculine: body-composition slow variables (relative units).
    tMuscle?: number[];
    tVisceralFat?: number[];
    // Transmasculine: endogenous E2 from T aromatization (pg/mL).
    endogenousE2PgMl?: number[];
    // Transmasculine: DHT (ng/dL) from 5-alpha reduction.
    dhtNgDl?: number[];
    // Area under the E2 curve (pg·h/mL) over the whole grid. Only E2: concPGmL
    // adds CPA converted to pg/mL, a different drug in a unit a thousand times
    // larger, which would swamp it.
    auc: number;
    // Only when asked for (runSimulation's swallowedE2): the part of
    // concPGmL_E2 that was swallowed, from oral doses and the swallowed share
    // of sublingual ones, so it passed the liver before the rest of the body.
    // The SHBG model in shbg.ts reads it.
    concPGmL_E2_swallowed?: number[];
}

// --- Lab Results & Calibration ---

export interface LabResult {
    id: string;
    timeH: number;
    concValue: number; // Value in the user's unit
    // E2 units (transfem) or T units (transmasc). Kept in one field for storage simplicity.
    unit: 'pg/ml' | 'pmol/l' | 'ng/dl' | 'nmol/l';
    // How the lab measured it, when the person knows. Immunoassays read
    // estradiol higher than LC-MS/MS at low levels, so a lab compared with the
    // model means more when the method is known. Absent means not sure.
    assay?: LabAssay;
    // Epoch ms of the last edit — see DoseEvent.updatedAt.
    updatedAt?: number;
}

export type LabAssay = 'lcms' | 'immuno' | 'chemi';

// --- PK Custom Parameters ---

export interface PKCustomParams {
    // E2 elimination rates
    e2_kClear: number; // non-injection h⁻¹ (default: 0.41)
    e2_kClearInj: number; // injection h⁻¹ (default: 0.041)
    // E2 injection formation fractions (active E2 per mg ester)
    e2_ff_EB: number; // Estradiol Benzoate (default: 0.1092)
    e2_ff_EV: number; // Estradiol Valerate (default: 0.0623)
    e2_ff_EC: number; // Estradiol Cypionate (default: 0.1173)
    e2_ff_EN: number; // Estradiol Enanthate (default: 0.12)
    e2_ff_EU: number; // Estradiol Undecylate (default: 0.040)
    // E2 oral/sublingual
    e2_oral_bio: number; // oral bioavailability fraction (default: 0.03)
    e2_sl_quick: number; // SL theta — quick tier (default: 0.01)
    e2_sl_casual: number; // SL theta — casual tier (default: 0.04)
    e2_sl_standard: number; // SL theta — standard tier (default: 0.11)
    e2_sl_strict: number; // SL theta — strict tier (default: 0.18)
    // E2 gel bioavailability per site
    e2_gel_arm: number; // Arm (default: 0.05)
    e2_gel_thigh: number; // Thigh (default: 0.05)
    e2_gel_scrotal: number; // Scrotal (default: 0.25)
    // Testosterone elimination rates
    t_kClear: number; // non-injection h⁻¹ (default: 0.5)
    t_kClearInj: number; // injection h⁻¹ (default: 0.035)
    // T injection formation fractions
    t_ff_TC: number; // Testosterone Cypionate (default: 0.043)
    t_ff_TE: number; // Testosterone Enanthate (default: 0.043)
    t_ff_TU: number; // Testosterone Undecanoate (default: 0.043)
    // T gel bioavailability per site (arm/thigh ~AndroGel-like; scrotal skin is
    // markedly more permeable — see DEFAULT_PK_PARAMS comment for sources)
    t_gel_arm: number; // Arm (default: 0.10)
    t_gel_thigh: number; // Thigh (default: 0.10)
    t_gel_scrotal: number; // Scrotal (default: 0.50)
}

// --- Math Models ---

export interface PKParams {
    Frac_fast: number;
    k1_fast: number;
    k1_slow: number;
    k2: number;
    // Second step of the slow (swallowed) sublingual branch: the oral route's
    // estrone pool, as k2 is for an oral dose. Absent means none.
    k2_slow?: number;
    k3: number;
    F: number;
    rateMGh: number;
    F_fast: number;
    F_slow: number;
}
