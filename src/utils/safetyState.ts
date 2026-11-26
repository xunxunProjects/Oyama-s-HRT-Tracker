import { nsFor, type StorageLike } from './backupState';

/** Whether the new safety reminders are shown on this device. Default on. */
export const SAFETY_ENABLED_SUFFIX = 'safety-reminder-enabled';

/** Alert ids the user has already dismissed, with the dismissal timestamp. */
export const SAFETY_DISMISSED_SUFFIX = 'safety-dismissed';

/** How long a dismissal is remembered before the same alert can appear again. */
export const SAFETY_DISMISSED_TTL_H = 90 * 24;

export const loadSafetyEnabled = (storage: StorageLike, owner: string): boolean =>
    storage.getItem(nsFor(owner, SAFETY_ENABLED_SUFFIX)) !== 'false';

export const saveSafetyEnabled = (storage: StorageLike, owner: string, enabled: boolean): void => {
    storage.setItem(nsFor(owner, SAFETY_ENABLED_SUFFIX), enabled ? 'true' : 'false');
};

export const loadSafetyDismissed = (
    storage: StorageLike,
    owner: string,
    nowMs: number = Date.now(),
): Record<string, number> => {
    const raw = storage.getItem(nsFor(owner, SAFETY_DISMISSED_SUFFIX));
    if (!raw) return {};

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const ttlMs = SAFETY_DISMISSED_TTL_H * 3_600_000;
    const dismissed: Record<string, number> = {};
    for (const [id, timestamp] of Object.entries(parsed)) {
        if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) continue;
        if (nowMs - timestamp > ttlMs) continue;
        dismissed[id] = timestamp;
    }
    return dismissed;
};

export const saveSafetyDismissed = (
    storage: StorageLike,
    owner: string,
    dismissed: Record<string, number>,
): void => {
    storage.setItem(nsFor(owner, SAFETY_DISMISSED_SUFFIX), JSON.stringify(dismissed));
};

export const dismissSafetyAlert = (
    storage: StorageLike,
    owner: string,
    id: string,
    nowMs: number = Date.now(),
): Record<string, number> => {
    const dismissed = loadSafetyDismissed(storage, owner, nowMs);
    dismissed[id] = nowMs;
    saveSafetyDismissed(storage, owner, dismissed);
    return dismissed;
};
