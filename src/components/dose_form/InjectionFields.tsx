import React, { useEffect } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Route, Ester, getToE2Factor } from '../../../logic';

interface InjectionFieldsProps {
    ester: Ester;
    rawDose: string;
    e2Dose: string;
    onRawChange: (val: string) => void;
    onE2Change: (val: string) => void;
    isInitializing: boolean;
    route: Route;
    lastEditedField: 'raw' | 'bio';
}

const InjectionFields: React.FC<InjectionFieldsProps> = ({
    ester,
    rawDose,
    e2Dose,
    onRawChange,
    onE2Change,
    isInitializing,
    route,
    lastEditedField
}) => {
    const { t } = useTranslation();

    useEffect(() => {
        if (isInitializing || lastEditedField !== 'raw' || !rawDose) return;

        const v = parseFloat(rawDose);
        if (!isNaN(v)) {
            const factor = getToE2Factor(ester) || 1;
            const e2Equivalent = v * factor;
        }
    }, [ester, route]);


    return (
        <div className="grid grid-cols-2 gap-4">
            {(ester !== Ester.E2) && (
                <div className={`space-y-2 ${(ester === Ester.EV && (route === Route.injection)) ? 'col-span-2' : ''}`}>
                    <label className="block text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">{t('field.dose_raw')}</label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={rawDose} onChange={e => onRawChange(e.target.value)}
                        className="w-full p-4 bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-[var(--radius-lg)] focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-teal-400 outline-none font-mono text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] font-bold"
                        placeholder="0.0"
                    />
                </div>
            )}
            {!(ester === Ester.EV && route === Route.injection) && ester !== Ester.CPA && (
                <div className={`space-y-2 ${(ester === Ester.E2) ? "col-span-2" : ""}`}>
                    <label className="block text-xs font-bold text-[var(--color-m3-accent)] uppercase tracking-wider">
                        {t('field.dose_e2')}
                    </label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={e2Dose} onChange={e => onE2Change(e.target.value)}
                        className="w-full p-4 bg-[var(--color-m3-accent-container)] dark:bg-rose-900/20 border border-[var(--color-m3-outline-variant)] dark:border-rose-900/30 rounded-[var(--radius-lg)] focus:ring-2 focus:ring-[var(--color-m3-accent)]/30 outline-none font-bold text-[var(--color-m3-accent)] dark:text-rose-400 font-mono"
                        placeholder="0.0"
                    />
                </div>
            )}

            {(ester === Ester.EV && route === Route.injection) && (
                <div className="col-span-2">
                    <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-1">
                        {t('field.dose_e2')}: {e2Dose ? `${e2Dose} mg` : '--'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default InjectionFields;
