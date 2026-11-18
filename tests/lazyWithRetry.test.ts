import { describe, expect, it, vi } from 'vitest';
import { shouldReloadForChunkFailure } from '../src/utils/lazyWithRetry';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
    const values = new Map<string, string>();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => {
            values.set(key, value);
        },
    };
};

describe('lazy chunk reload', () => {
    it('reloads once for a module whose chunk failed', () => {
        const storage = memoryStorage();
        const reload = vi.fn();
        expect(shouldReloadForChunkFailure('Plan', storage, reload)).toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(storage.getItem('hrt-chunk-reload')).toBe('Plan');
    });

    it('does not reload twice for the same module in one session', () => {
        const storage = memoryStorage();
        const reload = vi.fn();
        shouldReloadForChunkFailure('Plan', storage, reload);
        expect(shouldReloadForChunkFailure('Plan', storage, reload)).toBe(false);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('reloads for a different module', () => {
        const storage = memoryStorage();
        const reload = vi.fn();
        shouldReloadForChunkFailure('Plan', storage, reload);
        expect(shouldReloadForChunkFailure('Settings', storage, reload)).toBe(true);
        expect(reload).toHaveBeenCalledTimes(2);
    });
});
