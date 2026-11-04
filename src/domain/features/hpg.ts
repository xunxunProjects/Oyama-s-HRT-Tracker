// HPG axis suppression (transfeminine, dynamic).

// --- HPG axis suppression (transfeminine, dynamic, issue #260 A3) ---
//
// Dynamic counterpart of the steady-state estradiolTestosteroneSuppressionFactor:
// R_HPG follows first-order kinetics driven by estradiol, with endogenous
// testosterone = T_base * R_HPG. Integrated over the simulation grid.

export interface HPGParams {
    /** Relative HPG activity at baseline (0..1). */
    r0: number;
    /** Synthesis rate (1/h). */
    kIn: number;
    /** Clearance rate (1/h). */
    kOut: number;
    /** Maximum fractional inhibition by estradiol. */
    imax: number;
    /** Estradiol (pg/mL) giving half the maximum inhibition. */
    ic50PgMl: number;
}

export const DEFAULT_HPG_PARAMS: HPGParams = {
    r0: 1,
    kIn: 1 / 24,
    kOut: 1 / 24,
    imax: 0.95,
    ic50PgMl: 50,
};

export function hpgAxisCurve(e2PgMl: number[], timeH: number[], params: HPGParams = DEFAULT_HPG_PARAMS): number[] {
    if (!e2PgMl.length || !timeH.length) return [];
    const n = Math.min(e2PgMl.length, timeH.length);
    const r: number[] = [params.r0];
    for (let i = 1; i < n; i++) {
        const dt = timeH[i] - timeH[i - 1];
        if (!(dt > 0)) {
            r.push(r[r.length - 1]);
            continue;
        }
        const c = Math.max(0, e2PgMl[i - 1]);
        const inhibition = (params.imax * c) / (params.ic50PgMl + c);
        const target = 1 - inhibition;
        // Exact integration of dR/dt = kIn*(target) - kOut*R over dt, with
        // target taken as constant over the step.
        const a = params.kOut;
        const steady = (params.kIn / a) * target;
        const prev = r[r.length - 1];
        r.push(steady + (prev - steady) * Math.exp(-a * dt));
    }
    // Pad if needed
    while (r.length < n) r.push(r[r.length - 1] ?? params.r0);
    return r;
}
