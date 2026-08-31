import { useLayoutEffect, useState } from 'react';

/**
 * Track the rendered pixel size of an element.
 *
 * Takes the node itself (via a state-backed callback ref) rather than a ref
 * object, so measurement re-runs when the element actually mounts — e.g. after
 * the simulation finishes loading and the plot replaces the empty state.
 * Measures on layout and on resize; ResizeObserver is a bonus (some embedded
 * browsers never fire it).
 *
 * Shared by the two components that lay themselves out in measured pixels
 * rather than in rem: the concentration chart and the dose heatmap.
 */
export const useElementSize = (el: HTMLElement | null) => {
    const [size, setSize] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
        if (!el) return;
        const measure = () => {
            const r = el.getBoundingClientRect();
            setSize(prev => (prev.width === r.width && prev.height === r.height ? prev : { width: r.width, height: r.height }));
        };
        measure();
        window.addEventListener('resize', measure);
        let ro: ResizeObserver | undefined;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(measure);
            ro.observe(el);
        }
        return () => {
            window.removeEventListener('resize', measure);
            ro?.disconnect();
        };
    }, [el]);
    return size;
};
