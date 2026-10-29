import React from 'react';

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

const Sidebar: React.FC<SidebarProps> = ({ navItems, currentView, onViewChange }) => {
    return (
        // With a mouse the sidebar rests as a strip of icons and opens over the
        // page while it's pointed at (motion.css, "the sidebar"). The <nav>
        // only holds the strip's room in the layout; the panel inside it is
        // what widens, so the page never reflows under the pointer.
        <nav className="side-nav hidden md:block relative w-[var(--sidebar-width)] h-full shrink-0">
            <div className="side-panel absolute inset-y-0 start-0 z-40 flex w-full flex-col bg-[var(--bg-subtle)] border-e border-[var(--border)]">
                {/* Logo: the app icon in a rounded tile, then the name. The
                    tile is centred over the nav icons below it, so it stays in
                    line with them in the narrow strip too. */}
                <div className="px-5 pt-7 pb-6">
                    <h1
                        aria-label="Oyama Tracker"
                        className="flex items-center gap-2.5 font-sans text-[1.0625rem] leading-none tracking-[-0.02em]"
                    >
                        <img
                            src="/pwa-192x192.png"
                            alt=""
                            width={28}
                            height={28}
                            className="size-7 max-w-none shrink-0 rounded-[0.4375rem]"
                        />
                        <span className="side-label">
                            <span className="font-semibold text-[var(--text)]">Oyama</span>{' '}
                            <span className="font-normal text-[var(--text-muted)]">Tracker</span>
                        </span>
                    </h1>
                </div>

                {/* Navigation Items. The current page sits on a filled pill with
                its icon in terracotta; the rest lift to full text on hover. */}
                <div className="flex-1 px-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
                    {navItems.map(item => {
                        const isActive = currentView === item.id;
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                onClick={() => onViewChange(item.id)}
                                aria-current={isActive ? 'page' : undefined}
                                aria-label={item.label}
                                className={`w-full h-10 flex items-center gap-3 px-3 rounded-[var(--radius-md)] text-sm transition-colors duration-150 motion-reduce:transition-none
                                ${
                                    isActive
                                        ? 'font-medium text-[var(--text)] bg-[var(--surface-pressed)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                                }`}
                            >
                                <Icon
                                    size={20}
                                    className={`shrink-0 ${isActive ? 'text-[var(--accent-ink)]' : ''}`}
                                    strokeWidth={isActive ? 2 : 1.75}
                                />
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
