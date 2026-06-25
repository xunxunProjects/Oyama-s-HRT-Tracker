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
    patchWearDays: string;
    setPatchWearDays: (val: string) => void;
    route: Route;
}

const inputCls = "w-full p-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md focus:ring-1 focus:ring-[var(--color-m3-primary)]/30 focus:border-[var(--color-m3-primary)] outline-none text-gray-900 dark:text-gray-100 font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

// Common transdermal E2 patch nominal release rates (µg/day).
const RATE_PRESETS = [25, 37.5, 50, 75, 100];

// Common wear schedules. 3.5 d ≈ twice weekly, 7 d ≈ once weekly.
const WEAR_PRESETS: { days: number; labelKey: string }[] = [
    { days: 3.5, labelKey: 'patch.wear.twice_week' },
    { days: 7, labelKey: 'patch.wear.weekly' },
];

const formatNum = (val: number) => String(val);

const chipCls = (active: boolean) =>
    `inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${active
        ? 'border-[var(--color-m3-primary)] bg-[var(--color-m3-primary-container)] dark:bg-[var(--color-m3-primary-container)]/30 text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]'
        : 'border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]'
    }`;

const PatchFields: React.FC<PatchFieldsProps> = ({
    patchMode,
    setPatchMode,
    patchRate,
    setPatchRate,
    rawDose,
    onRawChange,
    patchWearDays,
    setPatchWearDays,
}) => {
    const { t } = useTranslation();

    const modes: { key: "dose" | "rate"; label: string }[] = [
        { key: "rate", label: t('field.patch_rate') },
        { key: "dose", label: t('field.patch_total') },
    ];

    const currentRate = parseFloat(patchRate);
    const currentWear = parseFloat(patchWearDays);

    return (
        <div className="space-y-4">
            {/* Mode underline tabs */}
            <div className="flex gap-5 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                {modes.map(m => (
                    <button
                        key={m.key}
                        type="button"
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
                    {/* Quick presets for common patch strengths */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {RATE_PRESETS.map(r => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => setPatchRate(String(r))}
                                className={chipCls(Number.isFinite(currentRate) && Math.abs(currentRate - r) < 1e-6)}
                            >
                                {formatNum(r)} µg/d
                            </button>
                        ))}
                    </div>
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

            {/* Wear duration — applies to both input modes. Empty means the patch
                stays on until a separate "remove" event is logged. */}
            <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1">{t('field.patch_wear')}</label>
                <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    value={patchWearDays}
                    onChange={e => setPatchWearDays(e.target.value)}
                    className={inputCls}
                    placeholder={t('field.patch_wear_placeholder')}
                    style={{ fontSize: '16px' }}
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {WEAR_PRESETS.map(w => (
                        <button
                            key={w.days}
                            type="button"
                            onClick={() => setPatchWearDays(String(w.days))}
                            className={chipCls(Number.isFinite(currentWear) && Math.abs(currentWear - w.days) < 1e-6)}
                        >
                            {formatNum(w.days)} d · {t(w.labelKey)}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setPatchWearDays("")}
                        className={chipCls(!patchWearDays.trim())}
                    >
                        {t('field.patch_until_removed')}
                    </button>
                </div>
                <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] pl-1">
                    {t('field.patch_wear_hint')}
                </p>
            </div>
        </div>
    );
};

export default PatchFields;
