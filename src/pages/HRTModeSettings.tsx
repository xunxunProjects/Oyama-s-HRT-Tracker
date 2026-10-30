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

    // Each option says what it tracks, in the intro's own words.
    const options = [
        { value: 'transfem', labelKey: 'mode.transfem', descKey: 'onboarding.mode_transfem_desc' },
        { value: 'transmasc', labelKey: 'mode.transmasc', descKey: 'onboarding.mode_transmasc_desc' },
    ] as const;

    return (
        <div className="relative md:pb-32">
            <PageHeader onBack={onBack} title={t('settings.hrt_mode')} />

            <div className={`${PAGE_COLUMN} mt-4`}>
                <div>
                    {options.map(({ value, labelKey, descKey }) => (
                        <button
                            key={value}
                            onClick={() => setMode(value)}
                            aria-pressed={mode === value}
                            className="w-full flex items-center justify-between gap-4 py-4 border-b-(length:--hairline) border-[var(--border)] last:border-b-0 text-start"
                        >
                            <span>
                                <span
                                    className={`block text-sm ${
                                        mode === value ? 'font-semibold text-[var(--text)]' : 'text-[var(--text)]'
                                    }`}
                                >
                                    {t(labelKey)}
                                </span>
                                <span className="block text-xs text-[var(--text-muted)] mt-0.5">{t(descKey)}</span>
                            </span>
                            <Tick on={mode === value} />
                        </button>
                    ))}
                </div>

                {/* Records are kept per mode, so after a switch History can look
                    empty. Saying so up front keeps that from reading as a wipe. */}
                <p className="mt-4 text-xs text-[var(--text-muted)]">{t('settings.hrt_mode_note')}</p>
            </div>
        </div>
    );
};

export default HRTModeSettings;
