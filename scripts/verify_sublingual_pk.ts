/**
 * Sublingual estradiol calibration check.
 *
 *   npm run verify:sublingual
 *
 * That runs on plain Node (>= 22.7, for --experimental-transform-types, which
 * the enums in logic.ts need — plain --experimental-strip-types is not
 * enough). `bun run scripts/verify_sublingual_pk.ts` works too; neither needs
 * a dependency this repo does not already have.
 *
 * Two things are checked, and the script exits non-zero if either drifts:
 *
 *   1. `SublingualTierParams` still matches the mouth model of
 *      "Algorithm Explanation.md" §6.2 run at the documented mid scenario.
 *   2. The simulation that those thetas feed still reproduces the measured
 *      single-dose numbers it was calibrated against.
 *
 * Why this file exists: issue #22 reported that 2 mg sublingual at the
 * standard preset predicted ~1400 pg/mL for a 55 kg body, which is roughly
 * 5x what LC-MS/MS measures. Nothing in the repo would have caught that, and
 * nothing would catch it coming back.
 *
 * Measurements used as anchors
 * ----------------------------
 * Doll E, Gunsolus I, Thorgerson A, Tangpricha V, Lamberton N, Sarvaideo JL.
 * "Pharmacokinetics of Sublingual Versus Oral Estradiol in Transgender
 * Women." Endocr Pract. 2022;28(3):237-242. PMID 34781041.
 *   10 transgender women, single 1 mg doses one week apart, LC-MS/MS:
 *   sublingual Cmax 144 pg/mL at 1 h; oral Cmax 35 pg/mL; AUC(0-8 h)
 *   sublingual = 1.8x oral. This is the primary anchor — modern assay, right
 *   population, and a within-subject oral arm, which is what pins theta.
 *
 * Price TM, et al. Obstet Gynecol. 1997;89(3):340-5. PMID 9052581, and the
 * levels Kuhl (2000) summarises from that era (radioimmunoassay):
 *   1 mg sublingual peak ~450 pg/mL, AUC ~2.5x oral. RIA reads high for
 *   estradiol — direct assays cross-react with the estrone and estrogen
 *   conjugates that oral and sublingual dosing generate in quantity — so
 *   these bound the top of the plausible range rather than the middle of it.
 *
 * The tier table is fitted at the `standard` preset to 168 pg/mL at a 70 kg
 * reference — the midpoint of the paper's 144 and the abstract's 178, not
 * the paper's figure alone. Doll et al. do not report participant weights,
 * and that assumption dominates the uncertainty here: anchoring on 144 at
 * 70 kg would give a standard tier of 0.020 rather than 0.025, and the same
 * target at 55 kg would give 0.012. See §6.2.1 for the full grid. `strict`
 * lands near the RIA-era AUC ratio, `quick` near plain oral.
 */

import {
    runSimulation,
    Route,
    Ester,
    ExtraKey,
    SL_TIER_ORDER,
    SublingualTierParams,
    DEFAULT_PK_PARAMS,
} from '../logic.ts';

// --- mouth model (Algorithm Explanation.md §6.2) ------------------------------
//
//   dS/dt = -kDiss * S                      solid dose dissolving
//   dD/dt =  kDiss * S - (kPerm + kSw) * D  dissolved drug, absorbed or swallowed
//   theta =  integral of kPerm * D over the hold window
//
// kPerm is the mucosal permeation constant. It is NOT the plasma absorption
// constant k_SL = 1.8 h⁻¹ used in `resolveParams` — that one is fitted to the
// observed Tmax ≈ 1 h and describes drug already committed to the mucosal
// route. Using 1.8 h⁻¹ here is what produced the old, ~5x-high thetas.

const MUCOSAL_PERMEATION_H = 0.37; // fitted below, against Doll et al. 2022
const SWALLOW_CLEARANCE_H = 1.8;   // documented mid scenario
const DISSOLUTION_HALF_MIN = 5;    // documented mid scenario

