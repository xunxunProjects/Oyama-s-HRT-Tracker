import { describe, expect, it } from 'vitest';
import { DEFAULT_HYDRATION_STATE, type HydrationState } from '../src/domain/features/hydration';
import { nsFor } from '../src/utils/backupState';
import {
    HYDRATION_SUFFIX,
    loadHydrationState,
    sanitizeHydrationState,
    saveHydrationState,
} from '../src/utils/hydrationState';
import { MemoryStorage } from './memoryStorage';

const makeState = (raw: Record<string, unknown>): HydrationState => ({
    ...DEFAULT_HYDRATION_STATE,
    ...raw,
});

describe('hydrationState', () => {
    it('returns the default state when storage is empty', () => {
        expect(loadHydrationState(new MemoryStorage(), 'local')).toEqual(DEFAULT_HYDRATION_STATE);
    });

    it('returns the default state when stored JSON is malformed', () => {
        const storage = new MemoryStorage();
        storage.setItem(nsFor('local', HYDRATION_SUFFIX), '{not json');
        expect(loadHydrationState(storage, 'local')).toEqual(DEFAULT_HYDRATION_STATE);
    });

    it('keeps valid water events and drops invalid cups or times', () => {
        const sanitized = sanitizeHydrationState(
            makeState({
                water: [
                    { id: 'keep', timeH: 10, cups: 2 },
                    { id: 'bad-cups', timeH: 11, cups: -1 },
                    { id: 'nan-cups', timeH: 12, cups: NaN },
                    { id: 'bad-time', timeH: Infinity, cups: 1 },
                ],
            }),
        );
        expect(sanitized.water).toEqual([{ id: 'keep', timeH: 10, cups: 2 }]);
    });

    it('clamps very large cup counts', () => {
        const sanitized = sanitizeHydrationState(
            makeState({ water: [{ id: 'lots', timeH: 10, cups: 999 }] }),
        );
        expect(sanitized.water[0].cups).toBe(20);
    });

    it('normalizes out-of-range urine color, body fat, and alpha', () => {
        const sanitized = sanitizeHydrationState(
            makeState({ urineColor: 9, bodyFatPercent: 90, alpha: 2 }),
        );
        expect(sanitized.urineColor).toBeNull();
        expect(sanitized.bodyFatPercent).toBeNull();
        expect(sanitized.alpha).toBe(0.5);
    });

    it('keeps valid boundary values', () => {
        const sanitized = sanitizeHydrationState(
            makeState({ urineColor: 8, bodyFatPercent: 3, alpha: 0 }),
        );
        expect(sanitized).toMatchObject({ urineColor: 8, bodyFatPercent: 3, alpha: 0 });
    });

    it('round-trips through storage under the owner namespace', () => {
        const storage = new MemoryStorage();
        const state = makeState({
            water: [{ id: 'a', timeH: 10, cups: 2 }],
            urineColor: 4,
            bodyFatPercent: 25,
            alpha: 0.75,
        });
        saveHydrationState(storage, 'u1', state);

        expect(storage.getItem(nsFor('u1', HYDRATION_SUFFIX))).not.toBeNull();
        expect(storage.getItem(nsFor('local', HYDRATION_SUFFIX))).toBeNull();
        expect(loadHydrationState(storage, 'u1')).toEqual(state);
        expect(loadHydrationState(storage, 'local')).toEqual(DEFAULT_HYDRATION_STATE);
    });

    it('does not mutate the state passed to saveHydrationState', () => {
        const state = makeState({ water: [{ id: 'a', timeH: 10, cups: 999 }] });
        const before = JSON.parse(JSON.stringify(state));
        saveHydrationState(new MemoryStorage(), 'local', state);
        expect(state).toEqual(before);
    });
});
