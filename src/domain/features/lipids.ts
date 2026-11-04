// Lipid / hepatic steatosis slow variable.
import type { SimulationResult } from '../types';

// --- Lipid / hepatic steatosis slow variable (A5) ---
export interface LipidParams {
    kIn: number; // baseline LDL production (mg/dL per day)
    kOut: number; // clearance (per day)
    beta: number; // E2 sensitivity
}
export const DEFAULT_LIPID_PARAMS: LipidParams = {
    kIn: 2.0,
    kOut: 0.02,
    beta: 0.3,
};

export function lipidCurve(
    sim: SimulationResult,
    params: LipidParams = DEFAULT_LIPID_PARAMS,
    windowH: number = 180 * 24,
    scalePgMl: number = 200,
): number[] {
    const n = sim.timeH.length;
    const out: number[] = new Array(n);
    const prefix: number[] = new Array(n + 1);
    prefix[0] = 0;
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + sim.concPGmL_E2[i];
    let ldl = 100;
    let left = 0;
    for (let i = 0; i < n; i++) {
        const t = sim.timeH[i];
        const cutoff = t - windowH;
        while (left < i && sim.timeH[left] < cutoff) left++;
        const cnt = i - left + 1;
        const sum = prefix[i + 1] - prefix[left];
        const avg = cnt > 0 ? sum / cnt : 0;
        const exposure = Math.max(0, Math.min(1, avg / scalePgMl));
        const dtDays = i > 0 ? (sim.timeH[i] - sim.timeH[i - 1]) / 24 : 0;
        if (i > 0) {
            const dldl = params.kIn * (1 + params.beta * exposure) - params.kOut * ldl;
            ldl = ldl + dldl * dtDays;
            if (!Number.isFinite(ldl) || ldl < 0) ldl = Math.max(0, ldl);
        }
        out[i] = ldl;
    }
    return out;
}
