/** The nearest box that scrolls an element: a page scrolls inside the app's
 *  main column (or the intro's own scroller), not the window. */
export const scrollParent = (el: HTMLElement | null): HTMLElement | null => {
    let node = el?.parentElement ?? null;
    while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) node = node.parentElement;
    return node;
};
