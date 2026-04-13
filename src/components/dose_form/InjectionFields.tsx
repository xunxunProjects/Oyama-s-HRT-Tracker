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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(ester !== Ester.E2) && (
                <div className={`space-y-2 ${(ester === Ester.EV && (route === Route.injection)) ? 'col-span-2' : ''}`}>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1">{t('field.dose_raw')}</label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={rawDose} onChange={e => onRawChange(e.target.value)}
                        className="w-full p-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-xl focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none text-gray-900 dark:text-gray-100 font-medium text-sm transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.0"
                    />
                </div>
            )}
            {!(ester === Ester.EV && route === Route.injection) && ester !== Ester.CPA && (
                <div className={`space-y-2 ${(ester === Ester.E2) ? "col-span-2" : ""}`}>
                    <label className="block text-xs font-semibold text-rose-500 dark:text-rose-400 pl-1">
                        {t('field.dose_e2')}
                    </label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={e2Dose} onChange={e => onE2Change(e.target.value)}
                        className="w-full p-3 bg-white dark:bg-neutral-900 border border-rose-200 dark:border-rose-900/50 rounded-xl focus:ring-1 focus:ring-rose-500 focus:border-rose-500 outline-none text-rose-600 dark:text-rose-400 font-medium text-sm transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.0"
                    />
                </div>
            )}

            {(ester === Ester.EV && route === Route.injection) && (
                <div className="col-span-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-1">
                        {t('field.dose_e2')}: {e2Dose ? `${e2Dose} mg` : '--'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default InjectionFields;
