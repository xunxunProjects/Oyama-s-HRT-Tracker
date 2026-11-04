// Population PK covariates (age, weight).

// -----------------------------------------------------------------------------
// Age
// -----------------------------------------------------------------------------
//
// Clearance of estradiol and testosterone falls with age. With a year of birth
// the clearance rate k3 is scaled log-linearly in age, relative to the mean age
// of the people the defaults were fitted on: 54.2 years in Aveed's trial and
// 53.8 in AndroGel 1.62%'s (labels, section 14), and 54.0 in the
// postmenopausal women behind the oral estrone pool (Zhang et al. 2024,
// Table 1, PMC11246651). At 54 nothing changes, and no year of birth reads as 54.
//
//   - Testosterone: Coviello et al. 2006 (J Clin Endocrinol Metab 91:4669,
//     PMID 16912120) suppressed men's own production with a GnRH agonist and
//     gave weekly testosterone enanthate. Apparent clearance was 1821 L/day at
//     19–35 and 1390 L/day at 59–75, about 0.68% a year between the groups'
//     midpoints. Wang et al. 2004 (PMID 15181080) measured their own
//     testosterone's clearance 36% lower in middle-aged men than in young men.
//   - Estradiol: Longcope 1971 (Am J Obstet Gynecol 111:778) measured
//     clearance in five women aged 70–88 about 25% below young women's, about
//     0.55% a year taking the young women as 27 (the abstract gives no ages).
//     The evidence is weaker than for testosterone. In postmenopausal women aged
//     46–90, Longcope et al. 1980 (Maturitas 2:283, PMID 7231200) found no trend
//     with age, and put the lower clearance after menopause down to the low
//     estradiol levels then; Järvinen et al. 2004 (PMID 15036491) found no
//     significant difference in oral estradiol valerate kinetics between women
//     under 60 and over 65.
//
// Outside 19–75, the ages the testosterone study covered, the multiplier
// holds at its end value. Cyproterone, the absorption rates and the oral
// estrone pool are left as they are. Lab results still correct estradiol from
// here: the calibration's personal clearance starts from the adjusted model.
export const AGE_REF_YEARS = 54;
const AGE_RANGE_YEARS = [19, 75] as const;
const AGE_CLEARANCE_SLOPE = {
    t: Math.log(1821 / 1390) / (67 - 27),
    e2: Math.log(1 / 0.75) / (79 - 27),
};
const HOURS_PER_YEAR = 365.2425 * 24;

/** Age in years at `timeH` (hours since 1970), taking the middle of the year of birth. */
export function ageAtH(birthYear: number, timeH: number): number {
    return 1970 + timeH / HOURS_PER_YEAR - (birthYear + 0.5);
}

/** Multiplier on the clearance of free estradiol or testosterone at `timeH`; 1 with no year of birth. */
export interface PopPKCovariateParams {
    clExponent: number;
    vExponent: number;
    refWeightKG: number;
}
export const DEFAULT_POP_PK_COVARIATE_PARAMS: PopPKCovariateParams = {
    clExponent: 0.75,
    vExponent: 1.0,
    refWeightKG: 70,
};

export function popPKCovariateFactors(
    weightKG: number,
    _ageYears: number | null = null,
    _shbgNmolL: number | null = null,
    params: PopPKCovariateParams = DEFAULT_POP_PK_COVARIATE_PARAMS,
): { clFactor: number; vFactor: number } {
    const w = Math.max(1, weightKG || params.refWeightKG);
    const ratio = w / params.refWeightKG;
    const clFactor = Math.pow(ratio, params.clExponent);
    const vFactor = Math.pow(ratio, params.vExponent);
    return { clFactor, vFactor };
}

export function ageClearanceMultiplier(hormone: 'e2' | 't', birthYear: number | null, timeH: number): number {
    if (birthYear === null) return 1;
    const [lo, hi] = AGE_RANGE_YEARS;
    const age = Math.min(hi, Math.max(lo, ageAtH(birthYear, timeH)));
    return Math.exp(-AGE_CLEARANCE_SLOPE[hormone] * (age - AGE_REF_YEARS));
}
