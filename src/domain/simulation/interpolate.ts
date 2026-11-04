import type { SimulationResult } from '../types';

export function interpolateConcentration_E2(sim: SimulationResult, hour: number): number | null {
    if (!sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return sim.concPGmL_E2[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return sim.concPGmL_E2[sim.concPGmL_E2.length - 1];

    // Binary search for efficiency
    let low = 0;
    let high = sim.timeH.length - 1;

    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return sim.concPGmL_E2[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = sim.concPGmL_E2[low];
    const c1 = sim.concPGmL_E2[high];

    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

/**
 * The lowest cyproterone estimate (ng/mL) worth showing. Below it is the
 * washed-out tail of past doses, which never quite reaches zero: readings show
 * "--" for it and the chart leaves the curve out.
 */
export function interpolateConcentration_E2_free(sim: SimulationResult, hour: number): number | null {
    if (!sim.concPGmL_E2_free || !sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return sim.concPGmL_E2_free[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return sim.concPGmL_E2_free[sim.concPGmL_E2_free.length - 1];

    let low = 0;
    let high = sim.timeH.length - 1;
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return sim.concPGmL_E2_free[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = sim.concPGmL_E2_free[low];
    const c1 = sim.concPGmL_E2_free[high];
    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

export function interpolateConcentration_E2_bioavailable(sim: SimulationResult, hour: number): number | null {
    if (!sim.concPGmL_E2_bioavailable || !sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return sim.concPGmL_E2_bioavailable[0];
    if (hour >= sim.timeH[sim.timeH.length - 1])
        return sim.concPGmL_E2_bioavailable[sim.concPGmL_E2_bioavailable.length - 1];

    let low = 0;
    let high = sim.timeH.length - 1;
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return sim.concPGmL_E2_bioavailable[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = sim.concPGmL_E2_bioavailable[low];
    const c1 = sim.concPGmL_E2_bioavailable[high];
    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

export function interpolateConcentration_SHBG(sim: SimulationResult, hour: number): number | null {
    const arr = sim.shbgNM || sim.shbgNmolL || sim.concNM_SHBG;
    if (!arr || !sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return arr[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return arr[arr.length - 1];

    let low = 0;
    let high = sim.timeH.length - 1;
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return arr[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = arr[low];
    const c1 = arr[high];
    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

export function interpolateConcentration_E2_free_dynamic(sim: SimulationResult, hour: number): number | null {
    const arr = sim.concPGmL_E2_free_dynamic || sim.concPGmL_E2_freeDynamic;
    if (!arr || !sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return arr[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return arr[arr.length - 1];

    let low = 0;
    let high = sim.timeH.length - 1;
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return arr[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = arr[low];
    const c1 = arr[high];
    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

export function interpolateConcentration_rHPG(sim: SimulationResult, hour: number): number | null {
    const arr = sim.rHPG;
    if (!arr || !sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return arr[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return arr[arr.length - 1];
    let low = 0;
    let high = sim.timeH.length - 1;
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return arr[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }
    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = arr[low];
    const c1 = arr[high];
    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

export const CPA_MIN_NGML = 0.1;

export function interpolateConcentration_CPA(sim: SimulationResult, hour: number): number | null {
    if (!sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return sim.concPGmL_CPA[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return sim.concPGmL_CPA[sim.concPGmL_CPA.length - 1];

    // Binary search for efficiency
    let low = 0;
    let high = sim.timeH.length - 1;

    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return sim.concPGmL_CPA[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = sim.concPGmL_CPA[low];
    const c1 = sim.concPGmL_CPA[high];

    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

export function interpolateConcentration_T_free(sim: SimulationResult, hour: number): number | null {
    if (!sim.concNGdL_T_free || !sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return sim.concNGdL_T_free[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return sim.concNGdL_T_free[sim.concNGdL_T_free.length - 1];

    let low = 0;
    let high = sim.timeH.length - 1;
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return sim.concNGdL_T_free[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = sim.concNGdL_T_free[low];
    const c1 = sim.concNGdL_T_free[high];
    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

export function interpolateConcentration_BICA(sim: SimulationResult, hour: number): number | null {
    if (!sim.concPGmL_BICA || !sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return sim.concPGmL_BICA[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return sim.concPGmL_BICA[sim.concPGmL_BICA.length - 1];

    let low = 0;
    let high = sim.timeH.length - 1;

    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return sim.concPGmL_BICA[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = sim.concPGmL_BICA[low];
    const c1 = sim.concPGmL_BICA[high];

    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

export const interpolateConcentration_Bicalutamide = interpolateConcentration_BICA;

// Testosterone (ng/dL) interpolation
export function interpolateConcentration_T(sim: SimulationResult, hour: number): number | null {
    if (!sim.concNGdL_T || !sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return sim.concNGdL_T[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return sim.concNGdL_T[sim.concNGdL_T.length - 1];

    let low = 0;
    let high = sim.timeH.length - 1;
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return sim.concNGdL_T[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = sim.concNGdL_T[low];
    const c1 = sim.concNGdL_T[high];
    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}
