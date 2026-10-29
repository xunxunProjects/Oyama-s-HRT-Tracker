import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Where the chosen button sits in its row, for a mark that slides to it: the
 * Tabs underline and the Segmented thumb. Put `rowRef` on the row and each
 * button in `itemRefs` under its id. Measured on layout, and again whenever
 * the row resizes. `items` is the list the row was drawn from, so a new list
 * measures again too.
 */
export function useSlidingMark<K extends string>(value: K, items: readonly unknown[]) {
    const rowRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});
    const [mark, setMark] = useState<{ left: number; width: number } | null>(null);

    useLayoutEffect(() => {
        const measure = () => {
            const el = itemRefs.current[value];
            if (!el) return;
            const next = { left: el.offsetLeft, width: el.offsetWidth };
            setMark(prev => (prev && prev.left === next.left && prev.width === next.width ? prev : next));
        };
        measure();
        const row = rowRef.current;
        if (!row || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(row);
        return () => ro.disconnect();
    }, [value, items]);

    return { rowRef, itemRefs, mark };
}
