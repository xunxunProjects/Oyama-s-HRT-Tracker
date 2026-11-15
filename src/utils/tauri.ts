/**
 * Tauri v1 exposes `__TAURI__` when `withGlobalTauri` is on; v2 injects
 * `__TAURI_INTERNALS__` regardless. Checking both keeps the desktop-specific
 * microphone copy reachable in the shell the app actually ships.
 */
export const isTauriShell = (): boolean =>
    typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
