import { ExtraKey, Route } from '../types';
import type { DoseEvent } from '../types';
import { isEstradiolEster, isTestosteroneEster } from '../constants';

const PATCH_MIN_WEAR_H = 1;
const PATCH_REMOVAL_GRACE_H = 24;
// How far past its planned wear a removal can still end a patch. A twice-weekly
// 0.1 mg/day patch holds about 15.6 days of drug at its labelled rate (Vivelle-Dot
// label: 1.56 mg), and 84 h of planned wear plus this stays inside that.
const PATCH_MAX_OVERWEAR_H = 240;

const patchRemovalCache = new WeakMap<DoseEvent[], Map<DoseEvent, number>>();

function _patchHormone(e: DoseEvent): 'e2' | 't' | null {
    if (isTestosteroneEster(e.ester)) return 't';
    if (isEstradiolEster(e.ester)) return 'e2';
    return null;
}

export function _plannedWearH(e: DoseEvent): number | null {
    const planned = e.extras?.[ExtraKey.patchWearH];
    return typeof planned === 'number' && Number.isFinite(planned) && planned > 0 ? planned : null;
}

export function patchRemovalTimes(allEvents: DoseEvent[]): Map<DoseEvent, number> {
    const cached = patchRemovalCache.get(allEvents);
    if (cached) return cached;
    const pairs = new Map<DoseEvent, number>();

    const byTimeThenContent = (a: DoseEvent, b: DoseEvent) =>
        a.timeH - b.timeH ||
        (_plannedWearH(a) ?? Infinity) - (_plannedWearH(b) ?? Infinity) ||
        a.doseMG - b.doseMG ||
        (Number(a.extras?.[ExtraKey.releaseRateUGPerDay]) || 0) -
            (Number(b.extras?.[ExtraKey.releaseRateUGPerDay]) || 0) ||
        String(a.ester).localeCompare(String(b.ester)) ||
        String(a.id).localeCompare(String(b.id));
    const applies = allEvents.filter(e => e.route === Route.patchApply).sort(byTimeThenContent);
    // A removal of either hormone goes before one that names neither, which
    // can take a patch of any hormone.
    const hormoneRank = (e: DoseEvent) => {
        const h = _patchHormone(e);
        return h === 'e2' ? 0 : h === 't' ? 1 : 2;
    };
    const removals = allEvents
        .filter(e => e.route === Route.patchRemove)
        .sort((a, b) => a.timeH - b.timeH || hormoneRank(a) - hormoneRank(b));

    let open: DoseEvent[] = []; // unpaired applications, oldest first
    let next = 0;
    for (const r of removals) {
        while (next < applies.length && applies[next].timeH <= r.timeH - PATCH_MIN_WEAR_H) open.push(applies[next++]);
        // Removals arrive in time order, so a patch whose planned wear ended
        // more than the grace period ago is never matched by plan again (only
        // by the fallback below).
        open = open.filter(a => {
            const wear = _plannedWearH(a);
            return wear === null || a.timeH + wear + PATCH_REMOVAL_GRACE_H >= r.timeH;
        });
        const hormone = _patchHormone(r);
        const idx = open.findIndex(a => hormone === null || _patchHormone(a) === hormone);
        if (idx >= 0) {
            pairs.set(open[idx], r.timeH);
            open.splice(idx, 1);
            continue;
        }
        // No patch fits by its plan. An explicit removal still ends a patch
        // worn past it (see ExtraKey.patchWearH), so it goes to the newest
        // patch of that hormone put on before it, if that one is unpaired and
        // within PATCH_MAX_OVERWEAR_H of its plan. An older patch is never
        // taken: a newer one replaced it. Patches put on at the same moment are
        // tried in the order the plan match above uses.
        const fits = (a: DoseEvent) => hormone === null || _patchHormone(a) === hormone;
        let last = next - 1;
        while (last >= 0 && !fits(applies[last])) last--;
        if (last < 0) continue;
        let first = last;
        while (first > 0 && applies[first - 1].timeH === applies[last].timeH) first--;
        for (let i = first; i <= last; i++) {
            const a = applies[i];
            if (!fits(a) || pairs.has(a)) continue;
            if (r.timeH > a.timeH + (_plannedWearH(a) ?? 0) + PATCH_MAX_OVERWEAR_H) continue;
            pairs.set(a, r.timeH);
            break;
        }
    }
    patchRemovalCache.set(allEvents, pairs);
    return pairs;
}

/**
 * How long (hours after application) a patch stays on the skin delivering drug.
 * Resolution order:
 *   1. The patchRemove event paired with this application wins (the user
 *      removed it at a known time, possibly earlier/later than planned).
 *   2. Otherwise the planned wear duration stored on the apply event is used, so
 *      a single "apply" event self-completes.
 *   3. Otherwise the patch is assumed to be worn indefinitely (legacy behaviour).
 */
export function resolvePatchWearH(event: DoseEvent, allEvents: DoseEvent[]): number {
    const removeAt = patchRemovalTimes(allEvents).get(event);
    if (removeAt !== undefined && removeAt > event.timeH) return removeAt - event.timeH;
    const planned = event.extras?.[ExtraKey.patchWearH];
    if (typeof planned === 'number' && Number.isFinite(planned) && planned > 0) return planned;
    return Number.MAX_VALUE;
}

// Model Solver
