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
                <h1 className="text-[15px] font-semibold tracking-tight text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] leading-snug">
                    Oyama Tracker
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
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 motion-reduce:transition-none
                                ${isActive
                                    ? 'font-medium text-body'
                                    : 'text-muted hover:text-body hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]'
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
