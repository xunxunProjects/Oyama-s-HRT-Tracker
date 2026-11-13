import React, { useEffect, useRef, useState } from 'react';
import Doodle, { NAV_DOODLES } from './Doodle';
import { currentInputMode } from '../utils/inputMode';

interface NavItem {
    id: string;
    label: string;
    icon: React.ElementType; // Changed from ReactElement to ElementType
    /** A small accent dot for a page with something to do. */
    badge?: boolean;
}

interface SidebarProps {
    navItems: NavItem[];
    currentView: string;
    onViewChange: (view: any) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ navItems, currentView, onViewChange }) => {
    // Opened by a finger (a touch laptop's screen): hover is off while the
    // last input was touch, so the app icon at the top opens the labels, and
    // a tap anywhere else, or a mouse leaving, closes them again.
    const [open, setOpen] = useState(false);
    const navRef = useRef<HTMLElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (!navRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', onDown, true);
        return () => document.removeEventListener('pointerdown', onDown, true);
    }, [open]);

    return (
        // With a mouse the sidebar rests as a strip of icons and opens over the
        // page while it's pointed at (motion.css, "the sidebar"). The <nav>
        // only holds the strip's room in the layout; the panel inside it is
        // what widens, so the page never reflows under the pointer.
        <nav
            ref={navRef}
            data-open={open || undefined}
            onPointerLeave={e => {
                if (e.pointerType === 'mouse') setOpen(false);
            }}
            className="side-nav hidden md:block relative w-[var(--sidebar-width)] h-full shrink-0"
        >
            <div className="side-panel absolute inset-y-0 start-0 z-40 flex w-full flex-col bg-[var(--bg-subtle)] border-e-(length:--hairline) border-[var(--border)]">
                {/* Logo: the app icon in a rounded tile, then the name. The
                    tile is the drawings' size and centred over them, so it
                    stays in line with them in the narrow strip too. */}
                <div className="px-[1.375rem] pt-6 pb-5 touch-short:pt-4 touch-short:pb-3">
                    <h1
                        aria-label="Oyama Tracker"
                        className="flex items-center gap-3.5 font-sans text-sm leading-none tracking-[-0.02em]"
                    >
                        {/* Out of the tab order and hidden from screen readers:
                            a keyboard opens the panel by moving focus into it,
                            and every item already says its name. */}
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-hidden="true"
                            onClick={() => {
                                if (currentInputMode() === 'touch') setOpen(o => !o);
                            }}
                            className="tap-target shrink-0 cursor-default rounded-[0.5625rem]"
                        >
                            <img
                                src="/pwa-192x192.png"
                                alt=""
                                width={36}
                                height={36}
                                className="block size-9 max-w-none rounded-[0.5625rem]"
                            />
                        </button>
                        <span className="side-label">
                            <span className="font-semibold text-[var(--text)]">Oyama</span>{' '}
                            <span className="font-normal text-[var(--text-muted)]">Tracker</span>
                        </span>
                    </h1>
                </div>

                {/* On a wide but short touch screen (a phone turned sideways) the
                    Overview puts its reading here, between the name and the
                    pages, so the whole page beside it can go to the chart. The
                    Overview fills this through a portal; elsewhere it is empty
                    and takes no room. */}
                <div id="sidebar-status" className="hidden touch-short:block empty:hidden" />

                {/* Navigation Items. The current page sits on a filled pill with
                    the rest lift to full text on hover; every drawing is in
                    colour. In the narrow strip each pill is a square with its
                    drawing in the middle. */}
                <div className="flex-1 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
                    {navItems.map(item => {
                        const isActive = currentView === item.id;
                        const Icon = item.icon;
                        const doodle = NAV_DOODLES[item.id];
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setOpen(false);
                                    onViewChange(item.id);
                                }}
                                aria-current={isActive ? 'page' : undefined}
                                aria-label={item.label}
                                className={`w-full h-14 touch-short:h-11 flex items-center gap-3.5 px-2.5 rounded-[var(--radius-md)] text-sm transition-colors duration-150 motion-reduce:transition-none
                                ${
                                    isActive
                                        ? 'font-medium text-[var(--text)] bg-[var(--surface-pressed)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                                }`}
                            >
                                <span className="relative grid size-9 shrink-0 place-items-center">
                                    {doodle ? (
                                        <Doodle name={doodle} size={2.25} />
                                    ) : (
                                        <Icon
                                            size={22}
                                            className={isActive ? 'text-[var(--accent-ink)]' : ''}
                                            strokeWidth={isActive ? 2 : 1.75}
                                        />
                                    )}
                                    {item.badge && (
                                        <span
                                            aria-hidden="true"
                                            className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-[var(--accent)]"
                                        />
                                    )}
                                </span>
                                <span className="side-label">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
};

export default Sidebar;
