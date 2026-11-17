// A light tap from the phone at a few moments that matter: a dose or lab
// result saved, a switch flipped, a prompt gone through, a wrong password.
// Nothing else buzzes, so a tap still means something.
//
// Android browsers have navigator.vibrate. Safari on iPhone ignores it, but
// from iOS 18 a checkbox drawn as a switch (<input type="checkbox" switch>)
// gives the system's own tick when it flips, the same one Settings gives. So
// on iPhone a hidden one is kept in the page and its label is clicked. Safari
// only does this while the press that led here is still fresh, so a tap after
// a slow network answer may stay quiet; that's fine, it's a nicety.
//
// Only a touch screen gets any of this (a laptop has nothing to buzz), and
// never when it's switched off in Settings. The choice stays on this device.
// Reduced motion doesn't silence it: iOS keeps its own system haptics on with
// that setting, and the switch here is the way to turn these off.

export type HapticKind = 'tap' | 'success' | 'error';

const STORAGE_KEY = 'hrt-haptics';

export function hapticsEnabled(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
        return true;
    }
}

export function setHapticsEnabled(on: boolean): void {
    try {
        if (on) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, 'off');
    } catch {
        /* private mode: the switch just won't stick */
    }
}

/** Whether this device can give a tap at all, so the switch is only offered
 *  where it does something. */
export function hapticsSupported(): boolean {
    if (typeof window === 'undefined') return false;
    if (!window.matchMedia?.('(pointer: coarse)').matches) return false;
    return typeof navigator.vibrate === 'function' || isIOS();
}

function isIOS(): boolean {
    const ua = navigator.userAgent;
    // iPadOS asks for the desktop site and says Macintosh; touch points give it away.
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

let iosLabel: HTMLLabelElement | null = null;

function iosTick(): void {
    if (!iosLabel || !iosLabel.isConnected) {
        const label = document.createElement('label');
        // Kept on screen and drawn (iOS may skip the tick for a switch that
        // isn't), just one clipped, nearly clear pixel in the corner. Inert, so
        // the label's click doesn't pull focus off whatever was pressed.
        label.inert = true;
        label.setAttribute('aria-hidden', 'true');
        label.style.cssText =
            'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        input.tabIndex = -1;
        label.appendChild(input);
        document.body.appendChild(label);
        iosLabel = label;
    }
    iosLabel.click();
}

const PATTERNS: Record<HapticKind, number | number[]> = {
    tap: 8,
    success: 12,
    error: [10, 70, 10],
};

export function haptic(kind: HapticKind = 'tap'): void {
    if (typeof window === 'undefined' || !hapticsEnabled()) return;
    if (document.documentElement.getAttribute('data-input') !== 'touch') return;
    try {
        if (typeof navigator.vibrate === 'function' && !isIOS()) {
            navigator.vibrate(PATTERNS[kind]);
            return;
        }
        if (!isIOS()) return;
        iosTick();
        // Two light ticks say "that didn't work", the way iOS does it.
        if (kind === 'error') window.setTimeout(iosTick, 90);
    } catch {
        /* a tap is never worth an error */
    }
}
