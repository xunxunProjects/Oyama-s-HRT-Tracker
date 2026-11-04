// Body-composition slow variables.
import type { SimulationResult } from '../types';

// --- Body composition slow variables (Phase 7.1) ---
//
// dM/dt = k_gain_M * E(avg) - k_loss_M * M
// dF_visc/dt = k_gain_F * E(avg) - k_turn_F * F_visc
// Exposure E is a 0..1 normalised drive from the 90-d rolling average.
export interface BodyCompParams {
    kGainM: number;
    kLossM: number;
    kGainF: number;
    kTurnF: number;
}

export const DEFAULT_BODY_COMP_PARAMS: BodyCompParams = {
    kGainM: 0.001,
    kLossM: 0.0005,
    kGainF: 0.0008,
    kTurnF: 0.0004,
};

export function bodyCompStep(
    m: number,
    fVisc: number,
    exposure: number, // 0..1 normalised
    dtDays: number,
    params: BodyCompParams = DEFAULT_BODY_COMP_PARAMS,
): { m: number; fVisc: number } {
    const { kGainM, kLossM, kGainF, kTurnF } = params;
    const e = Math.max(0, Math.min(1, exposure));
    const dm = kGainM * e - kLossM * m;
    const df = kGainF * e - kTurnF * fVisc;
    return { m: m + dm * dtDays, fVisc: fVisc + df * dtDays };
}

// --- Body composition curve (A4): integrate slow variables over a simulation ---
export function bodyCompCurve(
    sim: SimulationResult,
    params: BodyCompParams = DEFAULT_BODY_COMP_PARAMS,
    windowH: number = 90 * 24,
    scalePgMl: number = 200,
): { m: number[]; fVisc: number[] } {
    const n = sim.timeH.length;
    const mArr: number[] = new Array(n);
    const fArr: number[] = new Array(n);
    // Prefix sums for O(1) windowed averages.
    const prefix: number[] = new Array(n + 1);
    prefix[0] = 0;
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + sim.concPGmL_E2[i];

    let m = 0;
    let f = 0;
    let left = 0;
    for (let i = 0; i < n; i++) {
        const t = sim.timeH[i];
        const cutoff = t - windowH;
        while (left > 0 && sim.timeH[left - 1] >= cutoff) left--; // not needed, kept for safety
        while (left < i && sim.timeH[left] < cutoff) left++;
        const cnt = i - left + 1;
        const sum = prefix[i + 1] - prefix[left];
        const avg = cnt > 0 ? sum / cnt : 0;
        const exposure = Math.max(0, Math.min(1, avg / scalePgMl));
        const dtDays = i > 0 ? (sim.timeH[i] - sim.timeH[i - 1]) / 24 : 0;
        if (i > 0) {
            const bc = bodyCompStep(m, f, exposure, dtDays, params);
            m = bc.m;
            f = bc.fVisc;
        }
        mArr[i] = m;
        fArr[i] = f;
    }
    return { m: mArr, fVisc: fArr };
}
