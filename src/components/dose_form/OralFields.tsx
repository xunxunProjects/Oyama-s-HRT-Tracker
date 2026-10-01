import React from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Route, Ester } from '../../../logic';

interface OralFieldsProps {
    ester: Ester;
    rawDose: string;
    e2Dose: string;
    onRawChange: (val: string) => void;
    onE2Change: (val: string) => void;
    route: Route;
}

const OralFields: React.FC<OralFieldsProps> = ({
    ester,
    rawDose,
    e2Dose,
    onRawChange,
    onE2Change,
    route
}) => {
    const { t } = useTranslation();

    return (
        <div className="grid grid-cols-2 gap-4">
            {(ester !== Ester.E2) && (
                <div className={`space-y-1.5 ${(ester === Ester.EV && route === Route.oral) || ester === Ester.CPA ? 'col-span-2' : ''}`}>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] pl-1">{t('field.dose_raw')}</label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={rawDose} onChange={e => onRawChange(e.target.value)}
                        className="w-full p-3 bg-[var(--field)] border border-[var(--border-strong)] rounded-md focus:ring-[3px] focus:ring-[var(--accent)]/20 focus:border-[var(--accent-ink)] outline-none text-[var(--text)] font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.0"
                        style={{ fontSize: '16px' }}
                    />
                </div>
            )}

            {!(ester === Ester.EV && route === Route.oral) && ester !== Ester.CPA && (
                <div className={`space-y-1.5 ${(ester === Ester.E2) ? "col-span-2" : ""}`}>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] pl-1">
                        {t('field.dose_e2')}
                    </label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={e2Dose} onChange={e => onE2Change(e.target.value)}
                        className="w-full p-3 bg-[var(--field)] border border-[var(--border-strong)] rounded-md focus:ring-[3px] focus:ring-[var(--accent)]/20 focus:border-[var(--accent-ink)] outline-none font-medium text-[var(--text)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.0"
                        style={{ fontSize: '16px' }}
                    />
                </div>
            )}

            {(ester === Ester.EV && route === Route.oral) && (
                <div className="col-span-2">
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                        {t('field.dose_e2')}: {e2Dose ? `${e2Dose} mg` : '--'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default OralFields;
