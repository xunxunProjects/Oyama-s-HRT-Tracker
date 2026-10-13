import { DoseEvent, Ester, ExtraKey, LabResult, Route, SimulationResult } from '../logic';

/** The frozen "now" for every test, in hours since 1970 (mid-October 2024). */
export const NOW_H = 480_000;

/** Reference body weight used throughout, in kg. */
export const BW = 70;

/** Distribution volumes the engine uses, in mL, at the reference weight. */
export const VD_E2_ML = 2.0 * BW * 1000;
export const VD_CPA_ML = 14.0 * BW * 1000;
export const VD_T_ML = 1.0 * BW * 1000;

let seq = 0;

export function dose(
    route: Route,
    ester: Ester,
    doseMG: number,
    timeH: number,
    extras: Partial<Record<ExtraKey, number>> = {},
): DoseEvent {
    seq += 1;
    return { id: `dose-${seq}`, route, ester, doseMG, timeH, extras };
}

/** `count` identical doses every `everyH` hours, the last one at `lastH`. */
export function regimen(
    route: Route,
    ester: Ester,
    doseMG: number,
    everyH: number,
    count: number,
    lastH: number,
    extras: Partial<Record<ExtraKey, number>> = {},
): DoseEvent[] {
    return Array.from({ length: count }, (_, i) =>
        dose(route, ester, doseMG, lastH - everyH * (count - 1 - i), extras),
    );
}

export function lab(timeH: number, concValue: number, unit: LabResult['unit'] = 'pg/ml'): LabResult {
    seq += 1;
    return { id: `lab-${seq}`, timeH, concValue, unit };
}

type Reader = (sim: SimulationResult, hour: number) => number | null;

/** Sample a curve on [from, to] and report its peak and time-average. */
export function scan(sim: SimulationResult, read: Reader, from: number, to: number, step = 0.05) {
    let cmax = -Infinity;
    let tmax = from;
    let sum = 0;
    let n = 0;
    for (let t = from; t <= to + 1e-9; t += step) {
        const c = read(sim, t) ?? NaN;
        if (c > cmax) {
            cmax = c;
            tmax = t;
        }
        sum += c;
        n += 1;
    }
    return { cmax, tmaxH: tmax - from, mean: sum / n };
}

/** Trapezoidal integral of one of the simulation's concentration arrays. */
export function trapz(timeH: number[], values: number[]): number {
    let s = 0;
    for (let i = 1; i < timeH.length; i++) s += 0.5 * (values[i] + values[i - 1]) * (timeH[i] - timeH[i - 1]);
    return s;
}

export function relErr(actual: number, expected: number): number {
    return Math.abs(actual - expected) / Math.abs(expected);
}
