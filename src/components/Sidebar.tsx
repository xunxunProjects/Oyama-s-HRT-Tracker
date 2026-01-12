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
        <div className="hidden md:flex flex-col w-64 h-full bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 shrink-0 transition-colors duration-300">
            {/* Logo Area */}
            <div className="px-6 py-8 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm shrink-0 bg-white dark:bg-gray-800">
                    <img src="/favicon.ico" alt="HRT Tracker logo" className="w-full h-full object-cover" />
                </div>
                <div className="leading-tight">
                    <p className="text-base font-bold tracking-tight text-gray-900 dark:text-gray-100">HRT Tracker</p>
                </div>
            </div>

            {/* Navigation Items */}
            <div className="flex-1 px-4 space-y-1 overflow-y-auto mt-2">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => onViewChange(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 group ${currentView === item.id
                            ? 'bg-gray-100/80 dark:bg-gray-800/80 text-gray-900 dark:text-white'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50/80 dark:hover:bg-gray-800/40'
                            }`}
                    >
                        <span className={`transition-colors duration-200 ${currentView === item.id ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`}>
                            {item.icon}
                        </span>
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>

            {/* Bottom Actions */}
            <div className="p-6">
                <div className="flex flex-col">
                    <span className="text-3xl font-black text-gray-200 dark:text-gray-800 tracking-tighter leading-none select-none transition-colors duration-300">
                        {formatTime(currentTime)}
                    </span>
                    <span className="text-xs font-bold text-gray-300 dark:text-gray-700 uppercase tracking-widest mt-1 ml-0.5 select-none transition-colors duration-300">
                        {formatDate(currentTime, lang)}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
