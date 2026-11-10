import { afterEach, describe, expect, it } from 'vitest';
import { isTauriShell } from '../src/utils/tauri';

const setWindow = (value: unknown) => {
    Object.defineProperty(globalThis, 'window', { value, configurable: true, writable: true });
};

afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
});

describe('isTauriShell', () => {
    it('detects the Tauri v1 global API', () => {
        setWindow({ __TAURI__: {} });
        expect(isTauriShell()).toBe(true);
    });

    it('detects the Tauri v2 internals marker', () => {
        setWindow({ __TAURI_INTERNALS__: {} });
        expect(isTauriShell()).toBe(true);
    });

    it('is false in a normal browser', () => {
        setWindow({});
        expect(isTauriShell()).toBe(false);
    });

    it('is false when there is no window', () => {
        expect(isTauriShell()).toBe(false);
    });
});
