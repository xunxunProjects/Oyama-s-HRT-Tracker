import React from 'react';
import { ArrowLeft, Languages, Check } from 'lucide-react';
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
                            <Languages size={18} className="text-pink-500 dark:text-pink-400" />
                        </div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                            {t('drawer.lang')}
                        </h2>
                    </div>
                </div>
            </div>

            <div className="mx-6 md:mx-8">
                <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800 overflow-hidden text-sm">
                    {languageOptions.map(({ value, label }) => (
                        <button
                            key={value}
                            onClick={() => setLang(value as Lang)}
                            className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                        >
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            {lang === value && (
                                <Check size={18} className="text-[var(--color-m3-primary)]" />
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default LanguageSettings;
