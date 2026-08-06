// Pinch-to-zoom is a browser affordance for pages that don't fit the screen.
// This one does, so on an installed PWA the gesture only ever scales the app
// out of its own window — and the way back is another pinch the user has to
// think about. index.html asks for that with `user-scalable=no` and index.css
// with `touch-action`, which is all Blink and Gecko need on touchscreens.
// Safari honours neither for page zoom: it only stops when the non-standard,
// WebKit-only gesture events are cancelled, which is what this file is for.

/**
 * Stop a two-finger pinch from zooming the page.
 *
 * Components with their own pinch handling keep working. `preventDefault`
 * cancels the browser's zoom; it does not stop the event reaching listeners a
 * component registered on its own subtree, and those run before this one does.
 */
export function preventPinchZoom(): void {
    if (typeof window === 'undefined') return;

    const cancel = (e: Event) => e.preventDefault();

    // WebKit only, and not in the DOM lib's event map — hence the plain
    // strings. Cancelling `gesturestart` is enough to stop a pinch from ever
    // starting; the other two cover a gesture already in flight when this runs
    // (a hard refresh mid-pinch), which would otherwise keep scaling.
    document.addEventListener('gesturestart', cancel, { passive: false });
    document.addEventListener('gesturechange', cancel, { passive: false });
    document.addEventListener('gestureend', cancel, { passive: false });

    // Desktop trackpad pinch reaches Blink and Gecko as a ctrl-modified wheel
    // event rather than a gesture — same physical pinch, so same treatment.
    // Keyboard zoom (⌘/Ctrl with +/-) isn't cancellable and stays available,
    // which is what keeps this from taking zoom away outright.
    window.addEventListener('wheel', (e) => {
        if (e.ctrlKey) e.preventDefault();
    }, { passive: false });
}
