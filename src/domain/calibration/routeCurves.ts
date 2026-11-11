import { Ester, Route } from '../types';
import type { DoseEvent, PKParams } from '../types';
import { CorePK, T_ESTERS, isPlausibleBirthYear, isUnmodelledDrug } from '../constants';
import { resolveParams } from '../dispatch';
import { PrecomputedEventModel, computeMaxLifetimeH } from '../shared/eventModel';
import { getActivePKParams, setActivePKParams } from '../shared/activeParams';

// The estradiol model is linear in dose: the curve is a sum of one term per
// dose, and each dose's term is its route's absorption kernel times that
// route's bioavailability. Splitting the sum by route therefore lets a
// personal factor per route scale its own part exactly, with no new
// simulation. This file evaluates those per-route parts at chosen times, for a
// personal clearance multiplier and a personal absorption multiplier.
//
// It mirrors runSimulation's estradiol branch (same event filter, same
// per-event models, same volume) and computes nothing else, so evaluating it
// on the baseline's own time grid costs a fraction of a full simulation.

/** E2 by route at each requested time, pg/mL. `conc[r][i]` belongs to `routes[r]` at `times[i]`. */
export interface RouteCurves {
    routes: Route[];
    conc: Float64Array[];
}

/** The routes that carry estradiol in these events, in a fixed order. */
export function e2Routes(events: DoseEvent[]): Route[] {
    const seen = new Set<Route>();
    for (const e of events) if (isE2Event(e)) seen.add(e.route);
    return Object.values(Route).filter(r => seen.has(r));
}

function isE2Event(e: DoseEvent): boolean {
    return (
        e.route !== Route.patchRemove &&
        !isUnmodelledDrug(e.ester) &&
        e.ester !== Ester.CPA &&
        e.ester !== Ester.BICA &&
        !T_ESTERS.has(e.ester)
    );
}

/**
 * Per-route E2 at `times` (ascending) with clearance × `kMul` and absorption
 * (every first-order uptake rate: depot release, gut, mucosa, skin) × `absMul`.
 * Zero-order patch delivery has no uptake rate and is left as it is.
 */
export function e2RouteCurves(
    events: DoseEvent[],
    bodyWeightKG: number,
    birthYear: number | null,
    times: ArrayLike<number>,
    kMul: number,
    absMul: number,
    routes: Route[] = e2Routes(events),
): RouteCurves {
    const conc = routes.map(() => new Float64Array(times.length));
    if (!routes.length || bodyWeightKG <= 0) return { routes, conc };
    const born = isPlausibleBirthYear(birthYear) ? birthYear : null;
    const saved = getActivePKParams();
    setActivePKParams({ ...saved, e2_kClear: saved.e2_kClear * kMul, e2_kClearInj: saved.e2_kClearInj * kMul });
    try {
        // Patch removals stay in the list each model sees: they pair with applications.
        const kept = events.filter(e => !isUnmodelledDrug(e.ester) && e.ester !== Ester.BICA);
        const sorted = [...kept].sort((a, b) => a.timeH - b.timeH);
        const routeIndex = new Map(routes.map((r, i) => [r, i]));
        const models = sorted
            .filter(isE2Event)
            .map(e => {
                const base = resolveParams(e, born);
                const params: PKParams =
                    absMul === 1 ? base : { ...base, k1_fast: base.k1_fast * absMul, k1_slow: base.k1_slow * absMul };
                return {
                    model: new PrecomputedEventModel(e, sorted, params),
                    start: e.timeH,
                    life: computeMaxLifetimeH(params, e, sorted),
                    r: routeIndex.get(e.route) ?? -1,
                };
            })
            .filter(m => m.r >= 0);

        const scale = 1e9 / (CorePK.vdPerKG * bodyWeightKG * 1000);
        const active: typeof models = [];
        let next = 0;
        for (let i = 0; i < times.length; i++) {
            const t = times[i];
            while (next < models.length && models[next].start <= t) active.push(models[next++]);
            for (let j = 0; j < active.length;) {
                if (t - active[j].start > active[j].life) {
                    active[j] = active[active.length - 1];
                    active.pop();
                } else j++;
            }
            for (const m of active) conc[m.r][i] += m.model.amount(t) * scale;
        }
    } finally {
        setActivePKParams(saved);
    }
    return { routes, conc };
}
