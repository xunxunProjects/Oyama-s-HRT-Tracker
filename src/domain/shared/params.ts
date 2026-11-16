import { Route } from '../types';
import type { DoseEvent, PKParams } from '../types';
import { _activePKParams } from './activeParams';
import { ageClearanceMultiplier, weightK3Factor } from '../features/popPK';

/**
 * Estradiol clearance rate for this event's route and age.
 *
 * Total clearance is k3 × V, and V is already linear in body weight
 * (`vdPerKG * bodyWeightKG * 1000`), so k3 carries only the remaining
 * (BW/70)^-0.25: clearance then scales as (BW/70)^0.75, allometric with V.
 */
export function e2Clearance(event: DoseEvent, birthYear: number | null, bodyWeightKG: number): number {
    return (
        (event.route === Route.injection ? _activePKParams.e2_kClearInj : _activePKParams.e2_kClear) *
        ageClearanceMultiplier('e2', birthYear, event.timeH) *
        weightK3Factor(bodyWeightKG)
    );
}

/** Testosterone clearance rate for this event's route and age; as for estradiol, k3 holds only the weight remainder. */
export function tClearance(event: DoseEvent, birthYear: number | null, bodyWeightKG: number): number {
    return (
        (event.route === Route.injection ? _activePKParams.t_kClearInj : _activePKParams.t_kClear) *
        ageClearanceMultiplier('t', birthYear, event.timeH) *
        weightK3Factor(bodyWeightKG)
    );
}

/** The zeroed PK parameters a route/ester combination with no model returns. */
export function zeroPKParams(k3: number): PKParams {
    return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
}
