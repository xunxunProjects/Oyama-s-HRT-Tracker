import { describe, expect, it } from 'vitest';
import { clearAccountHealthData, modeKeyFor, nsFor, type StorageLike } from '../src/utils/backupState';

class MemoryStorage implements StorageLike {
    private readonly values = new Map<string, string>();

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }

    has(key: string): boolean {
        return this.values.has(key);
    }
}

describe('account health-data cleanup', () => {
    it('removes both modes and shared data for one account without touching anyone else', () => {
        const storage = new MemoryStorage();
        const owned = [
            modeKeyFor('user-1', 'transfem', 'events'),
            modeKeyFor('user-1', 'transmasc', 'events'),
            nsFor('user-1', 'weight'),
            nsFor('user-1', 'birth-year'),
        ];
        const preserved = [nsFor('local', 'events'), nsFor('user-2', 'events'), 'auth_token'];
        for (const key of [...owned, ...preserved]) storage.setItem(key, 'value');

        clearAccountHealthData(storage, 'user-1');

        expect(owned.every(key => !storage.has(key))).toBe(true);
        expect(preserved.every(key => storage.has(key))).toBe(true);
    });

    it('never removes the signed-out namespace', () => {
        const storage = new MemoryStorage();
        storage.setItem(nsFor('local', 'events'), 'value');

        clearAccountHealthData(storage, 'local');

        expect(storage.has(nsFor('local', 'events'))).toBe(true);
    });
});
