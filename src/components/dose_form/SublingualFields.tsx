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
                    <label className="block text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">{t('field.sl_absorption')}</label>
                    <button
                        onClick={() => setUseCustomTheta(!useCustomTheta)}
                        className="text-xs font-bold text-[var(--color-m3-primary)] dark:text-teal-400 transition"
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
                                    className={`relative p-3 rounded-[var(--radius-md)] border-2 text-left transition-all ${active
                                        ? 'border-[var(--color-m3-primary)] bg-[var(--color-m3-primary-container)] dark:bg-teal-900/20 ring-2 ring-[var(--color-m3-primary-container)] dark:ring-teal-900/30'
                                        : 'border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] hover:border-[var(--color-m3-primary)] dark:hover:border-teal-400 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-high)]'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className={`font-bold ${active ? 'text-[var(--color-m3-primary)] dark:text-teal-400' : 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]'}`}>
                                            {t(`sl.tier.${tierKey}`)}
                                        </div>
                                        {active && <Check size={16} className="text-[var(--color-m3-primary)] dark:text-teal-400" />}
                                    </div>
                                    <div className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                        {tierParams.hold} min hold
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] p-4 rounded-[var(--radius-md)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                        <div className="flex items-center gap-2 mb-2">
                            <Clock size={16} className="text-[var(--color-m3-primary)] dark:text-teal-400" />
                            <label className="text-sm font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{t('sl.hold_time_min')}</label>
                        </div>
                        <div className="flex gap-4 items-center">
                            <input
                                type="number" inputMode="decimal"
                                min="1" max="60"
                                value={customHoldInput}
                                onChange={e => handleCustomHoldChange(e.target.value)}
                                className="w-24 p-3 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-[var(--radius-md)] font-bold text-center focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] outline-none text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]"
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
                                    className="w-full accent-[var(--color-m3-primary)]"
                                />
                            </div>
                        </div>
                        <div className="mt-3 text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] flex items-center gap-1">
                            <Info size={12} />
                            {t('sl.theta_approx')}: {thetaFromHold(customHoldValue).toFixed(3)} (Keep E2)
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                {(ester !== Ester.E2) && (
                    <div className={`space-y-2 ${(ester === Ester.EV && route === Route.sublingual) ? 'col-span-2' : ''}`}>
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

                {!(ester === Ester.EV && route === Route.sublingual) && ester !== Ester.CPA && (
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

                {(ester === Ester.EV && route === Route.sublingual) && (
                    <div className="col-span-2">
                        <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-1">
                            {t('field.dose_e2')}: {e2Dose ? `${e2Dose} mg` : '--'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SublingualFields;
