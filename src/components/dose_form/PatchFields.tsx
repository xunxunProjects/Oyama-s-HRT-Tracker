import React from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Route } from '../../../logic'; // Ester not used for patch (always E2)

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
                <div className="p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex">
                    <button
                        onClick={() => setPatchMode("dose")}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${patchMode === "dose" ? "bg-white dark:bg-zinc-700 shadow text-zinc-800 dark:text-zinc-200" : "text-zinc-500 dark:text-zinc-400"}`}
                    >
                        {t('field.patch_total')}
                    </button>
                    <button
                        onClick={() => setPatchMode("rate")}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${patchMode === "rate" ? "bg-white dark:bg-zinc-700 shadow text-zinc-800 dark:text-zinc-200" : "text-zinc-500 dark:text-zinc-400"}`}
                    >
                        {t('field.patch_rate')}
                    </button>
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-3 rounded-xl">
                    {t('beta.patch')}
                </div>
            </div>

            {patchMode === "rate" ? (
                <div className="space-y-2">
                    <label className="block text-sm font-bold text-zinc-700">{t('field.patch_rate')}</label>
                    <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="1"
                        value={patchRate}
                        onChange={e => setPatchRate(e.target.value)}
                        className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-pink-300/50 outline-none font-mono text-zinc-900 dark:text-white font-bold"
                        placeholder="e.g. 50, 100"
                    />
                    <p className="text-xs text-zinc-400">
                        {t('field.patch_rate_hint')}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                        <label className="block text-xs font-bold text-pink-400 uppercase tracking-wider">
                            {t('field.dose_raw')}
                        </label>
                        <input
                            type="number" inputMode="decimal"
                            min="0"
                            step="0.001"
                            value={rawDose} onChange={e => onRawChange(e.target.value)}
                            className="w-full p-4 bg-pink-50/50 dark:bg-pink-900/20 border border-pink-100 dark:border-pink-900/30 rounded-2xl focus:ring-2 focus:ring-pink-300/50 outline-none font-bold text-pink-500 dark:text-pink-400 font-mono"
                            placeholder="0.0"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatchFields;
