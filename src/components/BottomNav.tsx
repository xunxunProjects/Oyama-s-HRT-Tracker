import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface NavTab {
    id: string;
    label: string;
    icon: React.ElementType;
}

/**
 * The bottom bar on a phone: a frosted floating island that content scrolls
 * visibly beneath. The current tab's icon sits in a tonal terracotta pill,
 * and the pill is the bar's one motion: tap another tab and it glides there
 * (.chip-slide), the icon taking its colour as it arrives. The page itself is
 * simply there; nothing else in the bar moves, and nothing does on the first
 * render.
 *
 * Labels stay on one line: a wrapped one raised its icon above the rest and
 * grew the island past the scroller's bottom padding. Below 340px they drop to
 * 10px rather than being cut off, and the packs keep them short enough for
 * that. The longest, Turkish Genel bakış, is the name that pack's other
 * strings give the page, so it stays, and its tab takes a few pixels more
 * than the rest. Each tab is rounded so the focus ring nests in the island
 * instead of cutting a square into the next tab's pill.
 */
const BottomNav: React.FC<{
    tabs: NavTab[];
    activeTab: string;
    onSelect: (id: string) => void;
}> = ({ tabs, activeTab, onSelect }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const marks = useRef<Record<string, HTMLSpanElement | null>>({});
    const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    // The first placement lands where it belongs; only later ones glide.
    const [placed, setPlaced] = useState(false);

    useLayoutEffect(() => {
        const place = () => {
            const el = marks.current[activeTab];
            if (!el) {
                setPill(null);
                return;
            }
            const next = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
            setPill(prev =>
                prev &&
                prev.left === next.left &&
                prev.top === next.top &&
                prev.width === next.width &&
                prev.height === next.height
                    ? prev
                    : next,
            );
        };
        place();
        const row = rowRef.current;
        if (!row || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(place);
        ro.observe(row);
        return () => ro.disconnect();
    }, [activeTab, tabs]);

    useEffect(() => {
        if (!pill || placed) return;
        const frame = requestAnimationFrame(() => setPlaced(true));
        return () => cancelAnimationFrame(frame);
    }, [pill, placed]);

    return (
        <nav className="glass fixed left-4 right-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-40 md:hidden rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow-md)]">
            <div ref={rowRef} className="relative flex items-stretch p-1.5 gap-0.5">
                {pill && (
                    <span
                        aria-hidden="true"
                        className={`absolute rounded-full bg-[var(--accent-subtle)] ${placed ? 'chip-slide' : ''}`}
                        style={pill}
                    />
                )}
                {tabs.map(({ id, icon: TabIcon, label }) => {
                    const isActive = activeTab === id;
                    return (
                        <button
                            key={id}
                            onClick={() => onSelect(id)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 rounded-[var(--radius-lg)] transition-none ${isActive ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}
                        >
                            {/* Above the pill, which is positioned too. */}
                            <span
                                ref={el => {
                                    marks.current[id] = el;
                                }}
                                className={`relative z-10 grid h-[30px] w-[52px] place-items-center rounded-full transition-colors duration-200 ${isActive ? 'text-[var(--accent-ink)]' : ''}`}
                            >
                                <TabIcon size={22} strokeWidth={isActive ? 2 : 1.75} />
                            </span>
                            <span className="whitespace-nowrap text-[0.6875rem] leading-[0.875rem] font-medium tracking-[0.01em] max-[340px]:text-[0.625rem]">
                                {label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

export default BottomNav;
