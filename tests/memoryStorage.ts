import type { StorageLike } from '../src/utils/backupState';

/** localStorage for the backup tests: a plain map, sorted when snapshotted. */
export class MemoryStorage implements StorageLike {
    readonly map = new Map<string, string>();
    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }
    removeItem(key: string): void {
        this.map.delete(key);
    }
    snapshot(): string {
        return JSON.stringify([...this.map.entries()].sort(([a], [b]) => a.localeCompare(b)));
    }
}
