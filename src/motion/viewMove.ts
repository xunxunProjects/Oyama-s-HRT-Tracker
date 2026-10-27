import { flushSync } from 'react-dom';

/**
 * How one view gives way to the next (motion.css, "pages"): `push` into a
 * page from the one above it and `pop` back up animate. `fade` (across, to a
 * sibling page or another tab's page) and `none` (a tab chosen from a menu)
 * just show the new page: nothing was entered or left, and a cross-fade
 * between two pages reads as a flash.
 */
export type ViewMove = 'push' | 'pop' | 'fade' | 'none';

type ViewTransitionDocument = Document & {
    startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/** Whether the browser animates moves itself. Elsewhere the arriving page
 *  plays its half of the move on its own (.view-in-* in motion.css). */
export const supportsViewTransitions =
    typeof document !== 'undefined' && typeof (document as ViewTransitionDocument).startViewTransition === 'function';

/**
 * Applies a change of view as a move. The page area is captured on its own
 * (`.main-view`), so the sidebar and the bottom bar stay out of it. With
 * reduced motion, or without view transitions, the change just happens.
 */
export function runViewMove(move: ViewMove, apply: () => void): void {
    const doc = document as ViewTransitionDocument;
    if (
        (move !== 'push' && move !== 'pop') ||
        !doc.startViewTransition ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        apply();
        return;
    }
    const root = document.documentElement;
    root.dataset.move = move;
    const transition = doc.startViewTransition(() => flushSync(apply));
    transition.finished.finally(() => {
        if (root.dataset.move === move) delete root.dataset.move;
    });
}
