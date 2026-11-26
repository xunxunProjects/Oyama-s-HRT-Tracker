import React, { useEffect, useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import type { HydrationState, UrineColorLevel } from '../../logic';
import { fill } from '../utils/regimenText';

interface HydrationSettingsProps {
    weight: number;
    hydration: HydrationState;
    addWater: (timeH: number, cups: number) => void;
    removeWater: (id: string) => void;
    setUrineColor: (level: UrineColorLevel | null) => void;
    setBodyFatPercent: (value: number | null) => void;
    setHydrationAlpha: (value: number) => void;
    onBack: () => void;
    t: (key: string, vars?: Record<string, string | number>) => string;
}

const URINE_LEVELS: UrineColorLevel[] = [1, 2, 3, 4, 5, 6, 7, 8];
const divider = 'border-b-(length:--hairline) border-[var(--border)]';

const formatTime = (timeH: number): string => new Date(timeH * 3_600_000).toLocaleString();

// A beta input page: the numbers below feed only the observation-layer curve.
// Nothing here edits a dose, a clearance, or the main result.
const HydrationSettings: React.FC<HydrationSettingsProps> = ({
    weight,
    hydration,
    addWater,
    removeWater,
    setUrineColor,
    setBodyFatPercent,
    setHydrationAlpha,
    onBack,
    t,
}) => {
    const [bodyFatStr, setBodyFatStr] = useState(
        hydration.bodyFatPercent === null ? '' : String(hydration.bodyFatPercent),
    );

    useEffect(() => {
        setBodyFatStr(hydration.bodyFatPercent === null ? '' : String(hydration.bodyFatPercent));
    }, [hydration.bodyFatPercent]);

    const commitBodyFat = () => {
        const trimmed = bodyFatStr.trim();
        if (trimmed === '') {
            setBodyFatPercent(null);
            return;
        }
        const value = Number(trimmed);
        if (!Number.isFinite(value)) {
            setBodyFatStr(hydration.bodyFatPercent === null ? '' : String(hydration.bodyFatPercent));
            return;
        }
        const clamped = Math.min(70, Math.max(3, value));
        setBodyFatPercent(clamped);
        setBodyFatStr(String(clamped));
    };

    const water = [...hydration.water].sort((a, b) => b.timeH - a.timeH);

    return (
        <div className="relative md:pb-32">
            <PageHeader title={t('hydration.title')} subtitle={t('hydration.subtitle')} onBack={onBack} />

            <div className={`${PAGE_COLUMN} mt-4 space-y-6`}>
                <section className={`flex items-center justify-between gap-4 py-4 ${divider}`}>
                    <p className="text-sm text-[var(--text-muted)]">{t('hydration.weight')}</p>
                    <p className="text-sm tabular-nums text-[var(--text)]">{weight} kg</p>
                </section>

                <section className={`py-4 ${divider}`}>
                    <label htmlFor="hydration-body-fat" className="block text-sm text-[var(--text)]">
                        {t('hydration.body_fat')}
                    </label>
                    <input
                        id="hydration-body-fat"
                        type="number"
                        inputMode="decimal"
                        min={3}
                        max={70}
                        step={0.1}
                        value={bodyFatStr}
                        onChange={e => setBodyFatStr(e.target.value)}
                        onBlur={commitBodyFat}
                        className="input-base mt-2 w-32 text-[var(--text)] tabular-nums"
                    />
                </section>

                <section className={`py-4 ${divider}`}>
                    <div className="flex items-center justify-between gap-4">
                        <label htmlFor="hydration-alpha" className="text-sm text-[var(--text)]">
                            {t('hydration.alpha')}
                        </label>
                        <span className="text-sm tabular-nums text-[var(--text-muted)]">
                            {hydration.alpha.toFixed(2)}
                        </span>
                    </div>
                    <input
                        id="hydration-alpha"
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={hydration.alpha}
                        onChange={e => setHydrationAlpha(Number(e.target.value))}
                        className="mt-3 w-full"
                    />
                    <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{t('hydration.alpha_desc')}</p>
                </section>

                <section className={`py-4 ${divider}`}>
                    <p className="text-sm text-[var(--text)]">{t('hydration.urine_color')}</p>
                    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('hydration.urine_color')}>
                        {URINE_LEVELS.map(level => (
                            <button
                                key={level}
                                type="button"
                                aria-pressed={hydration.urineColor === level}
                                aria-label={fill(t('hydration.urine_level'), { level })}
                                onClick={() => setUrineColor(hydration.urineColor === level ? null : level)}
                                className={`min-w-11 min-h-11 rounded-full border px-3 text-sm ${
                                    hydration.urineColor === level
                                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--text)]'
                                        : 'border-[var(--border)] text-[var(--text-muted)]'
                                }`}
                            >
                                {level}
                            </button>
                        ))}
                    </div>
                </section>

                <section className={`py-4 ${divider}`}>
                    <button
                        type="button"
                        onClick={() => addWater(Math.floor(Date.now() / 3_600_000), 1)}
                        className="btn-primary w-full"
                    >
                        {t('hydration.add_cup')}
                    </button>
                    {water.length === 0 ? (
                        <p className="mt-3 text-xs text-[var(--text-muted)]">{t('hydration.empty')}</p>
                    ) : (
                        <ul className="mt-3 space-y-2">
                            {water.map(event => (
                                <li key={event.id} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-[var(--text)]">
                                        {fill(t('hydration.cups'), { n: event.cups })}
                                        <span className="ms-2 text-xs text-[var(--text-muted)]">
                                            {formatTime(event.timeH)}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeWater(event.id)}
                                        className="min-h-11 px-2 text-xs text-[var(--text-muted)] hover:text-[var(--danger)]"
                                        aria-label={t('hydration.remove')}
                                    >
                                        {t('hydration.remove')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <p role="status" className="text-xs leading-relaxed text-[var(--warning)]">
                    {t('hydration.note')}
                </p>
            </div>
        </div>
    );
};

export default HydrationSettings;
