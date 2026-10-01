import React, { useLayoutEffect, useRef, useState } from 'react';

export interface SegmentedOption<K extends string> {
    id: K;
    label: React.ReactNode;
}

/**
 * A compact choice of two to four short options that switches a view or a
 * unit in place: unit pickers, the chart's range, how far ahead to warn.
 * Options sit on a muted pill track and one raised thumb slides to the chosen
 * one (.chip-slide, the same motion as the tab underline), stretching as it
 * crosses options of different widths.
 *
 * The thumb isn't the only signal: the chosen label is also full-strength and
 * semibold, and every label reserves its semibold width so choosing never
 * nudges its neighbours. Longer lists belong in a Select; whole-panel
 * switches in Tabs.
 */
function Segmented<K extends string>({ options, value, onChange, className = '', ...aria }: {
    options: readonly SegmentedOption<K>[];
    value: K;
    onChange: (id: K) => void;
    className?: string;
    'aria-label'?: string;
}) {
    const rowRef = useRef<HTMLDivElement>(null);
    const optionRefs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});
    const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

    useLayoutEffect(() => {
        const measure = () => {
            const el = optionRefs.current[value];
            if (!el) return;
            const next = { left: el.offsetLeft, width: el.offsetWidth };
            setThumb(prev => (prev && prev.left === next.left && prev.width === next.width ? prev : next));
        };
        measure();
        const row = rowRef.current;
        if (!row || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(row);
        return () => ro.disconnect();
    }, [value, options]);

    return (
        <div
            ref={rowRef}
            role="tablist"
            aria-label={aria['aria-label']}
            className={`relative inline-flex shrink-0 gap-0.5 rounded-full bg-[var(--surface-muted)] p-[3px] ${className}`}
        >
            {thumb && (
                <span
                    aria-hidden="true"
                    className="chip-slide pointer-events-none absolute top-[3px] bottom-[3px] rounded-full bg-[var(--control-thumb)] shadow-[var(--shadow-xs)]"
                    style={{ left: thumb.left, width: thumb.width }}
                />
            )}
            {options.map(({ id, label }) => {
                const selected = id === value;
                return (
                    <button
                        key={id}
                        ref={el => { optionRefs.current[id] = el; }}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => onChange(id)}
                        className={`relative z-[1] grid h-[26px] items-center rounded-full px-3 text-[0.8125rem] leading-[1.125rem] whitespace-nowrap ${selected ? 'text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                    >
                        <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-semibold">{label}</span>
                        <span className={`col-start-1 row-start-1 ${selected ? 'font-semibold' : 'font-medium'}`}>{label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export default Segmented;
