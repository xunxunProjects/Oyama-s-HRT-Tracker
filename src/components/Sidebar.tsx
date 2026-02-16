import React from 'react';
import { formatDate, formatTime } from '../utils/helpers';
import { Lang } from '../i18n/translations';

interface NavItem {
    id: string;
    label: string;
    icon: React.ElementType; // Changed from ReactElement to ElementType
}

interface SidebarProps {
    navItems: NavItem[];
    currentView: string;
    onViewChange: (view: any) => void;
    currentTime: Date;
    lang: Lang;
    t: (key: string) => string;
}

const Sidebar: React.FC<SidebarProps> = ({
    navItems,
    currentView,
    onViewChange,
    currentTime,
    lang,
    t
}) => {
    return (
        <nav className="hidden md:flex flex-col w-[280px] h-full bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-dim)] border-r border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] shrink-0 transition-colors duration-300">
            {/* Logo Area */}
            <div className="px-7 py-8">
                <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] leading-none">
                    HRT Tracker
                </h1>
            </div>

            {/* Navigation Items */}
            <div className="flex-1 px-4 space-y-1 overflow-y-auto">
                {navItems.map(item => {
                    const isActive = currentView === item.id;
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-[var(--radius-full)] text-sm font-semibold transition-all duration-300 group relative
                                ${isActive
                                    ? 'bg-[var(--color-m3-primary-container)] dark:bg-teal-900/40 text-[var(--color-m3-on-primary-container)] dark:text-teal-300'
                                    : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]'
                                }`}
                        >
                            <span className={`transition-all duration-300 ${isActive ? 'text-[var(--color-m3-primary)] dark:text-teal-400 scale-110' : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] group-hover:text-[var(--color-m3-on-surface)] dark:group-hover:text-[var(--color-m3-dark-on-surface)]'}`}>
                                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                            </span>
                            <span className="tracking-tight">{item.label}</span>
                            {isActive && (
                                <div className="ml-auto w-2 h-2 rounded-full bg-[var(--color-m3-primary)] dark:bg-teal-400 animate-m3-spring" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Time Widget */}
            <div className="p-5 mt-auto">
                <div className="bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] p-5 border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                    <div className="flex flex-col">
                        <span className="font-display text-3xl font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tighter leading-none select-none tabular-nums">
                            {formatTime(currentTime)}
                        </span>
                        <div className="h-px w-full bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)] my-3" />
                        <span className="text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-[0.1em] select-none">
                            {formatDate(currentTime, lang)}
                        </span>
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Sidebar;
