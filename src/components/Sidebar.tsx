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
        <nav className="hidden md:flex flex-col w-[280px] h-full bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-dim)] border-e border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] shrink-0 transition-colors duration-300">
            {/* Logo Area */}
            <div className="px-7 py-8">
                <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] leading-none">
                    HRT Tracker
                </h1>
            </div>

            {/* Navigation Items */}
            <div className="flex-1 px-4 space-y-1 overflow-y-auto overflow-x-hidden">
                {navItems.map(item => {
                    const isActive = currentView === item.id;
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            className={`w-full flex items-center gap-3.5 px-4 py-3.5 text-sm font-semibold group relative
                                ${isActive
                                    ? 'text-[var(--color-m3-primary)] dark:text-pink-400'
                                    : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)]'
                                }`}
                        >
                            {/* Active indicator underline */}
                            <span 
                                className={`absolute bottom-0 left-4 h-[2px] bg-current transition-all duration-300 ease-out
                                    ${isActive 
                                        ? 'w-[calc(100%_-_32px)] opacity-100' 
                                        : 'w-0 opacity-0'
                                    }`}
                            />
                            
                            <span className="z-10">
                                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                            </span>
                            <span className="tracking-tight z-10">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

export default Sidebar;
