import React from 'react';
import { Plus } from 'lucide-react';
import { formatDate, formatTime } from '../utils/helpers';
import { Lang } from '../i18n/translations';

// Reusing types from App.tsx or defining interface here if not exported
// Since ViewKey is defined inside AppContent in App.tsx and not exported, 
// we might need to rely on 'string' or move the type definition. 
// For now, I'll use string for viewKey to avoid circular dependencies or complex refactors not in plan.
// Ideally, ViewKey should be exported from a types file or logic.ts.
// I will assume the caller passes the correct strings.

interface NavItem {
    id: string; // ViewKey
    label: string;
    icon: React.ReactElement;
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
        <nav className="hidden md:flex flex-col w-[280px] h-full bg-white dark:bg-zinc-950 border-r border-zinc-100 dark:border-zinc-900 shrink-0 transition-colors duration-300">
            {/* Logo Area */}
            <div className="px-8 py-10 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm shrink-0 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                    <img src="/favicon.ico" alt="HRT Tracker" className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col justify-center">
                    <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 leading-none">
                        HRT Tracker
                    </h1>
                    <span className="text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-semibold mt-1">
                        Dashboard
                    </span>
                </div>
            </div>

            {/* Navigation Items */}
            <div className="flex-1 px-6 space-y-1.5 overflow-y-auto">
                {navItems.map(item => {
                    const isActive = currentView === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative
                                ${isActive
                                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                                }`}
                        >
                            <span className={`transition-colors duration-200 ${isActive ? 'text-white dark:text-zinc-900' : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'}`}>
                                {React.cloneElement(item.icon, { size: 18, strokeWidth: isActive ? 2.5 : 2 })}
                            </span>
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Bottom Actions / Time Widget */}
            <div className="p-6 mt-auto">
                <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl p-5 border border-zinc-100 dark:border-zinc-800/50">
                    <div className="flex flex-col">
                        <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tighter leading-none select-none tabular-nums">
                            {formatTime(currentTime)}
                        </span>
                        <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800 my-3"></div>
                        <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest select-none">
                            {formatDate(currentTime, lang)}
                        </span>
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Sidebar;
