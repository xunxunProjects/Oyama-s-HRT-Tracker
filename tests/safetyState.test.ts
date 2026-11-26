import { describe, expect, it } from 'vitest';
import {
    SAFETY_DISMISSED_SUFFIX,
    SAFETY_DISMISSED_TTL_H,
    SAFETY_ENABLED_SUFFIX,
    dismissSafetyAlert,
    loadSafetyDismissed,
    loadSafetyEnabled,
    saveSafetyDismissed,
    saveSafetyEnabled,
} from '../src/utils/safetyState';
import { nsFor } from '../src/utils/backupState';

class MemoryStorage {
    private map = new Map<string, string>();
    getItem(key: string) {
        return this.map.get(key) ?? null;
    }
    setItem(key: string, value: string) {
        this.map.set(key, value);
    }
    removeItem(key: string) {
        this.map.delete(key);
    }
}

const NOW_MS = 1_700_000_000_000;

describe('safetyState', () => {
    it('defaults to enabled when nothing is stored', () => {
        expect(loadSafetyEnabled(new MemoryStorage(), 'local')).toBe(true);
    });

    it('persists a disabled preference and can re-enable', () => {
        const storage = new MemoryStorage();
        saveSafetyEnabled(storage, 'local', false);
        expect(loadSafetyEnabled(storage, 'local')).toBe(false);
        saveSafetyEnabled(storage, 'local', true);
        expect(loadSafetyEnabled(storage, 'local')).toBe(true);
    });

    it('returns an empty map for missing, malformed, arrays, or non-numeric values', () => {
        const storage = new MemoryStorage();
        expect(loadSafetyDismissed(storage, 'local', NOW_MS)).toEqual({});

        for (const value of ['{', '[]', '{"x":"bad"}', 'null']) {
            storage.setItem(nsFor('local', SAFETY_DISMISSED_SUFFIX), value);
            expect(loadSafetyDismissed(storage, 'local', NOW_MS)).toEqual({});
        }
    });

    it('prunes dismissed entries older than the TTL', () => {
        const storage = new MemoryStorage();
        saveSafetyDismissed(storage, 'local', {
            a: NOW_MS - (SAFETY_DISMISSED_TTL_H + 1) * 3_600_000,
            b: NOW_MS - 3_600_000,
        });

        expect(loadSafetyDismissed(storage, 'local', NOW_MS)).toEqual({ b: NOW_MS - 3_600_000 });
    });

    it('records a dismissal with the current timestamp and persists it', () => {
        const storage = new MemoryStorage();
        const result = dismissSafetyAlert(storage, 'local', 'e2_extreme:2026-11-26', NOW_MS);

        expect(result).toEqual({ 'e2_extreme:2026-11-26': NOW_MS });
        expect(loadSafetyDismissed(storage, 'local', NOW_MS)).toEqual(result);
    });

    it('keeps owners isolated by namespaced keys', () => {
        const storage = new MemoryStorage();
        saveSafetyEnabled(storage, 'u1', false);
        dismissSafetyAlert(storage, 'u1', 'e2_extreme:2026-11-26', NOW_MS);

        expect(loadSafetyEnabled(storage, 'local')).toBe(true);
        expect(loadSafetyDismissed(storage, 'local', NOW_MS)).toEqual({});
        expect(storage.getItem(nsFor('u1', SAFETY_ENABLED_SUFFIX))).toBe('false');
        expect(storage.getItem(nsFor('local', SAFETY_ENABLED_SUFFIX))).toBeNull();
    });
});
