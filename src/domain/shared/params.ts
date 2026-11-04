import { Route } from '../types';
import type { DoseEvent, PKParams } from '../types';
import { _activePKParams } from './activeParams';
import { ageClearanceMultiplier } from '../features/popPK';

/** Estradiol clearance rate for this event's route and age. */
export function e2Clearance(event: DoseEvent, birthYear: number | null): number {
    return (
        (event.route === Route.injection ? _activePKParams.e2_kClearInj : _activePKParams.e2_kClear) *
        ageClearanceMultiplier('e2', birthYear, event.timeH)
    );
}

/** Testosterone clearance rate for this event's route and age. */
export function tClearance(event: DoseEvent, birthYear: number | null): number {
    return (
        (event.route === Route.injection ? _activePKParams.t_kClearInj : _activePKParams.t_kClear) *
        ageClearanceMultiplier('t', birthYear, event.timeH)
    );
}

/** The zeroed PK parameters a route/ester combination with no model returns. */
export function zeroPKParams(k3: number): PKParams {
    return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
}
