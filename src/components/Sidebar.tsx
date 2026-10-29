import React from 'react';
import Doodle, { type DoodleName } from './Doodle';

interface NavItem {
    id: string;
    label: string;
    icon: React.ElementType; // Changed from ReactElement to ElementType
}

interface SidebarProps {
    navItems: NavItem[];
    currentView: string;
    onViewChange: (view: any) => void;
}

// Each page's own drawing, in the hand of the app's illustrations (Doodle.tsx).
// A page without one (Admin) keeps its line icon.
const DOODLES: Record<string, DoodleName> = {
    home: 'house',
    history: 'notebook',
    lab: 'report',
    settings: 'gear',
    account: 'person',
};

const Sidebar: React.FC<SidebarProps> = ({ navItems, currentView, onViewChange }) => {
    return (
        // With a mouse the sidebar rests as a strip of icons and opens over the
        // page while it's pointed at (motion.css, "the sidebar"). The <nav>
        // only holds the strip's room in the layout; the panel inside it is
        // what widens, so the page never reflows under the pointer.
        <nav className="side-nav hidden md:block relative w-[var(--sidebar-width)] h-full shrink-0">
            <div className="side-panel absolute inset-y-0 start-0 z-40 flex w-full flex-col bg-[var(--bg-subtle)] border-e border-[var(--border)]">
                {/* Logo: the app icon in a rounded tile, then the name. The
                    tile is the drawings' size and centred over them, so it
                    stays in line with them in the narrow strip too. */}
                <div className="px-[1.375rem] pt-6 pb-5">
                    <h1
                        aria-label="Oyama Tracker"
                        className="flex items-center gap-3.5 font-sans text-[1.0625rem] leading-none tracking-[-0.02em]"
                    >
                        <img
                            src="/pwa-192x192.png"
                            alt=""
                            width={36}
                            height={36}
                            className="size-9 max-w-none shrink-0 rounded-[0.5625rem]"
                        />
                        <span className="side-label">
                            <span className="font-semibold text-[var(--text)]">Oyama</span>{' '}
                            <span className="font-normal text-[var(--text-muted)]">Tracker</span>
                        </span>
                    </h1>
                </div>

                {/* Navigation Items. The current page sits on a filled pill with
                    its drawing in colour; the rest rest in grey and colour in on
                    hover. In the narrow strip each pill is a square with its
                    drawing in the middle. */}
                <div className="flex-1 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
                    {navItems.map(item => {
                        const isActive = currentView === item.id;
                        const Icon = item.icon;
                        const doodle = DOODLES[item.id];
                        return (
                            <button
                                key={item.id}
                                onClick={() => onViewChange(item.id)}
                                aria-current={isActive ? 'page' : undefined}
                                aria-label={item.label}
                                className={`group w-full h-14 flex items-center gap-3.5 px-2.5 rounded-[var(--radius-md)] text-[0.9375rem] transition-colors duration-150 motion-reduce:transition-none
                                ${
                                    isActive
                                        ? 'font-medium text-[var(--text)] bg-[var(--surface-pressed)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                                }`}
                            >
                                {doodle ? (
                                    <Doodle name={doodle} size={2.25} className={isActive ? '' : 'nav-doodle-rest'} />
                                ) : (
                                    <span className="grid size-9 shrink-0 place-items-center">
                                        <Icon
                                            size={22}
                                            className={isActive ? 'text-[var(--accent-ink)]' : ''}
                                            strokeWidth={isActive ? 2 : 1.75}
                                        />
                                    </span>
                                )}
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
