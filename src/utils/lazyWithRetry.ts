import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_FLAG = 'hrt-chunk-reload';

/**
 * A deploy removes the old hashed chunks. If a page's import fails, reload
 * once for that page; the new build serves the current chunk. A second
 * failure means a reload will not help, so let the ErrorBoundary show it.
 */
export function shouldReloadForChunkFailure(
    moduleId: string,
    storage: Pick<Storage, 'getItem' | 'setItem'>,
    reload: () => void,
): boolean {
    if (storage.getItem(RELOAD_FLAG) === moduleId) return false;
    storage.setItem(RELOAD_FLAG, moduleId);
    reload();
    return true;
}

export function lazyWithRetry<P>(
    importer: () => Promise<{ default: ComponentType<P> }>,
    moduleId: string,
): LazyExoticComponent<ComponentType<P>> {
    return lazy(() =>
        importer().catch(error => {
            try {
                if (shouldReloadForChunkFailure(moduleId, sessionStorage, () => window.location.reload())) {
                    return new Promise<never>(() => {});
                }
            } catch {
                // Private mode can make storage throw. Fall through to the ErrorBoundary.
            }
            throw error;
        }),
    );
}
