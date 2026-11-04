import type { PKCustomParams } from '../types';
import { DEFAULT_PK_PARAMS } from '../constants';

export const PK_PARAM_RANGES: Record<keyof PKCustomParams, readonly [number, number]> = {
    e2_kClear: [0.001, 5],
    e2_kClearInj: [0.001, 1],
    e2_ff_EB: [0, 1],
    e2_ff_EV: [0, 1],
    e2_ff_EC: [0, 1],
    e2_ff_EN: [0, 1],
    e2_ff_EU: [0, 1],
    e2_oral_bio: [0, 1],
    e2_sl_quick: [0, 1],
    e2_sl_casual: [0, 1],
    e2_sl_standard: [0, 1],
    e2_sl_strict: [0, 1],
    e2_gel_arm: [0, 1],
    e2_gel_thigh: [0, 1],
    e2_gel_scrotal: [0, 1],
    t_kClear: [0.001, 5],
    t_kClearInj: [0.001, 1],
    t_ff_TC: [0, 1],
    t_ff_TE: [0, 1],
    t_ff_TU: [0, 1],
    t_gel_arm: [0, 1],
    t_gel_thigh: [0, 1],
    t_gel_scrotal: [0, 1],
};

/**
 * Defaults this file used to ship. The settings page saves every field, so a
 * stored value equal to a former default was, in all likelihood, never chosen
 * by anyone; it is read as the current default, or a corrected default would
 * never reach a person who once pressed Save. The same goes for that value
 * typed on the page now; any other, such as 0.0251, is used as typed.
 */
const PK_FORMER_DEFAULTS: Partial<Record<keyof PKCustomParams, number[]>> = {
    t_ff_TC: [0.025],
    t_ff_TE: [0.025],
    t_ff_TU: [0.025],
};

/**
 * Clamp an untrusted parameter blob into a usable model.
 *
 * Anything non-numeric, NaN, Infinity or unrecognised is dropped back to the
 * default rather than carried through: an elimination rate of 0 or a negative
 * one turns decay into growth, and a single NaN propagates to every displayed
 * concentration. A former default is read as the current one (see
 * PK_FORMER_DEFAULTS). Returns null when nothing usable was supplied.
 */
export function sanitizePKParams(raw: unknown): PKCustomParams | null {
    if (!raw || typeof raw !== 'object') return null;
    const src = raw as Record<string, unknown>;
    const out: PKCustomParams = { ...DEFAULT_PK_PARAMS };
    let recognised = 0;
    for (const key of Object.keys(PK_PARAM_RANGES) as (keyof PKCustomParams)[]) {
        if (!(key in src)) continue;
        // Only a number, or a string spelling one. Number() alone reads null,
        // '', false and [] as 0, which the clamp below would turn into each
        // parameter's minimum (an elimination rate 400 times too slow).
        const rawValue = src[key];
        const value =
            typeof rawValue === 'number'
                ? rawValue
                : typeof rawValue === 'string' && rawValue.trim() !== ''
                  ? Number(rawValue)
                  : NaN;
        if (!Number.isFinite(value)) continue;
        recognised++;
        if (PK_FORMER_DEFAULTS[key]?.includes(value)) continue;
        const [min, max] = PK_PARAM_RANGES[key];
        out[key] = Math.min(max, Math.max(min, value));
    }
    return recognised > 0 ? out : null;
}

export let _activePKParams: PKCustomParams = { ...DEFAULT_PK_PARAMS };

/**
 * Single choke point for user-supplied parameters — sanitised here so no caller
 * can poison the model, whatever route the blob arrived by.
 */
export function applyPKOverrides(params: PKCustomParams | null): void {
    _activePKParams = sanitizePKParams(params) ?? { ...DEFAULT_PK_PARAMS };
}

/** Snapshot of the currently-active (merged) PK parameters. */
export function getActivePKParams(): PKCustomParams {
    return { ..._activePKParams };
}

/** Replace the active parameter set. Used by the explicit-params simulation wrapper. */
export function setActivePKParams(params: PKCustomParams): void {
    _activePKParams = params;
}

/**
 * Run a simulation with an explicit parameter set, restoring the previously
 * active parameters afterwards. Used by the adaptive calibration to evaluate
 * candidate personal-PK fits without disturbing the live simulation's params.
 */
