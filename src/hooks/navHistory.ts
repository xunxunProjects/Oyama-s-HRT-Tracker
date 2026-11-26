import type { ViewKey } from './useAppNavigation';
import { pathFor } from './viewPaths';

/**
 * The app's own entries in the browser's session history, so the system Back
 * (Android's back gesture, an edge swipe in iOS Safari, a browser's Back
 * button) walks up through the pages instead of closing the app or leaving
 * the site, which is what it did while every view change only set state.
 *
 * One rule keeps the stack honest: at most one entry per open level. A tab's
 * own page is the base entry, replaced as tabs change. Opening a page from it
 * pushes one entry, moving to a sibling page replaces that entry, and leaving
 * by the in-app back arrow or by a tab goes back through history rather than
 * forward, so no entry is left behind for the next Back to replay. Those
 * above it do stay as the browser's Forward, and when a tab has taken the
 * base's place they belong to another stack; the navigation hook steps back
 * over one rather than show it.
 *
 * Settings on a phone has a level of its own between the list and a page:
 * the category drilled into, recorded in `cat` on its own entry.
 *
 * Every entry carries its page's own address (viewPaths.ts), so the address
 * bar names the page, a reload stays on it, and the entries under it are
 * still there for Back.
 */
export interface NavEntry {
    hrtNav: 1;
    view: ViewKey;
    /** How many entries above the base this one is: 0 for a tab's own page. */
    depth: number;
    cat?: string;
    /** The page this one was opened from, when that isn't its own tab (see ALSO_UNDER). */
    under?: ViewKey;
}

/** The current entry, or null when it isn't one the app wrote. */
export const readNavEntry = (): NavEntry | null => {
    const state = window.history.state;
    return state && state.hrtNav === 1 ? (state as NavEntry) : null;
};

export const navDepth = (): number => readNavEntry()?.depth ?? 0;

// The depth of the entry on screen, and of the one the latest popstate left.
// popstate says only where it landed; comparing the two tells a Forward from
// a Back. Every entry is written here, so this stays in step with history.
let shownDepth = navDepth();
let leftDepth = shownDepth;

export const pushNavEntry = (view: ViewKey, depth: number, cat?: string, under?: ViewKey) => {
    window.history.pushState({ hrtNav: 1, view, depth, cat, under } satisfies NavEntry, '', pathFor(view, cat));
    shownDepth = depth;
};

export const replaceNavEntry = (view: ViewKey, depth: number, cat?: string, under?: ViewKey) => {
    window.history.replaceState({ hrtNav: 1, view, depth, cat, under } satisfies NavEntry, '', pathFor(view, cat));
    shownDepth = depth;
};

/**
 * Changes only the address of the entry on screen, keeping what it holds: a
 * wide window's Settings or Admin switching tabs, which is no level of its own
 * for Back but should still be what a reload or a copied link opens.
 */
export const replaceNavPath = (path: string) => {
    if (window.location.pathname !== path) window.history.replaceState(window.history.state, '', path);
};

/** The depth of the entry the latest popstate moved away from. */
export const depthLeft = () => leftDepth;

// A step back lands a moment later, on popstate, and until it does the
// current entry still reads as the page being left. A second tap on a back
// arrow in that moment would step back again, and from one level down that
// leaves the app, so only one step is ever in flight. Registered here, before
// any component's listener, so it is cleared (and the depths above moved on)
// before they run. The timer only covers a step that never lands.
let traversing = false;
let traverseTimer = 0;
window.addEventListener('popstate', () => {
    traversing = false;
    window.clearTimeout(traverseTimer);
    leftDepth = shownDepth;
    shownDepth = navDepth();
});

/** Go back `steps` entries, unless a step back is already on its way. Returns whether it went. */
export const stepBack = (steps = 1): boolean => {
    if (traversing || steps < 1) return false;
    traversing = true;
    traverseTimer = window.setTimeout(() => {
        traversing = false;
    }, 1000);
    window.history.go(-steps);
    return true;
};

export const isSteppingBack = () => traversing;

/**
 * Sent on window when the tab already showing is tapped again, with the view
 * in `detail.view`. The scroller has already gone to the top by then; a page
 * with levels of its own (Settings' categories on a phone) listens for it and
 * returns to its first one.
 */
export const TAB_RESELECT = 'app:tab-reselect';
