import React from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Route, Ester, isTestosteroneEster, isUnmodelledDrug } from '../../../logic';
import { refusedFieldProps } from './refusedField';

interface InjectionFieldsProps {
    ester: Ester;
    rawDose: string;
    e2Dose: string;
    onRawChange: (val: string) => void;
    onE2Change: (val: string) => void;
    route: Route;
    /** Save was refused for an empty or zero dose; see refusedFieldProps. */
    invalid?: boolean;
    errorId?: string;
}

const InjectionFields: React.FC<InjectionFieldsProps> = ({
    ester,
    rawDose,
    e2Dose,
    onRawChange,
    onE2Change,
    route,
    invalid,
    errorId,
}) => {
    const { t } = useTranslation();
    const isT = isTestosteroneEster(ester);
    const equivLabelKey = isT ? 'field.dose_t' : 'field.dose_e2';
    // Cyproterone and the unmodelled drugs have no estradiol equivalent: their own dose is all there is.
    const rawOnly = ester === Ester.CPA || isUnmodelledDrug(ester);
    const rawId = React.useId();
    const e2Id = React.useId();

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ester !== Ester.E2 && (
                <div
                    className={`space-y-2 ${(ester === Ester.EV && route === Route.injection) || rawOnly ? 'col-span-2' : ''}`}
                >
                    <label htmlFor={rawId} className="field-label">
                        {t('field.dose_raw')}
                    </label>
                    <input
                        id={rawId}
                        {...refusedFieldProps(rawDose, invalid, errorId)}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={rawDose}
                        onChange={e => onRawChange(e.target.value)}
                        className="input-base w-full text-[var(--text)] font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.0"
                        style={{ fontSize: '16px' }}
                    />
                </div>
            )}
            {!(ester === Ester.EV && route === Route.injection) && !rawOnly && (
                <div className={`space-y-2 ${ester === Ester.E2 ? 'col-span-2' : ''}`}>
                    <label htmlFor={e2Id} className="field-label">
                        {t(equivLabelKey)}
                    </label>
                    <input
                        id={e2Id}
                        {...refusedFieldProps(e2Dose, invalid, errorId)}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={e2Dose}
                        onChange={e => onE2Change(e.target.value)}
                        className="input-base w-full text-[var(--text)] font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.0"
                        style={{ fontSize: '16px' }}
                    />
                </div>
            )}

            {ester === Ester.EV && route === Route.injection && (
                <div className="col-span-2">
                    {/* No unit after the number: the label already ends in (mg). */}
                    <p className="field-hint">
                        {t(equivLabelKey)}: {e2Dose || '--'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default InjectionFields;
