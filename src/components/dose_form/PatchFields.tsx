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

const inputCls = "w-full p-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md focus:ring-1 focus:ring-[var(--color-m3-primary)]/30 focus:border-[var(--color-m3-primary)] outline-none text-gray-900 dark:text-gray-100 font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

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

    const modes: { key: "dose" | "rate"; label: string }[] = [
        { key: "dose", label: t('field.patch_total') },
        { key: "rate", label: t('field.patch_rate') },
    ];

    return (
        <div className="space-y-4">
            {/* Mode underline tabs */}
            <div className="flex gap-5 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                {modes.map(m => (
                    <button
                        key={m.key}
                        onClick={() => setPatchMode(m.key)}
                        className={`text-sm pb-2 -mb-px border-b-2 ${patchMode === m.key
                            ? 'font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] border-[var(--color-m3-primary)]'
                            : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] border-transparent'
                        }`}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            <p className="text-xs text-amber-700 dark:text-amber-400">{t('beta.patch')}</p>

            {patchMode === "rate" ? (
                <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1">{t('field.patch_rate')}</label>
                    <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="1"
                        value={patchRate}
                        onChange={e => setPatchRate(e.target.value)}
                        className={inputCls}
                        placeholder="e.g. 50, 100"
                        style={{ fontSize: '16px' }}
                    />
                    <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] pl-1">
                        {t('field.patch_rate_hint')}
                    </p>
                </div>
            ) : (
                <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1">
                        {t('field.dose_raw')}
                    </label>
                    <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={rawDose} onChange={e => onRawChange(e.target.value)}
                        className={inputCls}
                        placeholder="0.0"
                        style={{ fontSize: '16px' }}
                    />
                </div>
            )}
        </div>
    );
};

export default PatchFields;