function theta(holdMin: number, kPerm = MUCOSAL_PERMEATION_H, kSw = SWALLOW_CLEARANCE_H, dissHalfMin = DISSOLUTION_HALF_MIN): number {
    const kDiss = Math.LN2 / (dissHalfMin / 60);
    const T = holdMin / 60;
    const steps = 200_000;
    const dt = T / steps;
    let solid = 1, dissolved = 0, absorbed = 0;
    for (let i = 0; i < steps; i++) {
        absorbed += kPerm * dissolved * dt;
        const dSolid = -kDiss * solid * dt;
        const dDissolved = (kDiss * solid - (kPerm + kSw) * dissolved) * dt;
        solid += dSolid;
        dissolved += dDissolved;
    }
    return absorbed;
}

/**
 * kPerm that puts the given hold at the given mucosal fraction. The hold
 * comes from the tier table rather than a literal 10, so that moving a
 * preset's hold time moves the fit with it instead of silently leaving this
 * readout describing a hold the app no longer offers.
 */
function fitPermeation(targetTheta: number, holdMin: number): number {
    let lo = 0, hi = 5;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        if (theta(holdMin, mid) < targetTheta) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

// --- simulation probes --------------------------------------------------------

/**
 * Dose at "now" rather than at epoch hour 0. `runSimulation` spreads its grid
 * from the first event to now + 24 h, so a dose in 1970 is sampled every ~5
 * hours and its 1-hour peak is missed entirely.
 */
function probe(route: Route, doseMG: number, weightKG: number, slTheta?: number) {
    const t0 = Date.now() / 3_600_000;
    const extras: Record<string, number> = {};
    if (slTheta !== undefined) extras[ExtraKey.sublingualTheta] = slTheta;
    const result = runSimulation(
        [{ id: 'probe', timeH: t0, doseMG, ester: Ester.E2, route, extras } as any],
        weightKG,
    );
    if (!result) throw new Error('runSimulation returned null');

    const times = result.timeH, conc = result.concPGmL_E2;
    let cmax = 0, tmax = 0;
    for (let i = 0; i < times.length; i++) {
        if (times[i] >= t0 && conc[i] > cmax) { cmax = conc[i]; tmax = times[i] - t0; }
    }
    const aucTo = (endH: number) => {
        let area = 0;
        for (let i = 1; i < times.length; i++) {
            const t1 = times[i - 1], t2 = times[i];
            const a = Math.max(t0, t1), b = Math.min(t0 + endH, t2);
            if (b <= a) continue;
            // Interpolate at the clipped endpoints. The window boundaries
            // rarely land on a grid point, and pairing full-segment
            // concentrations with a partial width biases exactly the segment
            // the 0-8 h cut always falls in.
            const span = t2 - t1;
            const at = (t: number) => span > 0
                ? conc[i - 1] + (conc[i] - conc[i - 1]) * ((t - t1) / span)
                : conc[i];
            area += (at(a) + at(b)) / 2 * (b - a);
        }
        return area;
    };
    return { cmax, tmax, auc8: aucTo(8), auc72: aucTo(72) };
}

// --- checks -------------------------------------------------------------------

const failures: string[] = [];
const band = (lo: number, hi: number) => `${+lo.toFixed(4)}–${+hi.toFixed(4)}`;

function check(label: string, actual: number, lo: number, hi: number, unit = '') {
    const ok = actual >= lo && actual <= hi;
    if (!ok) failures.push(`${label}: ${actual.toFixed(3)}${unit} outside ${band(lo, hi)}${unit}`);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(46)} ${actual.toFixed(3).padStart(9)}${unit}   expected ${band(lo, hi)}${unit}`);
}

/**
 * A deviation we know about and have decided not to correct here. Printed
 * every run so it cannot quietly become the baseline, but it does not fail
 * the script — only drifting outside the recorded band does.
 */
function known(label: string, actual: number, lo: number, hi: number, unit: string, why: string) {
    const ok = actual >= lo && actual <= hi;
    if (!ok) failures.push(`${label} drifted: ${actual.toFixed(3)}${unit} outside the recorded ${band(lo, hi)}${unit}`);
    console.log(`  ${ok ? 'note' : 'FAIL'}  ${label.padEnd(46)} ${actual.toFixed(3).padStart(9)}${unit}   recorded ${band(lo, hi)}${unit}`);
    console.log(`        ${why}`);
}

console.log('mouth model (Algorithm Explanation.md §6.2)');
const fitted = fitPermeation(SublingualTierParams.standard.theta, SublingualTierParams.standard.hold);
console.log(`  fitted mucosal permeation constant: ${fitted.toFixed(3)} h⁻¹ at the ${SublingualTierParams.standard.hold} min standard hold (file uses ${MUCOSAL_PERMEATION_H})`);
console.log('\ntier table vs. mouth model');
for (const key of SL_TIER_ORDER) {
    const tier = SublingualTierParams[key];
    const modelled = theta(tier.hold);
    // 0.001 absolute tolerance: the table is rounded to three decimals.
    check(`${key} (${tier.hold} min) theta`, tier.theta, Math.max(0, modelled - 0.001), modelled + 0.001);
}

console.log('\ntier table vs. PK parameter defaults');
const defaults: Record<string, number> = {
    quick: DEFAULT_PK_PARAMS.e2_sl_quick,
    casual: DEFAULT_PK_PARAMS.e2_sl_casual,
    standard: DEFAULT_PK_PARAMS.e2_sl_standard,
    strict: DEFAULT_PK_PARAMS.e2_sl_strict,
};
for (const key of SL_TIER_ORDER) {
    check(`${key} default matches tier table`, defaults[key], SublingualTierParams[key].theta, SublingualTierParams[key].theta);
}

// Doll et al. did not report body weights. 70 kg is the neutral adult
// reference; Cmax scales as 1/weight, so the check band below spans the
// 60–85 kg a cohort of ten adults plausibly averages to.
const REF_WEIGHT_KG = 70;
const standardTheta = SublingualTierParams.standard.theta;

console.log(`\nsingle 1 mg dose at ${REF_WEIGHT_KG} kg vs. Doll et al. 2022 (LC-MS/MS)`);
const sl = probe(Route.sublingual, 1, REF_WEIGHT_KG, standardTheta);
const oral = probe(Route.oral, 1, REF_WEIGHT_KG);
// The paper reports 144 pg/mL; the conference abstract for the same cohort
// reports 178 ± 47 for the LC-MS/MS arm. The table is fitted to the midpoint,
// so the band covers both rather than centring on either.
check('sublingual Cmax (measured 144–178)', sl.cmax, 110, 200, ' pg/mL');
check('sublingual Tmax (measured 1.0)', sl.tmax, 0.6, 1.6, ' h');
// Doll's 1.8 is AUC(0-8 h), which cuts oral off at its own Tmax and so
// overstates the true ratio; the model should sit at or below it.
check('sublingual/oral AUC(0-8 h) (measured 1.8)', sl.auc8 / oral.auc8, 1.2, 2.6, 'x');
known('oral Cmax (measured 35)', oral.cmax, 55, 80, ' pg/mL',
    'the oral arm reads ~2x high and peaks ~3 h early; §10 notes the model omits the\n' +
    '        estrone/estrone-sulfate reservoir, so e2_oral_bio absorbs that as a higher\n' +
    '        apparent F to keep steady-state troughs right. Untouched here — it is why the\n' +
    '        sublingual fit is anchored on absolute Cmax, which the fast branch alone sets,\n' +
    '        rather than on the sublingual/oral ratio, whose denominator carries this error.');

console.log('\nupper bound from the RIA-era literature (Price 1997 / Kuhl 2000)');
const strict = probe(Route.sublingual, 1, REF_WEIGHT_KG, SublingualTierParams.strict.theta);
check('strict-tier sublingual/oral AUC (RIA ~2.5)', strict.auc72 / oral.auc72, 1.8, 3.2, 'x');
check('strict-tier Cmax under RIA peak (450)', strict.cmax, 100, 450, ' pg/mL');

console.log('\nthe number issue #22 reported: 2 mg, standard preset, 55 kg');
const reported = probe(Route.sublingual, 2, 55, standardTheta);
console.log(`  Cmax ${reported.cmax.toFixed(0)} pg/mL at ${reported.tmax.toFixed(2)} h  (was ~1400 pg/mL before recalibration)`);
check('2 mg standard-tier Cmax at 55 kg', reported.cmax, 250, 550, ' pg/mL');

console.log('\ntheta = 0 still degenerates to the oral route');
const degenerate = probe(Route.sublingual, 1, REF_WEIGHT_KG, 0);
check('|SL(theta=0) Cmax - oral Cmax|', Math.abs(degenerate.cmax - oral.cmax), 0, 1e-9, ' pg/mL');

if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log('\nall checks passed');
