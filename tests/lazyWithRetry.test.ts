import { describe, expect, it, vi } from 'vitest';
import { lazyWithRetry, loadLazyModule, shouldReloadForChunkFailure } from '../src/utils/lazyWithRetry';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
    const values = new Map<string, string>();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => {
            values.set(key, value);
        },
    };
};

const chunkError = new Error('Failed to fetch dynamically imported module');
const rejectImport = () => Promise.reject(chunkError);

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

    it('reloads once and leaves the first failed import pending', async () => {
        const storage = memoryStorage();
        const reload = vi.fn();
        const result = loadLazyModule(rejectImport, 'Plan', { storage, reload });

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(reload).toHaveBeenCalledTimes(1);
        expect(storage.getItem('hrt-chunk-reload')).toBe('Plan');
        await expect(Promise.race([result, Promise.resolve('pending')])).resolves.toBe('pending');
    });

    it('rejects with the original error after a reload was already attempted', async () => {
        const storage = memoryStorage();
        storage.setItem('hrt-chunk-reload', 'Plan');
        const reload = vi.fn();

        await expect(loadLazyModule(rejectImport, 'Plan', { storage, reload })).rejects.toBe(chunkError);
        expect(reload).not.toHaveBeenCalled();
    });

    it('rejects with the original error when storage is blocked', async () => {
        const storage = {
            getItem: () => {
                throw new Error('storage blocked');
            },
            setItem: () => {
                throw new Error('storage blocked');
            },
        };
        const reload = vi.fn();

        await expect(loadLazyModule(rejectImport, 'Plan', { storage, reload })).rejects.toBe(chunkError);
        expect(reload).not.toHaveBeenCalled();
    });

    it('wraps the loader in a React.lazy component', () => {
        const Lazy = lazyWithRetry(() => Promise.resolve({ default: () => null }), 'Plan');
        expect((Lazy as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for('react.lazy'));
    });
});
