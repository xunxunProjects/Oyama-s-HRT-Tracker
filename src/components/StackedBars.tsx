import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { fill } from '../utils/regimenText';

/* Oyama Journal's column chart: one column a day or a month, read by
   pointing or by touch. Here it counts doses, stacked by medicine. */

export interface Bucket {
    label: string;
    /** What the bucket is: "Nov 2025", "Tue Nov 25 2025". */
    span: string;
    parts: { key: string; value: number; color: string }[];
    /** Doses in it, and each medicine's count of them. */
    total: number;
    counts: { key: string; n: number; color: string }[];
}

/** Columns, each stacked in the colours of what made it up. Point at one,
 *  or press and slide across them, to read it: its span, its count and what
 *  made it up; the rest step back. Arrow keys move along them too.
 *  `count` words a column's total ("3 sessions"), and `what` the chart for
 *  a screen reader. */
export function StackedBars({
    buckets,
    names,
    idle,
    count,
    what,
    empty,
}: {
    buckets: Bucket[];
    names: (key: string) => string;
    idle?: ReactNode;
    count?: (n: number) => string;
    what?: string;
    empty?: string;
}) {
    const { t } = useTranslation();
    count ??= n => (n === 1 ? t('stats.one_dose') : fill(t('stats.n_doses'), { n }));
    what ??= t('stats.over_time');
    empty ??= t('stats.nothing_logged');
    const [sel, setSel] = useState<number | null>(null);
    const pressing = useRef(false);
    const max = Math.max(1, ...buckets.map(b => b.total));
    const every = buckets.length > 16 ? Math.ceil(buckets.length / 8) : 1;
    const indexAt = (e: React.PointerEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        return Math.min(buckets.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * buckets.length)));
    };
    const b = sel === null ? null : buckets[sel];
    return (
        <div>
            <div className="mb-2 min-h-[2.75rem] text-xs" aria-live="polite">
                {b ? (
                    <>
                        <p className="font-medium text-[var(--text)]">{`${b.span}: ${count(b.total)}`}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[var(--text-muted)]">
                            {b.counts.length
                                ? b.counts.map(c => (
                                      <span key={c.key} className="inline-flex items-center gap-1.5">
                                          <span className="font-medium" style={{ color: c.color }}>
                                              {names(c.key)}
                                          </span>
                                          {c.n}
                                      </span>
                                  ))
                                : empty}
                        </p>
                    </>
                ) : (
                    <p className="text-[var(--text-muted)]">{idle ?? t('stats.tap_bar')}</p>
                )}
            </div>
            <div
                role="slider"
                tabIndex={0}
                aria-label={what}
                aria-valuemin={0}
                aria-valuemax={buckets.length - 1}
                aria-valuenow={sel ?? undefined}
                aria-valuetext={b ? `${b.span}, ${count(b.total)}` : undefined}
                className="flex items-end gap-[3px] h-28 cursor-pointer rounded-[4px] outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-ink)]"
                style={{ touchAction: 'pan-y' }}
                onPointerDown={e => {
                    pressing.current = true;
                    const k = indexAt(e);
                    setSel(cur => (cur === k && e.pointerType !== 'mouse' ? null : k));
                }}
                onPointerMove={e => {
                    if (e.pointerType === 'mouse' || pressing.current) setSel(indexAt(e));
                }}
                onPointerUp={() => {
                    pressing.current = false;
                }}
                onPointerLeave={e => {
                    if (e.pointerType === 'mouse') setSel(null);
                }}
                onKeyDown={e => {
                    if (e.key === 'ArrowRight') setSel(k => Math.min(buckets.length - 1, (k ?? -1) + 1));
                    else if (e.key === 'ArrowLeft') setSel(k => Math.max(0, (k ?? buckets.length) - 1));
                    else if (e.key === 'Escape') setSel(null);
                    else return;
                    e.preventDefault();
                }}
                onBlur={() => setSel(null)}
            >
                {buckets.map((bk, k) => (
                    <div
                        key={k}
                        className="flex-1 min-w-0 flex flex-col-reverse gap-px overflow-hidden rounded-[3px] transition-[opacity,transform] duration-300 ease-out"
                        style={{
                            height: bk.total ? `${Math.max(4, (bk.total / max) * 100)}%` : '2px',
                            background: bk.total ? undefined : 'var(--chart-grid)',
                            opacity: sel === null || sel === k ? 1 : 0.32,
                            transform: sel === k ? 'scaleX(1.12)' : undefined,
                        }}
                    >
                        {bk.parts.map(p => (
                            <div key={p.key} style={{ flex: `${p.value} 1 0%`, background: p.color }} />
                        ))}
                    </div>
                ))}
            </div>
            <div className="flex gap-[3px] mt-1.5" aria-hidden="true">
                {buckets.map((bk, k) => (
                    <span
                        key={k}
                        className={`flex-1 min-w-0 text-center text-[10px] leading-none tabular-nums overflow-visible whitespace-nowrap ${sel === k ? 'text-[var(--text)] font-semibold' : 'text-[var(--chart-axis)]'}`}
                    >
                        {k % every === 0 || sel === k ? bk.label : ''}
                    </span>
                ))}
            </div>
        </div>
    );
}
