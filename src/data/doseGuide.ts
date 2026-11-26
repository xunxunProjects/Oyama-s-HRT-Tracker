import { Route } from '../../logic';

/*
 * How much estradiol a day reads as low, medium, high or very high, by route:
 * the dose form's level guide, and the rail on a medicine's page. Calibrated
 * for feminizing HRT with estradiol only; nothing here says anything about
 * testosterone or the anti-androgens.
 */

export type DoseLevelKey = 'low' | 'medium' | 'high' | 'very_high' | 'above';

export type DoseGuideConfig = {
    unitKey: 'mg_day' | 'ug_day' | 'mg_week';
    thresholds: [number, number, number, number];
    requiresRate?: boolean;
};

export const DOSE_GUIDE_CONFIG: Partial<Record<Route, DoseGuideConfig>> = {
    [Route.oral]: { unitKey: 'mg_day', thresholds: [2, 4, 8, 12] },
    [Route.sublingual]: { unitKey: 'mg_day', thresholds: [1, 2, 4, 6] },
    [Route.patchApply]: { unitKey: 'ug_day', thresholds: [100, 200, 400, 600], requiresRate: true },
    [Route.gel]: { unitKey: 'mg_day', thresholds: [1.5, 3, 6, 9] },
};

export const LEVEL_BADGE_STYLES: Record<DoseLevelKey, string> = {
    low: 'text-[var(--status-positive)]',
    medium: 'text-[var(--status-info)]',
    high: 'text-[var(--warning)]',
    very_high: 'text-[var(--danger)]',
    above: 'text-[var(--danger)]',
};

export const formatGuideNumber = (val: number) => {
    if (Number.isInteger(val)) return val.toString();
    const rounded = val < 1 ? val.toFixed(2) : val.toFixed(1);
    return rounded.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
};

/** Where a value falls on a route's guide. */
export const levelOf = (value: number, cfg: DoseGuideConfig): DoseLevelKey => {
    const [low, medium, high, veryHigh] = cfg.thresholds;
    if (value <= low) return 'low';
    if (value <= medium) return 'medium';
    if (value <= high) return 'high';
    if (value <= veryHigh) return 'very_high';
    return 'above';
};
