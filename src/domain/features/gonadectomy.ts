// Gonadectomy / uterus state helpers.

// --- Gonadectomy / uterus state (Phase 4.1) ---
export type GonadectomyState = 'intact' | 'hysterectomy-only' | 'bso';

export function endogenousBackground(
    state: GonadectomyState,
    rHpg: number, // 0..1 HPG relative activity
    aromataseFactor: number, // alpha_arom * C_F (T-driven E2)
): { e2Endo: number; tEndo: number } {
    const T_BASE = 600; // ng/dL, illustrative baseline
    const E2_OVARY_BASE = 100; // pg/mL, illustrative
    const E2_ADRENAL = 15; // pg/mL
    const T_ADRENAL = 20; // ng/dL
    if (state === 'bso') {
        return { e2Endo: aromataseFactor + E2_ADRENAL, tEndo: T_ADRENAL };
    }
    // intact or hysterectomy-only: ovaries present
    return { e2Endo: E2_OVARY_BASE * rHpg + aromataseFactor, tEndo: T_BASE * rHpg };
}

export function hasUterus(state: GonadectomyState): boolean {
    return state !== 'hysterectomy-only' && state !== 'bso';
}
