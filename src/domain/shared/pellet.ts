import { ExtraKey } from '../types';
import type { DoseEvent } from '../types';

/**
 * Subcutaneous testosterone pellets dissolve at a near-linear zero-order rate.
 * Handelsman et al., JCEM 1990 (PMID 2115044; summarized in PMID 25999802,
 * PMC4431706) measured 0.65 mg/day from a 100 mg pellet and 1.3 mg/day from a
 * 200 mg pellet, eugonadal levels for 4-5 months, and a 1.31 mg/day dissolution
 * rate from explanted pellets. That is 0.65% of the implanted dose per day, so
 * one pellet lasts about 154 days regardless of its individual strength.
 */
export const PELLET_DISSOLUTION_FRACTION_PER_DAY = 0.0065;
export const PELLET_RELEASE_HOURS = (1 / PELLET_DISSOLUTION_FRACTION_PER_DAY) * 24;

/** Rate in µg/day for a total implanted dose in mg. */
export function pelletReleaseRateUGPerDay(doseMG: number): number {
    return doseMG * 1000 * PELLET_DISSOLUTION_FRACTION_PER_DAY;
}

/** Explicitly logged wear still wins; otherwise use the dissolution window. */
export function resolvePelletWearH(event: DoseEvent): number {
    const planned = event.extras?.[ExtraKey.patchWearH];
    if (typeof planned === 'number' && Number.isFinite(planned) && planned > 0) return planned;
    return PELLET_RELEASE_HOURS;
}
