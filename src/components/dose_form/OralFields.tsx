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
                        className="w-full p-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-md focus:ring-1 focus:ring-[var(--color-m3-primary)]/30 focus:border-[var(--color-m3-primary)] outline-none text-gray-900 dark:text-gray-100 font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.0"
                        style={{ fontSize: '16px' }}
                    />
                </div>
            )}

            {!(ester === Ester.EV && route === Route.oral) && ester !== Ester.CPA && (
                <div className={`space-y-1.5 ${(ester === Ester.E2) ? "col-span-2" : ""}`}>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1">
                        {t('field.dose_e2')}
                    </label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={e2Dose} onChange={e => onE2Change(e.target.value)}
                        className="w-full p-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-md focus:ring-1 focus:ring-[var(--color-m3-primary)]/30 focus:border-[var(--color-m3-primary)] outline-none font-medium text-gray-900 dark:text-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.0"
                        style={{ fontSize: '16px' }}
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
