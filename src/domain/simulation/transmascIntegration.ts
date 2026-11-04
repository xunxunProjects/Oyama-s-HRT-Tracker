import type { SimulationResult } from '../types';
import { freeTestosteroneNgDl } from '../features/testosterone';
import { hctStep } from '../features/hct';
import { bodyCompStep } from '../features/bodyComp';
import { amenorrheaHazard } from '../features/amenorrhea';

// --- Stateful transmasculine integration (Phase 2/4/5/6/7 wiring) ---
//
// Steps the pure PD models (Hct, body comp, amenorrhea) over a completed
// SimulationResult's time grid. Additive: does not modify runSimulation.
export interface TransmascIntegrationOptions {
    shbg?: number;
    albumin?: number;
    hct0?: number;
    exposureScale?: number; // ng/dL -> 0..1 normalised drive
}

export interface TransmascIntegrationResult {
    hct: number[];
    muscle: number[];
    viscFat: number[];
    amenorrheaProb: number[];
}

export function integrateTransmascState(
    sim: SimulationResult,
    opts: TransmascIntegrationOptions = {},
): TransmascIntegrationResult {
    const alb = opts.albumin ?? 4.3;
    const hct0 = opts.hct0 ?? 0.42;
    const scale = opts.exposureScale ?? 1000;
    const n = sim.timeH.length;
    const hct = new Array(n);
    const muscle = new Array(n);
    const viscFat = new Array(n);
    const amenorrheaProb = new Array(n);
    let h = hct0;
    let m = 1;
    let f = 1;
    let cumHazard = 0;
    let prevT = sim.timeH[0];
    for (let i = 0; i < n; i++) {
        const t = sim.timeH[i];
        const dtH = i === 0 ? 0 : t - prevT;
        const freeT = sim.concNGdL_T_free ? sim.concNGdL_T_free[i] : freeTestosteroneNgDl(sim.concNGdL_T[i], 30, alb);
        const totalT = sim.concNGdL_T[i];
        const e2 = sim.concPGmL_E2[i];
        h = i === 0 ? hct0 : hctStep(h, freeT, dtH);
        const exposure = Math.max(0, Math.min(1, freeT / scale));
        const bc = bodyCompStep(m, f, exposure, dtH / 24);
        m = bc.m;
        f = bc.fVisc;
        const haz = amenorrheaHazard(totalT, e2);
        cumHazard += haz * (dtH / 24); // per-day hazard integrated over days
        const prob = 1 - Math.exp(-cumHazard);
        hct[i] = h;
        muscle[i] = m;
        viscFat[i] = f;
        amenorrheaProb[i] = Math.max(0, Math.min(1, prob));
        prevT = t;
    }
    return { hct, muscle, viscFat, amenorrheaProb };
}
