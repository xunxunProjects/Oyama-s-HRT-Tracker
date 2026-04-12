import React, { useEffect } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Route, Ester, getToE2Factor } from '../../../logic';

interface OralFieldsProps {
    ester: Ester;
    rawDose: string;
    e2Dose: string;
    onRawChange: (val: string) => void;
    onE2Change: (val: string) => void;
    isInitializing: boolean;
    route: Route;
    lastEditedField: 'raw' | 'bio';
}

const OralFields: React.FC<OralFieldsProps> = ({
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
        }
    }, [ester, route]);

    return (
        <div className="grid grid-cols-2 gap-4">
            {(ester !== Ester.E2) && (
                <div className={`space-y-1.5 ${(ester === Ester.EV && route === Route.oral) || ester === Ester.CPA ? 'col-span-2' : ''}`}>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1">{t('field.dose_raw')}</label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={rawDose} onChange={e => onRawChange(e.target.value)}
                        className="w-full p-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-md focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none text-gray-900 dark:text-gray-100 font-medium text-sm transition-colors"
                        placeholder="0.0"
                    />
                </div>
            )}

            {!(ester === Ester.EV && route === Route.oral) && ester !== Ester.CPA && (
                <div className={`space-y-1.5 ${(ester === Ester.E2) ? "col-span-2" : ""}`}>
                    <label className="block text-xs font-semibold text-rose-500 dark:text-rose-400 pl-1">
                        {t('field.dose_e2')}
                    </label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={e2Dose} onChange={e => onE2Change(e.target.value)}
                        className="w-full p-3 bg-white dark:bg-neutral-900 border border-rose-200 dark:border-rose-900/50 rounded-md focus:ring-1 focus:ring-rose-500 focus:border-rose-500 outline-none font-medium text-rose-600 dark:text-rose-400 text-sm transition-colors"
                        placeholder="0.0"
                    />
                </div>
            )}

            {(ester === Ester.EV && route === Route.oral) && (
                <div className="col-span-2">
                    <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-1">
                        {t('field.dose_e2')}: {e2Dose ? `${e2Dose} mg` : '--'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default OralFields;
