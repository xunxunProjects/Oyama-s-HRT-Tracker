// GnRH agonist depot + desensitisation.

// --- GnRH agonist depot + desensitisation (Phase 8.2) ---
//
// Depot release follows first-order absorption after a lag; desensitisation
// of the pituitary suppresses LH/testosterone after ~2-4 weeks.
export interface GnRHDepotParams {
    lagDays: number;
    kAbs: number; // day^-1
    desensHalfLifeDays: number;
    maxSuppression: number; // 0..1
}

export const DEFAULT_GNRH_DEPOT: GnRHDepotParams = {
    lagDays: 7,
    kAbs: 0.1,
    desensHalfLifeDays: 14,
    maxSuppression: 0.95,
};

export function gnrhSuppression(tDays: number, params: GnRHDepotParams = DEFAULT_GNRH_DEPOT): number {
    const { lagDays, desensHalfLifeDays, maxSuppression } = params;
    if (tDays < lagDays) return 0;
    const k = Math.log(2) / desensHalfLifeDays;
    return maxSuppression * (1 - Math.exp(-k * (tDays - lagDays)));
}

/**
 * Drugs the plan and the log carry with no level model behind them. Their
 * doses are tracked as taken or not and nothing more: the simulation leaves
 * them out, so they draw no curve and add nothing to any estimate.
 */
