import type { HydrationState } from '../../logic';
import { fill } from '../utils/regimenText';

export default function HydrationCard({
    hydration,
    pvRatio,
    addWater,
    onOpenSettings,
    t,
}: {
    hydration: HydrationState;
    pvRatio: number | null;
    addWater: (timeH: number, cups: number) => void;
    onOpenSettings: () => void;
    t: (key: string) => string;
}) {
    const cups = hydration.water.reduce((total, entry) => total + (Number.isFinite(entry.cups) ? entry.cups : 0), 0);
    const colorLabel = hydration.urineColor
        ? fill(t('hydration.urine_level'), { level: hydration.urineColor })
        : t('hydration.urine_color');

    return (
        <section
            aria-label={t('hydration.title')}
            data-pv-ratio={pvRatio ?? ''}
            className="mt-3 rounded-[var(--radius-lg)] border-(length:--hairline) border-[var(--border)] bg-[var(--surface-muted)] p-4"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-[var(--text)]">{t('hydration.title')}</h2>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {fill(t('hydration.cups'), { n: Number.isInteger(cups) ? cups : cups.toFixed(1) })} · {colorLabel}
                    </p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <button
                        type="button"
                        className="tap-target rounded-md border-(length:--hairline) border-[var(--border)] px-3 py-1.5 text-xs font-medium text-body hover:bg-[var(--surface-hover)]"
                        onClick={() => addWater(Math.floor(Date.now() / 3_600_000), 1)}
                    >
                        {t('hydration.add_cup')}
                    </button>
                    <button type="button" className="tap-target px-1 text-xs underline text-muted" onClick={onOpenSettings}>
                        {t('safety.notice.settings')}
                    </button>
                </div>
            </div>
        </section>
    );
}
