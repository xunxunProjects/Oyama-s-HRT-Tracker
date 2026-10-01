import React from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

import Tick from '../components/Tick';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';

interface HRTModeSettingsProps {
    onBack: () => void;
}

const HRTModeSettings: React.FC<HRTModeSettingsProps> = ({ onBack }) => {
    const { t } = useTranslation();
    const { mode, setMode } = useHRTMode();

    const options = [
        { value: 'transfem', labelKey: 'mode.transfem' },
        { value: 'transmasc', labelKey: 'mode.transmasc' },
    ] as const;

    return (
        <div className="relative pb-32">
            <PageHeader onBack={onBack} title={t('settings.hrt_mode')} />

            <div className={`${PAGE_COLUMN} mt-4`}>
                {options.map(({ value, labelKey }) => (
                    <button
                        key={value}
                        onClick={() => setMode(value)}
                        className="w-full flex items-center justify-between py-4 border-b border-[var(--border)] last:border-b-0 text-start"
                    >
                        <span className={`text-[0.9375rem] ${mode === value
                            ? 'font-semibold text-[var(--text)]'
                            : 'text-[var(--text)]'
                        }`}>
                            {t(labelKey)}
                        </span>
                        <Tick on={mode === value} />
                    </button>
                ))}
            </div>
        </div>
    );
};

export default HRTModeSettings;
