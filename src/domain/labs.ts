// Lab unit conversion, E2 PK debug helpers, and lab timing.
import { ExtraKey, Route } from './types';
import type { DoseEvent, LabResult, SimulationResult } from './types';
import { T_ESTERS, isEstradiolEster } from './constants';
import { SL_TIER_ORDER, SublingualTierParams } from './constants';
import { sublingualHoldFromTheta } from './transfem/e2-sublingual';
import { interpolateConcentration_E2, interpolateConcentration_T } from './simulation/interpolate';

export function convertToPgMl(val: number, unit: 'pg/ml' | 'pmol/l' | 'ng/dl' | 'nmol/l'): number {
    if (unit === 'pg/ml') return val;
    if (unit === 'pmol/l') return val / 3.671;
    return val; // ng/dl / nmol/l are T units, not meaningful as pg/mL — caller should filter
}

// Convert a testosterone lab value to ng/dL (transmasc native unit).
export function convertToNgDl(val: number, unit: 'pg/ml' | 'pmol/l' | 'ng/dl' | 'nmol/l'): number {
    if (unit === 'ng/dl') return val;
    if (unit === 'nmol/l') return val * 28.842; // 1 nmol/L T ≈ 28.842 ng/dL
    return val; // pg/ml / pmol/l are E2 units — not meaningful as ng/dL
}

export function isT_LabUnit(unit: LabResult['unit']): boolean {
    return unit === 'ng/dl' || unit === 'nmol/l';
}

// --- E2 PK parameter debugging helpers (A9) ---
export const E2_PK_UNIT_FACTORS = {
    pgMlToPmolL: 3.671,
    pmolLToPgMl: 1 / 3.671,
    tNgDlToNmolL: 1 / 28.842,
    tNmolLToNgDl: 28.842,
} as const;

export function e2PgMlToPmolL(pgMl: number): number {
    return pgMl * E2_PK_UNIT_FACTORS.pgMlToPmolL;
}
export function e2PmolLToPgMl(pmolL: number): number {
    return pmolL * E2_PK_UNIT_FACTORS.pmolLToPgMl;
}

export const E2_PK_SAMPLING_OFFSETS_H = [0.25, 0.5, 1, 2, 4, 6, 8, 12, 24, 48];

export function validateE2PKParams(params: unknown): boolean {
    if (!params || typeof params !== 'object') return false;
    const p = params as Record<string, unknown>;
    // Accept any PKCustomParams-like object with finite numeric fields.
    for (const v of Object.values(p)) {
        if (typeof v === 'number' && !Number.isFinite(v)) return false;
    }
    return true;
}

// --- Lab timing ---

/** A lab drawn more than this long after the last dose is not tied to one dose. */
const LAB_DOSE_LOOKBACK_H = 30 * 24;

export interface LabDoseContext {
    /** The newest dose of the lab's hormone at or before the draw. */
    event: DoseEvent;
    /** Hours from that dose to the draw. */
    hoursBefore: number;
    /** For a sublingual dose, the hold time in minutes it was logged with. */
    holdMin: number | null;
}

/** The hold time a sublingual dose was logged with: a custom one, its tier's, or the standard tier's. */
export function sublingualHoldMin(e: DoseEvent): number | null {
    if (e.route !== Route.sublingual) return null;
    const theta = e.extras[ExtraKey.sublingualTheta];
    if (typeof theta === 'number' && Number.isFinite(theta)) return Math.round(sublingualHoldFromTheta(theta));
    const tier = e.extras[ExtraKey.sublingualTier];
    const idx =
        typeof tier === 'number' && Number.isFinite(tier)
            ? Math.min(SL_TIER_ORDER.length - 1, Math.max(0, Math.round(tier)))
            : SL_TIER_ORDER.indexOf('standard');
    return SublingualTierParams[SL_TIER_ORDER[idx]].hold;
}

/**
 * The dose a lab reads after: the newest dose of the lab's hormone (estradiol
 * for an E2 lab, testosterone for a T lab) logged at or before the draw, and
 * how long before it. This is the timing a lab needs to be compared with the
 * model, and what a sublingual calibration (issue #22) asks for. Null when no
 * such dose falls in the 30 days before the draw.
 */
export function labDoseContext(lab: LabResult, events: DoseEvent[]): LabDoseContext | null {
    const isT = isT_LabUnit(lab.unit);
    let best: DoseEvent | null = null;
    for (const e of events) {
        if (e.route === Route.patchRemove || e.timeH > lab.timeH) continue;
        if (lab.timeH - e.timeH > LAB_DOSE_LOOKBACK_H) continue;
        if (isT ? !T_ESTERS.has(e.ester) : !isEstradiolEster(e.ester)) continue;
        if (!best || e.timeH > best.timeH) best = e;
    }
    if (!best) return null;
    return { event: best, hoursBefore: lab.timeH - best.timeH, holdMin: sublingualHoldMin(best) };
}

/**
 * What the model, before any calibration, says for the lab's hormone at the
 * draw: estradiol in pg/mL or total testosterone in ng/dL, the units the lab
 * is converted to for comparing. Null where the model has nothing to say
 * (no dose yet, or a level too small to compare with).
 */
export function rawModelAtLab(sim: SimulationResult | null, lab: LabResult): number | null {
    if (!sim) return null;
    const v = isT_LabUnit(lab.unit)
        ? interpolateConcentration_T(sim, lab.timeH)
        : interpolateConcentration_E2(sim, lab.timeH);
    return v != null && Number.isFinite(v) && v >= 1 ? v : null;
}

/** The lab converted to the unit the model uses for its hormone (pg/mL E2, ng/dL T). */
export function labInModelUnit(lab: LabResult): number {
    return isT_LabUnit(lab.unit) ? convertToNgDl(lab.concValue, lab.unit) : convertToPgMl(lab.concValue, lab.unit);
}
