import React, { useState, useEffect } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { isPlausibleBirthYear, BIRTH_YEAR_MIN, AGE_REF_YEARS } from '../../logic';
import { useTranslation } from '../contexts/LanguageContext';
import { fill } from '../utils/regimenText';

interface AgeSettingsProps {
    birthYear: number | null;
    onSave: (birthYear: number | null) => void;
    onBack: () => void;
}

// The year of birth rather than an age, so the value never goes stale and each
// dose is modelled at the age it was taken. Optional, so it can be removed.
const AgeSettings: React.FC<AgeSettingsProps> = ({ birthYear, onSave, onBack }) => {
    const { t } = useTranslation();
    const thisYear = new Date().getFullYear();
    const [yearStr, setYearStr] = useState(birthYear === null ? '' : String(birthYear));
    // Set by a Save that was turned down; the message then stays only for as
    // long as the value is still out of range.
    const [tried, setTried] = useState(false);

    useEffect(() => {
        setYearStr(birthYear === null ? '' : String(birthYear));
    }, [birthYear]);

    const year = Number(yearStr);
    const valid = yearStr.trim() !== '' && isPlausibleBirthYear(year, thisYear);
    const showError = tried && !valid;

    // A form, so the keyboard's Done / Go key saves as well as the button.
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!valid) {
            setTried(true);
            return;
        }
        onSave(year);
        onBack();
    };

    const handleRemove = () => {
        onSave(null);
        onBack();
    };

    const divider = 'border-b-(length:--hairline) border-[var(--border)]';
    const range = `${BIRTH_YEAR_MIN}–${thisYear}`;

    return (
        <div className="relative md:pb-32">
            <PageHeader onBack={onBack} title={t('settings.age')} />

            <form onSubmit={handleSubmit} noValidate className={`${PAGE_COLUMN} mt-4`}>
                <div className={`flex items-center justify-between py-5 ${divider}`}>
                    <div>
                        <input
                            type="number"
                            inputMode="numeric"
                            enterKeyHint="done"
                            value={yearStr}
                            onChange={e => setYearStr(e.target.value)}
                            aria-label={t('age.birth_year')}
                            aria-invalid={showError}
                            aria-describedby="age-help"
                            className="input-base text-[1.625rem] font-light tabular-nums text-[var(--text)] w-32 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            placeholder={String(thisYear - 25)}
                            style={{ fontSize: '40px' }}
                            autoFocus
                        />
                        {/* What the field asks for, and the age it gives, shown from
                            the start; a value outside the range swaps in the full
                            sentence, in place, not in a dialog. */}
                        <p
                            id="age-help"
                            aria-live="polite"
                            className={`mt-2 text-xs ${showError ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}
                        >
                            {showError
                                ? fill(t('error.birthYearRange'), { min: BIRTH_YEAR_MIN, max: thisYear })
                                : valid
                                  ? fill(t('age.this_year'), { n: thisYear - year })
                                  : `${t('age.birth_year')} (${range})`}
                        </p>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] max-w-[140px] text-right">{t('age.desc')}</p>
                </div>

                <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
                    {fill(t('age.explain'), { ref: AGE_REF_YEARS })}
                </p>

                <button type="submit" className="btn-primary w-full mt-6">
                    {t('btn.save')}
                </button>
                {birthYear !== null && (
                    <button type="button" onClick={handleRemove} className="btn-secondary w-full mt-3">
                        {t('age.remove')}
                    </button>
                )}
            </form>
        </div>
    );
};

export default AgeSettings;
