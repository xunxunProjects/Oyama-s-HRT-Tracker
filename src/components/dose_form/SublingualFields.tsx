import React, { useEffect } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Route, Ester, SL_TIER_ORDER, SublingualTierParams, getToE2Factor } from '../../../logic';
import { ChevronDown, Check, Info, Clock } from 'lucide-react';
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
        // Logic handled by parent via props
    }, [ester, route]);

    const handleCustomHoldChange = (str: string) => {
        setCustomHoldInput(str);
        const val = parseFloat(str);
        if (Number.isFinite(val) && val >= 1) {
            setCustomHoldValue(val);
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t('field.sl_absorption')}</label>
                    <button
                        onClick={() => setUseCustomTheta(!useCustomTheta)}
                        className="text-xs font-bold text-pink-500 hover:text-pink-600 transition"
                    >
                        {useCustomTheta ? t('sl.use_presets') : t('sl.use_custom')}
                    </button>
                </div>

                {!useCustomTheta ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {SL_TIER_ORDER.map((tierKey, index) => {
                            const tierParams = SublingualTierParams[tierKey];
                            const active = slTier === index;
                            return (
                                <button
                                    key={tierKey}
                                    onClick={() => setSlTier(index)}
                                    className={`relative p-3 rounded-xl border-2 text-left transition-all ${active
                                        ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20 ring-2 ring-pink-200 dark:ring-pink-900/30'
                                        : 'border-zinc-200 dark:border-zinc-700 hover:border-pink-200 dark:hover:border-zinc-600 bg-white dark:bg-zinc-800'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className={`font-bold ${active ? 'text-pink-600 dark:text-pink-400' : 'text-zinc-900 dark:text-white'}`}>
                                            {t(`sl.tier.${tierKey}`)}
                                        </div>
                                        {active && <Check size={16} className="text-pink-500" />}
                                    </div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {tierParams.hold} min hold
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
                        <div className="flex items-center gap-2 mb-2">
                            <Clock size={16} className="text-pink-500" />
                            <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{t('sl.hold_time_min')}</label>
                        </div>
                        <div className="flex gap-4 items-center">
                            <input
                                type="number" inputMode="decimal"
                                min="1" max="60"
                                value={customHoldInput}
                                onChange={e => handleCustomHoldChange(e.target.value)}
                                className="w-24 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl font-bold text-center focus:ring-2 focus:ring-pink-500 outline-none"
                            />
                            <div className="flex-1">
                                <input
                                    type="range"
                                    min="1" max="60"
                                    value={customHoldValue}
                                    onChange={e => {
                                        const v = parseInt(e.target.value);
                                        setCustomHoldValue(v);
                                        setCustomHoldInput(v.toString());
                                    }}
                                    className="w-full accent-pink-500"
                                />
                            </div>
                        </div>
                        <div className="mt-3 text-xs text-zinc-400 flex items-center gap-1">
                            <Info size={12} />
                            {t('sl.theta_approx')}: {thetaFromHold(customHoldValue).toFixed(3)} (Keep E2)
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                {(ester !== Ester.E2) && (
                    <div className={`space-y-2 ${(ester === Ester.EV && route === Route.sublingual) ? 'col-span-2' : ''}`}>
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

                {/* Hide E2 input for SL EV */}
                {!(ester === Ester.EV && route === Route.sublingual) && ester !== Ester.CPA && (
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

                {(ester === Ester.EV && route === Route.sublingual) && (
                    <div className="col-span-2">
                        <p className="text-xs text-zinc-500 mt-1">
                            {t('field.dose_e2')}: {e2Dose ? `${e2Dose} mg` : '--'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SublingualFields;
