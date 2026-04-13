import React, { useEffect } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Route, Ester, SL_TIER_ORDER, SublingualTierParams, getToE2Factor } from '../../../logic';
import CustomSelect from '../CustomSelect';

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
    holdFromTheta: (theta: number) => number;
    thetaFromHold: (hold: number) => number;
    isInitializing: boolean;
    route: Route;
    lastEditedField: 'raw' | 'bio';
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
    holdFromTheta,
    thetaFromHold,
    isInitializing,
    route,
    lastEditedField
}) => {
    const { t } = useTranslation();

    useEffect(() => {
        if (isInitializing || lastEditedField !== 'raw' || !rawDose) return;
    }, [ester, route]);

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
        description: `${SublingualTierParams[tierKey].hold} min`
    }));

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1">{t('field.sl_absorption')}</label>
                    <button
                        onClick={() => setUseCustomTheta(!useCustomTheta)}
                        className="text-xs font-semibold text-pink-600 dark:text-pink-400"
                    >
                        {useCustomTheta ? t('sl.use_presets') : t('sl.use_custom')}
                    </button>
                </div>

                {!useCustomTheta ? (
                    <CustomSelect
                        value={String(slTier)}
                        onChange={(val) => setSlTier(parseInt(val, 10))}
                        options={tierOptions}
                    />
                ) : (
                    <div className="p-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 space-y-2">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-300 pl-0.5">{t('sl.hold_time_min')}</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number" inputMode="decimal"
                                min="1" max="60"
                                value={customHoldInput}
                                onChange={e => handleCustomHoldChange(e.target.value)}
                                className="w-16 h-9 px-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md text-center text-sm font-medium focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none text-gray-900 dark:text-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-xs text-gray-500 dark:text-gray-400">min</span>
                            <input
                                type="range"
                                min="1" max="60"
                                value={customHoldValue}
                                onChange={e => {
                                    const v = parseInt(e.target.value);
                                    setCustomHoldValue(v);
                                    setCustomHoldInput(v.toString());
                                }}
                                className="flex-1 h-1 accent-pink-600"
                            />
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 pl-0.5">{t('sl.theta_approx')}: {thetaFromHold(customHoldValue).toFixed(3)} (Keep E2)</p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(ester !== Ester.E2) && (
                    <div className={`space-y-2 ${(ester === Ester.EV && route === Route.sublingual) ? 'col-span-2' : ''}`}>
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

                {!(ester === Ester.EV && route === Route.sublingual) && ester !== Ester.CPA && (
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

                {(ester === Ester.EV && route === Route.sublingual) && (
                    <div className="col-span-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-1">
                            {t('field.dose_e2')}: {e2Dose ? `${e2Dose} mg` : '--'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SublingualFields;
