import { Route } from '../types';
import type { DoseEvent, PKParams } from '../types';
import { moduleFor } from '../dispatch';
import { resolvePatchWearH } from './patch';

export class PrecomputedEventModel {
    private model: (t: number) => number;
    // The swallowed part of model(t): all of it for an oral dose, the slow
    // branch of a sublingual one, none for any other route.
    private swallowedModel: (t: number) => number;

    constructor(event: DoseEvent, allEvents: DoseEvent[], params: PKParams) {
        const module = moduleFor(event.route, event.ester);
        if (!module) {
            this.model = () => 0;
            this.swallowedModel = () => 0;
            return;
        }
        const amounts = module.buildAmount(event, allEvents, params);
        this.model = amounts.amount;
        this.swallowedModel = amounts.swallowed;
    }

    amount(timeH: number): number {
        return this.model(timeH);
    }

    swallowedAmount(timeH: number): number {
        return this.swallowedModel(timeH);
    }
}

// --- Simulation Engine ---

/**
 * Compute the maximum time (hours after dose) for which an event's PK model
 * contribution is non-negligible.  Once tau > maxLifetimeH the exponential
 * decay has reduced the amount to < 1e-6 of its peak, so we can safely skip
 * the evaluation — critical when there are hundreds of events (e.g. daily
 * oral recording for a year).
 */
export function computeMaxLifetimeH(params: PKParams, event: DoseEvent, allEvents: DoseEvent[]): number {
    // For patches: account for wear duration + post-removal decay. Resolve the
    // wear of this very event: two patches applied at the same moment can come
    // off at different times.
    if (event.route === Route.patchApply || event.route === Route.pellet) {
        const wearH = resolvePatchWearH(event, allEvents);
        if (wearH >= Number.MAX_VALUE) return Infinity; // Worn indefinitely, always contributes
        const decayH = params.k3 > 0 ? Math.ceil(13.816 / params.k3) : 10000;
        return wearH + decayH;
    }

    // Collect all non-zero rate constants that govern exponential decay
    const rates: number[] = [];
    if (params.k1_fast > 0) rates.push(params.k1_fast);
    if (params.k1_slow > 0) rates.push(params.k1_slow);
    if (params.k2 > 0) rates.push(params.k2);
    if ((params.k2_slow ?? 0) > 0) rates.push(params.k2_slow!);
    if (params.k3 > 0) rates.push(params.k3);

    if (rates.length === 0) return Infinity;

    // The slowest exponential dominates at large tau.
    // exp(-kMin * tau) < 1e-6  =>  tau > ln(1e6) / kMin ≈ 13.816 / kMin
    const kMin = Math.min(...rates);
    return Math.ceil(13.816 / kMin);
}
