import React from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

import Tick from '../components/Tick';
import { useTranslation } from '../contexts/LanguageContext';
import { Lang } from '../i18n/translations';

interface LanguageSettingsProps {
    lang: Lang;
    setLang: (lang: Lang) => void;
    languageOptions: { value: string; label: string }[];
    onBack: () => void;
}

const LanguageSettings: React.FC<LanguageSettingsProps> = ({ lang, setLang, languageOptions, onBack }) => {
    const { t } = useTranslation();

    return (
        <div className="relative space-y-4 pb-32">
            <PageHeader onBack={onBack} title={t('drawer.lang')} />

            <div className={PAGE_COLUMN}>
                {languageOptions.map(({ value, label }) => (
                    <button
                        key={value}
                        onClick={() => setLang(value as Lang)}
                        className="w-full flex items-center justify-between py-4 border-b border-[var(--border)] last:border-b-0 text-start"
                    >
                        <span className={`text-[0.9375rem] ${lang === value
                            ? 'font-semibold text-[var(--text)]'
                            : 'text-[var(--text)]'
                        }`}>
                            {label}
                        </span>
                        <Tick on={lang === value} />
                    </button>
                ))}
            </div>
        </div>
    );
};

export default LanguageSettings;
