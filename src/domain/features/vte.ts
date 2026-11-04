// VTE / coagulation risk flag.
import type { SimulationResult } from '../types';

// --- VTE / coagulation risk flag (A8) ---
export interface VTEParams {
    beta0: number;
    beta1: number;
    beta2: number;
}
export const DEFAULT_VTE_PARAMS: VTEParams = {
    beta0: -3.0,
    beta1: 0.02,
    beta2: 0.1,
};

export function logistic(x: number): number {
    if (x >= 0) {
        const z = Math.exp(-x);
        return 1 / (1 + z);
    }
    const z = Math.exp(x);
    return z / (1 + z);
}

export function vteRiskCurve(
    sim: SimulationResult,
    params: VTEParams = DEFAULT_VTE_PARAMS,
    windowH: number = 90 * 24,
    _scalePgMl: number = 200,
    covariates: number = 0,
): number[] {
    const n = sim.timeH.length;
    const out: number[] = new Array(n);
    const prefix: number[] = new Array(n + 1);
    prefix[0] = 0;
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + sim.concPGmL_E2[i];
    let left = 0;
    for (let i = 0; i < n; i++) {
        const t = sim.timeH[i];
        const cutoff = t - windowH;
        while (left < i && sim.timeH[left] < cutoff) left++;
        const cnt = i - left + 1;
        const sum = prefix[i + 1] - prefix[left];
        const avg = cnt > 0 ? sum / cnt : 0;
        const x = params.beta0 + params.beta1 * avg + params.beta2 * covariates;
        out[i] = logistic(x);
    }
    return out;
}
