import React from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Route } from '../../../logic';

interface PatchFieldsProps {
    patchMode: "dose" | "rate";
    setPatchMode: (val: "dose" | "rate") => void;
    patchRate: string;
    setPatchRate: (val: string) => void;
    rawDose: string;
    onRawChange: (val: string) => void;
    route: Route;
}

const PatchFields: React.FC<PatchFieldsProps> = ({
    patchMode,
    setPatchMode,
    patchRate,
    setPatchRate,
    rawDose,
    onRawChange,
    route
}) => {
    const { t } = useTranslation();

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <div className="p-1 bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-md)] flex">
                    <button
                        onClick={() => setPatchMode("dose")}
                        className={`flex-1 py-2 text-sm font-bold rounded-[var(--radius-sm)] transition-all ${patchMode === "dose" ? "bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] shadow text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]" : "text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]"}`}
                    >
                        {t('field.patch_total')}
                    </button>
                    <button
                        onClick={() => setPatchMode("rate")}
                        className={`flex-1 py-2 text-sm font-bold rounded-[var(--radius-sm)] transition-all ${patchMode === "rate" ? "bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] shadow text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]" : "text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]"}`}
                    >
                        {t('field.patch_rate')}
                    </button>
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-3 rounded-[var(--radius-md)]">
                    {t('beta.patch')}
                </div>
            </div>

            {patchMode === "rate" ? (
                <div className="space-y-2">
                    <label className="block text-sm font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('field.patch_rate')}</label>
                    <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="1"
                        value={patchRate}
                        onChange={e => setPatchRate(e.target.value)}
                        className="w-full p-4 bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-[var(--radius-lg)] focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-teal-400 outline-none font-mono text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] font-bold"
                        placeholder="e.g. 50, 100"
                    />
                    <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                        {t('field.patch_rate_hint')}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                        <label className="block text-xs font-bold text-[var(--color-m3-accent)] uppercase tracking-wider">
                            {t('field.dose_raw')}
                        </label>
                        <input
                            type="number" inputMode="decimal"
                            min="0"
                            step="0.001"
                            value={rawDose} onChange={e => onRawChange(e.target.value)}
                            className="w-full p-4 bg-[var(--color-m3-accent-container)] dark:bg-rose-900/20 border border-[var(--color-m3-outline-variant)] dark:border-rose-900/30 rounded-[var(--radius-lg)] focus:ring-2 focus:ring-[var(--color-m3-accent)]/30 outline-none font-bold text-[var(--color-m3-accent)] dark:text-rose-400 font-mono"
                            placeholder="0.0"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatchFields;
