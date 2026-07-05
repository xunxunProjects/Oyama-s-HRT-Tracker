import React from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { AppTheme } from '../constants';

interface AppearanceSettingsProps {
    theme: AppTheme;
    setTheme: (theme: AppTheme) => void;
    onBack: () => void;
}

const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ theme, setTheme, onBack }) => {
    const { t } = useTranslation();

    const options = [
        { value: 'light' as const, labelKey: 'theme.light' },
        { value: 'dark' as const, labelKey: 'theme.dark' },
        { value: 'system' as const, labelKey: 'theme.system' },
        { value: 'mono' as const, labelKey: 'theme.mono' },
    ];

    return (
        <div className="relative space-y-4 pb-32">
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-8 pt-8 pb-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-3 -ml-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                >
                    <ArrowLeft size={18} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0" />
                    <span className="text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        {t('settings.theme')}
                    </span>
                </button>
            </div>

            <div className="px-6 md:px-8 max-w-2xl">
                {options.map(({ value, labelKey }) => (
                    <button
                        key={value}
                        onClick={() => setTheme(value)}
                        className="w-full flex items-center justify-between py-4 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] last:border-b-0 text-start"
                    >
                        <span className={`text-[15px] ${theme === value
                            ? 'font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]'
                            : 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]'
                        }`}>{t(labelKey)}</span>
                        {theme === value && (
                            <Check size={16} className="text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] shrink-0" />
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default AppearanceSettings;
