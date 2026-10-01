import React, { useLayoutEffect, useRef, useState } from 'react';

export interface TabItem<K extends string> {
    id: K;
    label: React.ReactNode;
    icon?: React.ReactNode;
}

const on = 'text-[var(--text)]';
const muted = 'text-[var(--text-muted)]';

/**
 * The one underline tab strip. The underline is a single bar that slides to
 * the chosen tab and stretches to its width (.chip-slide, the same motion as
 * the chart's range chips), rather than a border on each tab that blinks off
 * one and on the next.
 *
 * Every label reserves its bold width up front, so choosing a tab (which sets
 * it semibold) never nudges the tabs beside it.
 *
 * This is for switching whole panels of a page. A compact choice of a few
 * short options inside a form or toolbar is a Segmented control.
 */
function Tabs<K extends string>({ tabs, value, onChange, className = '' }: {
    tabs: readonly TabItem<K>[];
    value: K;
    onChange: (id: K) => void;
    className?: string;
}) {
    const rowRef = useRef<HTMLDivElement>(null);
    const tabRefs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});
    const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

    useLayoutEffect(() => {
        const measure = () => {
            const el = tabRefs.current[value];
            if (!el) return;
            const next = { left: el.offsetLeft, width: el.offsetWidth };
            setBar(prev => (prev && prev.left === next.left && prev.width === next.width ? prev : next));
        };
        measure();
        const row = rowRef.current;
        if (!row || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(row);
        return () => ro.disconnect();
    }, [value, tabs]);

    return (
        <div
            ref={rowRef}
            role="tablist"
            className={`relative flex gap-6 border-b border-[var(--border)] ${className}`}
        >
            {tabs.map(({ id, label, icon }) => {
                const selected = id === value;
                return (
                    <button
                        key={id}
                        ref={el => { tabRefs.current[id] = el; }}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => onChange(id)}
                        className={`flex items-center gap-2 text-sm pt-1 pb-3 ${selected ? on : `${muted} hover:text-[var(--text)]`}`}
                    >
                        {icon}
                        <span className="grid">
                            <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-semibold">{label}</span>
                            <span className={`col-start-1 row-start-1 ${selected ? 'font-semibold' : ''}`}>{label}</span>
                        </span>
                    </button>
                );
            })}
            {bar && (
                <span
                    aria-hidden="true"
                    className={`chip-slide pointer-events-none absolute h-0.5 bg-[var(--accent)] -bottom-px`}
                    style={{ left: bar.left, width: bar.width }}
                />
            )}
        </div>
    );
}

/**
 * The class for a panel that swaps with a tab (or any ordered choice): it
 * slides in from the side you are moving toward, forward from the right and
 * back from the left, on the same motion as switching pages. Key the panel on
 * the value so it remounts and the entrance plays. Empty on first render, so
 * a page doesn't slide its first panel in on top of its own page transition.
 */
export function useSwitchAnimation<K>(value: K, order: readonly K[]): string {
    const prev = useRef(value);
    const cls = useRef('');
    if (prev.current !== value) {
        cls.current = order.indexOf(value) >= order.indexOf(prev.current) ? 'view-enter-forward' : 'view-enter-backward';
        prev.current = value;
    }
    return cls.current;
}

export default Tabs;
