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
            // The parent updates the state, we just trigger the logic if needed, 
            // but actually we rely on props.
        }
    }, [ester, route]);

    return (
        <div className="grid grid-cols-2 gap-4">
            {(ester !== Ester.E2) && (
                <div className={`space-y-2 ${(ester === Ester.EV && route === Route.oral) || ester === Ester.CPA ? 'col-span-2' : ''}`}>
                    <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t('field.dose_raw')}</label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={rawDose} onChange={e => onRawChange(e.target.value)}
                        className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-pink-300/50 outline-none font-mono text-zinc-900 dark:text-white font-bold"
                        placeholder="0.0"
                    />
                </div>
            )}

            {/* Hide E2 input for Oral EV and CPA */}
            {!(ester === Ester.EV && route === Route.oral) && ester !== Ester.CPA && (
                <div className={`space-y-2 ${(ester === Ester.E2) ? "col-span-2" : ""}`}>
                    <label className="block text-xs font-bold text-pink-400 uppercase tracking-wider">
                        {t('field.dose_e2')}
                    </label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={e2Dose} onChange={e => onE2Change(e.target.value)}
                        className="w-full p-4 bg-pink-50/50 dark:bg-pink-900/20 border border-pink-100 dark:border-pink-900/30 rounded-2xl focus:ring-2 focus:ring-pink-300/50 outline-none font-bold text-pink-500 dark:text-pink-400 font-mono"
                        placeholder="0.0"
                    />
                </div>
            )}

            {(ester === Ester.EV && route === Route.oral) && (
                <div className="col-span-2">
                    <p className="text-xs text-zinc-500 mt-1">
                        {t('field.dose_e2')}: {e2Dose ? `${e2Dose} mg` : '--'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default OralFields;
