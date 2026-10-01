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

const Sidebar: React.FC<SidebarProps> = ({
    navItems,
    currentView,
    onViewChange
}) => {
    return (
        <nav className="hidden md:flex flex-col w-[16.25rem] h-full bg-[var(--bg-subtle)] border-e border-[var(--border)] shrink-0">
            {/* Logo: the app icon in a rounded tile, then the name. The tile's
                left edge lines up with the nav icons below it. */}
            <div className="px-6 pt-7 pb-6">
                <h1 className="flex items-center gap-2.5 text-[1.0625rem] leading-none tracking-[-0.02em]">
                    <img
                        src="/pwa-192x192.png"
                        alt=""
                        width={28}
                        height={28}
                        className="size-7 shrink-0 rounded-[0.4375rem]"
                    />
                    <span>
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
                            className={`w-full h-10 flex items-center gap-3 px-3 rounded-[var(--radius-md)] text-sm transition-colors duration-150 motion-reduce:transition-none
                                ${isActive
                                    ? 'font-medium text-[var(--text)] bg-[var(--surface-pressed)]'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                                }`}
                        >
                            <Icon size={20} className={`shrink-0 ${isActive ? 'text-[var(--accent-ink)]' : ''}`} strokeWidth={isActive ? 2 : 1.75} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

export default Sidebar;
