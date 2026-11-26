import {
    DEFAULT_HYDRATION_STATE,
    type HydrationState,
    type UrineColorLevel,
    type WaterIntake,
} from '../domain/features/hydration';
import { nsFor, type StorageLike } from './backupState';

/** Local-only: hydration logs are not part of the backup payload in this beta. */
export const HYDRATION_SUFFIX = 'hydration';

const MAX_CUPS_PER_EVENT = 20;

const defaultState = (): HydrationState => ({ ...DEFAULT_HYDRATION_STATE, water: [] });

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const sanitizeWater = (raw: unknown): WaterIntake[] => {
    if (!Array.isArray(raw)) return [];
    const water: WaterIntake[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const r = item as Record<string, unknown>;
        if (typeof r.id !== 'string' || !r.id) continue;
        if (!finite(r.timeH) || !finite(r.cups) || r.cups <= 0) continue;
        water.push({
            id: r.id,
            timeH: r.timeH,
            cups: Math.min(r.cups, MAX_CUPS_PER_EVENT),
            ...(finite(r.updatedAt) && r.updatedAt > 0 ? { updatedAt: r.updatedAt } : {}),
        });
    }
    return water;
};

export const sanitizeHydrationState = (raw: unknown): HydrationState => {
    if (!raw || typeof raw !== 'object') return defaultState();
    const r = raw as Record<string, unknown>;

    const urineColor =
        finite(r.urineColor) && Number.isInteger(r.urineColor) && r.urineColor >= 1 && r.urineColor <= 8
            ? (r.urineColor as UrineColorLevel)
            : null;
    const bodyFatPercent = finite(r.bodyFatPercent) && r.bodyFatPercent >= 3 && r.bodyFatPercent <= 70
        ? r.bodyFatPercent
        : null;
    const alpha = finite(r.alpha) && r.alpha >= 0 && r.alpha <= 1 ? r.alpha : DEFAULT_HYDRATION_STATE.alpha;

    return { water: sanitizeWater(r.water), urineColor, bodyFatPercent, alpha };
};

export const loadHydrationState = (storage: StorageLike, owner: string): HydrationState => {
    const raw = storage.getItem(nsFor(owner, HYDRATION_SUFFIX));
    if (raw === null) return defaultState();
    try {
        return sanitizeHydrationState(JSON.parse(raw));
    } catch {
        return defaultState();
    }
};

export const saveHydrationState = (storage: StorageLike, owner: string, state: HydrationState): void => {
    storage.setItem(nsFor(owner, HYDRATION_SUFFIX), JSON.stringify(sanitizeHydrationState(state)));
};
