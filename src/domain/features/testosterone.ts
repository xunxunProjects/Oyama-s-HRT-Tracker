// Testosterone exposure and suppression helpers.

// --- Free / bioavailable testosterone (Vermeulen-style) ---
//
// Total testosterone is the sum of free, SHBG-bound and albumin-bound
// fractions. Solving the binding equilibria gives a quadratic in free T.
// Constants are the standard Vermeulen values: K_SHBG ~ 1 L/nmol and
// K_Alb ~ 3.6e-5 L/nmol (with albumin converted to nmol/L of binding sites).
// Inputs: totalT in ng/dL, shbg in nmol/L, albumin in g/dL.
export function freeTestosteroneNgDl(totalTNgDl: number, shbgNmolL: number, albuminGDl: number): number {
    const T = totalTNgDl / 28.84; // nmol/L
    const S = shbgNmolL;
    const albGL = albuminGDl * 10; // g/L
    const albSites = (albGL * 1e9) / 66500; // nmol/L of albumin binding sites
    const Kshbg = 1.0; // L/nmol
    const Kalb = 3.6e-5; // L/nmol
    const albFactor = Kalb * albSites;
    const a = Kshbg * (1 + albFactor);
    const b = 1 + Kshbg * S + albFactor - Kshbg * T;
    const disc = b * b + 4 * a * T;
    const ft = (-b + Math.sqrt(disc)) / (2 * a);
    return ft * 28.84;
}

export function bioavailableTestosteroneNgDl(totalTNgDl: number, shbgNmolL: number, albuminGDl: number): number {
    const ft = freeTestosteroneNgDl(totalTNgDl, shbgNmolL, albuminGDl);
    const albGL = albuminGDl * 10;
    const albSites = (albGL * 1e9) / 66500;
    const albFactor = 3.6e-5 * albSites;
    // albumin-bound = free * albFactor (linear, low-affinity regime)
    return ft * (1 + albFactor);
}

// --- Testosterone suppression by feminizing therapy (adjunct to antiandrogens) ---
//
// Estradiol suppresses endogenous testosterone via hypothalamic/pituitary
// negative feedback (LH/FSH). On its own it is only a partial suppressor at
// physiological levels: ~90% suppression (~50 ng/dL residual) at E2 ~200 pg/mL,
// ~95% (~20-30 ng/dL) at ~500 pg/mL; lower levels suppress less
// (transfemscience.org intro; Leinung 2018; Misakian 2025 PMID 40639470).
// It is therefore modelled here as an *adjunct* to antiandrogens (CPA, GnRH
// agonists, ...), not as a standalone substitute for them.
//
// The factor below is the fraction of a person's baseline (pre-therapy)
// testosterone still present at a given estradiol concentration. It is a
// population-level, steady-state approximation; it does not resolve the
// LH/FSH kinetics and must be anchored to a measured baseline (first blood
// test) in any individual use. Antiandrogens add a further reduction on top
// (combinedTestosteroneSuppressionFactor).
//
// Fit: r(E2) = 1 / (1 + (E2 / E0)^k), calibrated to r(200 pg/mL) ≈ 0.10
// and r(500 pg/mL) ≈ 0.05 (see issue spec).

export const TT_SUPPRESSION_E0_PGML = 13.5; // pg/mL, population fit constant
export const TT_SUPPRESSION_K = 0.815; // dimensionless, population fit exponent

/** Fraction of baseline testosterone remaining at estradiol concentration e2PgMl. */
export function estradiolTestosteroneSuppressionFactor(e2PgMl: number): number {
    if (!Number.isFinite(e2PgMl) || e2PgMl <= 0) return 1;
    const r = 1 / (1 + Math.pow(e2PgMl / TT_SUPPRESSION_E0_PGML, TT_SUPPRESSION_K));
    return Math.min(1, Math.max(0, r));
}

/**
 * Combined suppression factor when an antiandrogen is also present. The
 * antiandrogen contributes an additional reduction on top of estradiol's
 * partial effect (adjunct premise). The extra factor is a population
 * approximation: with an effective antiandrogen the residual is pushed down to
 * roughly a third of the estradiol-only residual.
 */
export function combinedTestosteroneSuppressionFactor(e2PgMl: number, antiandrogenPresent: boolean): number {
    const e2Factor = estradiolTestosteroneSuppressionFactor(e2PgMl);
    if (!antiandrogenPresent) return e2Factor;
    return Math.min(e2Factor, e2Factor * 0.3);
}

/** Expected testosterone (ng/dL) from a measured baseline under a given E2 level. */
export function expectedTestosteroneNgDl(
    baselineNgDl: number,
    e2PgMl: number,
    antiandrogenPresent: boolean = false,
): number {
    if (!Number.isFinite(baselineNgDl) || baselineNgDl < 0) return 0;
    const factor = combinedTestosteroneSuppressionFactor(e2PgMl, antiandrogenPresent);
    return baselineNgDl * factor;
}
