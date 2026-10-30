import React, { useState, useEffect } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { isPlausibleBodyWeightKG, BODY_WEIGHT_KG_MIN, BODY_WEIGHT_KG_MAX } from '../../logic';

import { useTranslation } from '../contexts/LanguageContext';

interface WeightSettingsProps {
    weight: number;
    onSave: (weight: number) => void;
    onBack: () => void;
}

const WeightSettings: React.FC<WeightSettingsProps> = ({ weight, onSave, onBack }) => {
    const { t } = useTranslation();
    const [weightStr, setWeightStr] = useState(weight.toString());
    // Set by a Save that was turned down; the message then stays only for as
    // long as the value is still out of range.
    const [tried, setTried] = useState(false);

    useEffect(() => {
        setWeightStr(weight.toString());
    }, [weight]);

    const valid = isPlausibleBodyWeightKG(parseFloat(weightStr));
    const showError = tried && !valid;

    // A form, so the keyboard's Done / Go key saves as well as the button.
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!valid) {
            setTried(true);
            return;
        }
        onSave(parseFloat(weightStr));
        onBack();
    };

    const divider = 'border-b-(length:--hairline) border-[var(--border)]';

    return (
        <div className="relative md:pb-32">
            <PageHeader onBack={onBack} title={t('status.weight')} />

            <form onSubmit={handleSubmit} noValidate className={`${PAGE_COLUMN} mt-4`}>
                <div className={`flex items-center justify-between py-5 ${divider}`}>
                    <div>
                        <div className="flex items-end gap-2">
                            <input
                                type="number"
                                inputMode="decimal"
                                enterKeyHint="done"
                                value={weightStr}
                                onChange={e => setWeightStr(e.target.value)}
                                aria-label={t('status.weight')}
                                aria-invalid={showError}
                                aria-describedby="weight-help"
                                className="input-base text-[1.625rem] font-light tabular-nums text-[var(--text)] w-28 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                placeholder="0.0"
                                style={{ fontSize: '40px' }}
                                autoFocus
                            />
                            <span className="text-sm font-medium text-[var(--text-muted)] pb-1">kg</span>
                        </div>
                        {/* The range is shown from the start; a value outside it
                            swaps in the full sentence, in place, not in a dialog. */}
                        <p
                            id="weight-help"
                            aria-live="polite"
                            className={`mt-2 text-xs ${showError ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}
                        >
                            {showError ? t('error.weightRange') : `${BODY_WEIGHT_KG_MIN}–${BODY_WEIGHT_KG_MAX} kg`}
                        </p>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] max-w-[140px] text-right">
                        {t('modal.weight.desc')}
                    </p>
                </div>

                <button type="submit" className="btn-primary w-full mt-6">
                    {t('btn.save')}
                </button>
            </form>
        </div>
    );
};

export default WeightSettings;
