import React from 'react';
import { ArrowLeft, Palette, Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

interface AppearanceSettingsProps {
    theme: 'light' | 'dark' | 'system';
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    onBack: () => void;
}

const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ theme, setTheme, onBack }) => {
    const { t } = useTranslation();

    const options = [
        { value: 'light' as const, labelKey: 'theme.light', icon: <Sun size={18} className="text-amber-500" /> },
        { value: 'dark' as const, labelKey: 'theme.dark', icon: <Moon size={18} className="text-indigo-400" /> },
        { value: 'system' as const, labelKey: 'theme.system', icon: <Monitor size={18} className="text-gray-500" /> },
    ];

    return (
        <div className="relative space-y-4 pt-6 pb-32">
            <div className="px-6 md:px-8 mb-2">
                <div className="w-full p-4 rounded-lg bg-white dark:bg-neutral-900 flex items-center gap-3 border border-gray-200 dark:border-neutral-800">
                    <button
                        onClick={onBack}
                        className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-md bg-pink-50 dark:bg-pink-900/20">
                            <Palette size={18} className="text-pink-500 dark:text-pink-400" />
                        </div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                            {t('settings.theme')}
                        </h2>
                    </div>
                </div>
            </div>

            <div className="mx-6 md:mx-8">
                <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800 overflow-hidden text-sm">
                    {options.map(({ value, labelKey, icon }) => (
                        <button
                            key={value}
                            onClick={() => setTheme(value)}
                            className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                        >
                            <div className="flex items-center gap-3">
                                {icon}
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{t(labelKey)}</span>
                            </div>
                            {theme === value && (
                                <Check size={18} className="text-[var(--color-m3-primary)]" />
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AppearanceSettings;
