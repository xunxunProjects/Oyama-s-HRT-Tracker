import React from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

import Tick from '../components/Tick';
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
            <PageHeader onBack={onBack} title={t('settings.theme')} />

            <div className={PAGE_COLUMN}>
                {options.map(({ value, labelKey }) => (
                    <button
                        key={value}
                        onClick={() => setTheme(value)}
                        className="w-full flex items-center justify-between py-4 border-b border-[var(--border)] last:border-b-0 text-start"
                    >
                        <span className={`text-[0.9375rem] ${theme === value
                            ? 'font-semibold text-[var(--text)]'
                            : 'text-[var(--text)]'
                        }`}>{t(labelKey)}</span>
                        <Tick on={theme === value} />
                    </button>
                ))}
            </div>
        </div>
    );
};

export default AppearanceSettings;
