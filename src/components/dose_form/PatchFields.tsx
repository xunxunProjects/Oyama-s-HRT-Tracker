import React from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import Tabs, { useSwitchAnimation } from '../Tabs';
import { refusedFieldProps } from './refusedField';

const MODE_ORDER = ['rate', 'dose'] as const;

interface PatchFieldsProps {
    patchMode: 'dose' | 'rate';
    setPatchMode: (val: 'dose' | 'rate') => void;
    patchRate: string;
    setPatchRate: (val: string) => void;
    rawDose: string;
    onRawChange: (val: string) => void;
    patchWearDays: string;
    setPatchWearDays: (val: string) => void;
    /** Save was refused for an empty or zero dose; see refusedFieldProps. */
    invalid?: boolean;
    errorId?: string;
}

const inputCls =
    'input-base w-full text-[var(--text)] font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

// Common transdermal E2 patch nominal release rates (µg/day).
const RATE_PRESETS = [25, 37.5, 50, 75, 100];

// Common wear schedules. 3.5 d ≈ twice weekly, 7 d ≈ once weekly.
const WEAR_PRESETS: { days: number; labelKey: string }[] = [
    { days: 3.5, labelKey: 'patch.wear.twice_week' },
    { days: 7, labelKey: 'patch.wear.weekly' },
];

const formatNum = (val: number) => String(val);

const chipCls = (active: boolean) =>
    `inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
        active
            ? 'border-[var(--accent-ink)] bg-[var(--accent-subtle)] dark:bg-[var(--accent-subtle)]/30 text-[var(--text)]'
            : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'
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
    invalid,
    errorId,
}) => {
    const { t } = useTranslation();

    const modes: { key: 'dose' | 'rate'; label: string }[] = [
        { key: 'rate', label: t('field.patch_rate') },
        { key: 'dose', label: t('field.patch_total') },
    ];
    const modeAnim = useSwitchAnimation(patchMode, MODE_ORDER);

    const currentRate = parseFloat(patchRate);
    const currentWear = parseFloat(patchWearDays);
    const rateId = React.useId();
    const rawId = React.useId();
    const wearId = React.useId();

    return (
        <div className="space-y-4">
            <Tabs tabs={modes.map(m => ({ id: m.key, label: m.label }))} value={patchMode} onChange={setPatchMode} />

            <p className="text-xs text-[var(--text-muted)]">{t('patch.setup_hint')}</p>

            <div key={patchMode} className={modeAnim}>
                {patchMode === 'rate' ? (
                    <div className="space-y-1.5">
                        <label htmlFor={rateId} className="field-label">
                            {t('field.patch_rate')}
                        </label>
                        <input
                            id={rateId}
                            {...refusedFieldProps(patchRate, invalid, errorId)}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="1"
                            value={patchRate}
                            onChange={e => setPatchRate(e.target.value)}
                            className={inputCls}
                            placeholder={t('patch.rate_placeholder')}
                            style={{ fontSize: '16px' }}
                        />
                        {/* Quick presets for common patch strengths. They are
                        the common rates themselves, so the line that used to
                        list the same five numbers under them is gone. */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {RATE_PRESETS.map(r => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setPatchRate(String(r))}
                                    className={chipCls(
                                        Number.isFinite(currentRate) && Math.abs(currentRate - r) < 1e-6,
                                    )}
                                >
                                    {formatNum(r)} µg/d
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1.5">
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
                            className={inputCls}
                            placeholder="0.0"
                            style={{ fontSize: '16px' }}
                        />
                    </div>
                )}
            </div>

            {/* Wear duration — applies to both input modes. Empty means the patch
                stays on until a separate "remove" event is logged. */}
            <div className="space-y-1.5">
                <label htmlFor={wearId} className="field-label">
                    {t('field.patch_wear')}
                </label>
                <input
                    id={wearId}
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
                            {t(w.labelKey)} ({formatNum(w.days)} d)
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setPatchWearDays('')}
                        className={chipCls(!patchWearDays.trim())}
                    >
                        {t('field.patch_until_removed')}
                    </button>
                </div>
                <p className="field-hint">{t('field.patch_wear_hint')}</p>
            </div>
        </div>
    );
};

export default PatchFields;
