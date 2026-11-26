/**
 * Observation-layer plasma-volume model for the opt-in hydration beta.
 *
 * This module never touches clearance, dose, volume of distribution or AUC.
 * It only estimates how a logged water intake and a urine-color reference
 * might dilute or concentrate the displayed concentration. Every parameter
 * here is a heuristic, not a clinically calibrated constant.
 */

export const CUP_ML = 500;
const CUP_L = 0.5;
const RATIO_MIN = 0.7;
const RATIO_MAX = 1.5;

export type UrineColorLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface WaterIntake {
    id: string;
    timeH: number;
    cups: number;
    updatedAt?: number;
}

export interface HydrationParams {
    kAbs: number;
    kRenal: number;
    alpha: number;
}

export const DEFAULT_HYDRATION_PARAMS: HydrationParams = {
    kAbs: 1.5,
    kRenal: 0.7,
    alpha: 0.5,
};

export interface HydrationState {
    water: WaterIntake[];
    urineColor: UrineColorLevel | null;
    bodyFatPercent: number | null;
    alpha: number;
}

export const DEFAULT_HYDRATION_STATE: HydrationState = {
    water: [],
    urineColor: null,
    bodyFatPercent: null,
    alpha: DEFAULT_HYDRATION_PARAMS.alpha,
};

const URINE_OFFSETS: Record<UrineColorLevel, number> = {
    1: 0.02,
    2: 0.01,
    3: 0,
    4: -0.01,
    5: -0.02,
    6: -0.04,
    7: -0.06,
    8: -0.08,
};

const clamp = (value: number, low: number, high: number): number =>
    Math.min(high, Math.max(low, value));

export function estimateTbwL(weightKG: number, bodyFatPercent?: number | null): number {
    if (!Number.isFinite(weightKG) || weightKG <= 0) return 0;
    if (bodyFatPercent == null || !Number.isFinite(bodyFatPercent)) return 0.6 * weightKG;

    const leanFraction = clamp(1 - bodyFatPercent / 100, 0.1, 1);
    return weightKG * leanFraction * 0.73;
}

export function estimatePlasmaVolumeL(tbwL: number): number {
    if (!Number.isFinite(tbwL) || tbwL <= 0) return 0;
    return 0.075 * tbwL;
}

export function urineColorOffset(level: UrineColorLevel | null): number {
    return level == null ? 0 : URINE_OFFSETS[level] ?? 0;
}

export function plasmaVolumeRatio(
    timeH: number[],
    state: HydrationState,
    weightKG: number,
    params: Partial<HydrationParams> = {},
): number[] {
    const kAbs = Number.isFinite(params.kAbs) && (params.kAbs ?? 0) > 0
        ? (params.kAbs as number)
        : DEFAULT_HYDRATION_PARAMS.kAbs;
    const kRenal = Number.isFinite(params.kRenal) && (params.kRenal ?? 0) > 0
        ? (params.kRenal as number)
        : DEFAULT_HYDRATION_PARAMS.kRenal;

    const pv0 = estimatePlasmaVolumeL(estimateTbwL(weightKG, state.bodyFatPercent));
    if (pv0 <= 0) return timeH.map(() => 1);

    const pvEff0 = pv0 * (1 + urineColorOffset(state.urineColor));

    const events = (state.water ?? [])
        .filter(
            (event) =>
                Number.isFinite(event.timeH) &&
                Number.isFinite(event.cups) &&
                event.cups > 0,
        )
        .map((event) => ({ timeH: event.timeH, cups: event.cups }))
        .sort((a, b) => a.timeH - b.timeH);

    let eventIndex = 0;
    const result: number[] = [];
    let gutL = 0;
    let extraL = 0;

    for (let i = 0; i < timeH.length; i++) {
        const now = timeH[i];
        const previous = i === 0 ? now : timeH[i - 1];

        if (i > 0 && Number.isFinite(now) && Number.isFinite(previous) && now > previous) {
            // Water logged during (previous, now] is absorbed over that step.
            const addedCups = events
                .slice(eventIndex)
                .filter((event) => event.timeH > previous && event.timeH <= now);
            while (
                eventIndex < events.length &&
                events[eventIndex].timeH <= now
            ) {
                eventIndex++;
            }
            for (const event of addedCups) gutL += event.cups * CUP_L;

            const dt = now - previous;
            const expAbs = Math.exp(-kAbs * dt);
            const expRenal = Math.exp(-kRenal * dt);
            const nextExtra =
                Math.abs(kAbs - kRenal) < 1e-12
                    ? extraL * expRenal + kAbs * gutL * dt * expRenal
                    : extraL * expRenal +
                      ((kAbs * gutL) / (kRenal - kAbs)) * (expAbs - expRenal);
            gutL *= expAbs;
            extraL = nextExtra;
        }

        result.push(clamp((pvEff0 + extraL) / pv0, RATIO_MIN, RATIO_MAX));
    }

    return result;
}

export function applyPlasmaVolume(
    values: number[],
    pvRatio: number[],
    alpha: number,
): number[] {
    if (values.length !== pvRatio.length) return [];

    const a = Number.isFinite(alpha) ? clamp(alpha, 0, 1) : DEFAULT_HYDRATION_PARAMS.alpha;
    return values.map((value, i) => {
        if (!Number.isFinite(value)) return 0;
        // `plasmaVolumeRatio` already clamps to the physiological range; do
        // not silently rewrite a ratio supplied by the caller here.
        const ratio = Number.isFinite(pvRatio[i]) ? pvRatio[i] : 1;
        const adjusted = value * Math.pow(1 / ratio, a);
        return Number.isFinite(adjusted) ? adjusted : 0;
    });
}

export function hydrationDelta(values: number[], adjusted: number[]): number[] {
    if (values.length === 0 || values.length !== adjusted.length) return [];
    return values.map((value, i) => {
        if (!Number.isFinite(value) || !Number.isFinite(adjusted[i])) return 0;
        return adjusted[i] - value;
    });
}
