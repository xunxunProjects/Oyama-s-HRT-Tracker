import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { haptic, hapticsEnabled, setHapticsEnabled } from '../src/utils/haptics';

// No DOM here, so stand in just enough of one: a page in touch or mouse mode,
// a phone that can or can't vibrate.
let store: Record<string, string>;
let input: string;
let clicks: number;

function stubDevice(ua: string, withVibrate: boolean) {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints: 5, ...(withVibrate ? { vibrate } : {}) });
    return vibrate;
}

beforeEach(() => {
    store = {};
    input = 'touch';
    clicks = 0;
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => void (store[k] = v),
        removeItem: (k: string) => void delete store[k],
    });
    vi.stubGlobal('window', {
        matchMedia: () => ({ matches: true }),
        setTimeout: (fn: () => void) => fn(),
    });
    const el = () => ({
        style: {},
        setAttribute() {},
        appendChild() {},
        isConnected: true,
        click: () => void clicks++,
    });
    vi.stubGlobal('document', {
        documentElement: { getAttribute: () => input },
        createElement: el,
        body: { appendChild() {} },
    });
});

afterEach(() => vi.unstubAllGlobals());

describe('haptic', () => {
    it('vibrates on Android', () => {
        const vibrate = stubDevice('Mozilla/5.0 (Linux; Android 15)', true);
        haptic('success');
        expect(vibrate).toHaveBeenCalledWith(12);
    });

    it('clicks the hidden switch on iPhone, twice for an error', () => {
        stubDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', false);
        haptic('tap');
        expect(clicks).toBe(1);
        haptic('error');
        expect(clicks).toBe(3);
    });

    it('stays quiet with a mouse or when switched off', () => {
        const vibrate = stubDevice('Mozilla/5.0 (Linux; Android 15)', true);
        input = 'mouse';
        haptic();
        input = 'touch';
        setHapticsEnabled(false);
        expect(hapticsEnabled()).toBe(false);
        haptic();
        expect(vibrate).not.toHaveBeenCalled();
        setHapticsEnabled(true);
        haptic();
        expect(vibrate).toHaveBeenCalledTimes(1);
    });
});
