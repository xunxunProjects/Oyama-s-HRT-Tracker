import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_FLAG = 'hrt-chunk-reload';

type ReloadStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface LoadLazyModuleOptions {
    storage: ReloadStorage;
    reload: () => void;
}

/**
 * A deploy removes the old hashed chunks. If a page's import fails, reload
 * once for that module in this tab; the new build serves the current chunk.
 * A second failure in the same tab means a reload will not help, so let the
 * ErrorBoundary show it. The flag intentionally lasts for the tab session: a
 * later deploy needs a manual refresh rather than another automatic reload.
 */
export function shouldReloadForChunkFailure(moduleId: string, storage: ReloadStorage, reload: () => void): boolean {
    if (storage.getItem(RELOAD_FLAG) === moduleId) return false;
    storage.setItem(RELOAD_FLAG, moduleId);
    reload();
    return true;
}

export function loadLazyModule<P>(
    importer: () => Promise<{ default: ComponentType<P> }>,
    moduleId: string,
    { storage, reload }: LoadLazyModuleOptions,
): Promise<{ default: ComponentType<P> }> {
    return importer().catch(error => {
        try {
            if (shouldReloadForChunkFailure(moduleId, storage, reload)) {
                return new Promise<never>(() => {});
            }
        } catch {
            // Private mode can make storage throw. Fall through to the ErrorBoundary.
        }
        throw error;
    });
}

export function lazyWithRetry<P>(
    importer: () => Promise<{ default: ComponentType<P> }>,
    moduleId: string,
): LazyExoticComponent<ComponentType<P>> {
    return lazy(() =>
        loadLazyModule(importer, moduleId, {
            storage: sessionStorage,
            reload: () => window.location.reload(),
        }),
    );
}
