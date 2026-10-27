import React from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Route, Ester, SL_TIER_ORDER, SublingualTierParams } from '../../../logic';
import CustomSelect from '../CustomSelect';
import { refusedFieldProps } from './refusedField';

interface SublingualFieldsProps {
    ester: Ester;
    rawDose: string;
    e2Dose: string;
    onRawChange: (val: string) => void;
    onE2Change: (val: string) => void;
    slTier: number;
    setSlTier: (val: number) => void;
    useCustomTheta: boolean;
    setUseCustomTheta: (val: boolean) => void;
    customHoldInput: string;
    setCustomHoldInput: (val: string) => void;
    customHoldValue: number;
    setCustomHoldValue: (val: number) => void;
    thetaFromHold: (hold: number) => number;
    route: Route;
    /** Save was refused for an empty or zero dose; see refusedFieldProps. */
    invalid?: boolean;
    errorId?: string;
}

const SublingualFields: React.FC<SublingualFieldsProps> = ({
    ester,
    rawDose,
    e2Dose,
    onRawChange,
    onE2Change,
    slTier,
    setSlTier,
    useCustomTheta,
    setUseCustomTheta,
    customHoldInput,
    setCustomHoldInput,
    customHoldValue,
    setCustomHoldValue,
    thetaFromHold,
    route,
    invalid,
    errorId,
}) => {
    const { t } = useTranslation();
    const tierLabelId = React.useId();
    const holdLabelId = React.useId();
    const holdId = React.useId();
    const rawId = React.useId();
    const e2Id = React.useId();

    const handleCustomHoldChange = (str: string) => {
        setCustomHoldInput(str);
        const val = parseFloat(str);
        if (Number.isFinite(val) && val >= 1) {
            setCustomHoldValue(val);
        }
    };

    const tierOptions = SL_TIER_ORDER.map((tierKey, index) => ({
        value: String(index),
        label: t(`sl.tier.${tierKey}`),
        description: `${SublingualTierParams[tierKey].hold} min`,
    }));

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <label id={tierLabelId} className="field-label">
                        {t('field.sl_absorption')}
                    </label>
                    <button
                        type="button"
                        onClick={() => setUseCustomTheta(!useCustomTheta)}
                        className="text-xs font-semibold text-[var(--accent-ink)]"
                    >
                        {useCustomTheta ? t('sl.use_presets') : t('sl.use_custom')}
                    </button>
                </div>

                {!useCustomTheta ? (
                    <CustomSelect
                        labelledBy={tierLabelId}
                        value={String(slTier)}
                        onChange={val => setSlTier(parseInt(val, 10))}
                        options={tierOptions}
                    />
                ) : (
                    <div className="pt-2 pb-1 space-y-2">
                        <label
                            id={holdLabelId}
                            htmlFor={holdId}
                            className="text-xs font-medium text-[var(--text-muted)]"
                        >
                            {t('sl.hold_time_min')}
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                id={holdId}
                                type="number"
                                inputMode="decimal"
                                min="1"
                                max="60"
                                value={customHoldInput}
                                onChange={e => handleCustomHoldChange(e.target.value)}
                                className="input-base w-16 h-9 text-center text-sm font-medium text-[var(--text)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                style={{ fontSize: '16px' }}
                            />
                            <span className="text-xs text-[var(--text-muted)]">{t('unit.min_short')}</span>
                            <input
                                type="range"
                                aria-labelledby={holdLabelId}
                                min="1"
                                max="60"
                                value={customHoldValue}
                                onChange={e => {
                                    const v = parseInt(e.target.value);
                                    setCustomHoldValue(v);
                                    setCustomHoldInput(v.toString());
                                }}
                                className="flex-1 h-1 accent-[var(--accent)]"
                            />
                        </div>
                        <p className="text-[0.6875rem] text-[var(--text-muted)]">
                            {t('sl.theta_approx')}: {thetaFromHold(customHoldValue).toFixed(3)}
                        </p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ester !== Ester.E2 && (
                    <div
                        className={`space-y-2 ${ester === Ester.EV && route === Route.sublingual ? 'col-span-2' : ''}`}
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
                            className="input-base w-full text-[var(--text)] font-medium text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="0.0"
                            style={{ fontSize: '16px' }}
                        />
                    </div>
                )}

                {!(ester === Ester.EV && route === Route.sublingual) && ester !== Ester.CPA && (
                    <div className={`space-y-2 ${ester === Ester.E2 ? 'col-span-2' : ''}`}>
                        <label htmlFor={e2Id} className="field-label">
                            {t('field.dose_e2')}
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
                            className="input-base w-full text-[var(--text)] font-medium text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="0.0"
                            style={{ fontSize: '16px' }}
                        />
                    </div>
                )}

                {ester === Ester.EV && route === Route.sublingual && (
                    <div className="col-span-2">
                        {/* No unit after the number: the label already ends in (mg). */}
                        <p className="field-hint">
                            {t('field.dose_e2')}: {e2Dose || '--'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SublingualFields;
