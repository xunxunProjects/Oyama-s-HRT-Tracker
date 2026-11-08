// A laptop with a touch screen (the touch MacBook Pro, Windows two-in-ones)
// reports a trackpad as its main pointer, so `(hover: hover)` matches and every
// hover style is on. A finger then "hovers" whatever it last tapped and the
// fill stays there, and the sidebar that opens while pointed at stays open
// over the page. CSS can't tell which of the two is in use right now, so this
// writes it on <html> as data-input="touch" or "mouse", from the last pointer
// event: index.css keeps hover styles to "mouse", and the sidebar takes a tap
// path in "touch" (Sidebar.tsx).

export type InputMode = 'touch' | 'mouse';

const ATTR = 'data-input';

export function currentInputMode(): InputMode {
    if (typeof document === 'undefined') return 'mouse';
    return document.documentElement.getAttribute(ATTR) === 'touch' ? 'touch' : 'mouse';
}

export function watchInputMode(): void {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const set = (mode: InputMode) => {
        if (root.getAttribute(ATTR) !== mode) root.setAttribute(ATTR, mode);
    };

    // Before any pointer has moved, go by the main pointer: a phone or tablet
    // starts in touch, a laptop in mouse.
    set(window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'mouse');

    // Capture phase, so the mode is set before a component's own handler for
    // the same press reads it. A pen counts as touch: it taps, it doesn't rest.
    const fromEvent = (e: PointerEvent) => set(e.pointerType === 'mouse' ? 'mouse' : 'touch');
    window.addEventListener('pointerdown', fromEvent, { capture: true, passive: true });
    // Only a mouse moves without pressing. A finger's moves come with a press,
    // and pointerdown has already said touch.
    window.addEventListener(
        'pointermove',
        e => {
            if (e.pointerType === 'mouse') set('mouse');
        },
        { capture: true, passive: true },
    );
}
