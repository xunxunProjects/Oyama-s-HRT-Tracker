// Hematocrit turnover model (transmasculine safety PD).

// --- Hematocrit turnover model (transmasculine safety PD, Phase 5.1) ---
//
// Indirect-response model: androgens stimulate erythropoiesis with a lag.
// dHct/dt = k_in*(1 + Emax*C/(EC50+C)) - k_out*Hct, with k_in = k_out*Hct0
// so that Hct0 is the steady state at zero exposure.
export interface HctParams {
    hct0: number; // baseline hematocrit (fraction, e.g. 0.42)
    kOut: number; // h^-1
    emax: number;
    ec50: number; // ng/dL free T
}

export const DEFAULT_HCT_PARAMS: HctParams = {
    hct0: 0.42,
    kOut: 0.002, // ~14 d half-life for the turnover
    emax: 0.25,
    ec50: 400,
};

export function hctStep(hct: number, freeTNgDl: number, dtH: number, params: HctParams = DEFAULT_HCT_PARAMS): number {
    const { hct0, kOut, emax, ec50 } = params;
    const kIn = kOut * hct0;
    const stim = 1 + (emax * freeTNgDl) / (ec50 + freeTNgDl);
    const deriv = kIn * stim - kOut * hct;
    return hct + deriv * dtH;
}
