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
        <nav className="hidden md:flex flex-col w-[260px] h-full bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface-dim)] shrink-0">
            {/* Logo */}
            <div className="px-5 pt-7 pb-6">
                <span className="block text-[11px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] leading-none mb-1" style={{ fontFamily: 'cursive' }}>
                    Oyama's
                </span>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] leading-none">
                    HRT Tracker
                </h1>
            </div>

            {/* Navigation Items */}
            <div className="flex-1 px-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
                {navItems.map(item => {
                    const isActive = currentView === item.id;
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                                ${isActive
                                    ? 'bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]'
                                    : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)]'
                                }`}
                        >
                            <Icon size={18} strokeWidth={isActive ? 2 : 1.75} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

export default Sidebar;
