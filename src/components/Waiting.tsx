import React from 'react';
import { useElementSize } from '../hooks/useElementSize';
import { useTranslation } from '../contexts/LanguageContext';

/* Waiting, drawn the way this app draws everything else it measures: as ticks
   on a rail (LevelRail). The ticks write out the curve a dose follows in the
   blood (a quick rise, a peak, a long tail), left to right as it's read,
   hold it a moment, and let it wash away from the same end. Then again, for
   as long as the wait lasts. It stands in for the spinner wherever the app
   used to turn one.

   Three sizes of the one mark:
   - WaitMark: icon sized, beside a button's words or in a row's icon slot.
   - Waiting: a short rail before a line of text ("Loading…").
   - Waiting wide: the whole column, where a page is still to come.

   Nothing shows for the first 300ms, so a quick answer never flashes it, and
   with reduced motion the curve simply stands there, drawn (motion.css). */

/** A tick at rest is a stub this tall, as a share of the rail's height. */
const REST = 0.16;
/** The wait before anything shows. */
const QUIET_MS = 300;

/** Too few ticks to sample a curve from: its shape, set by hand. */
const MARK = [0.45, 1, 0.72, 0.5, 0.34];

/** Concentration after one dose (Bateman): absorbed fast, cleared slowly.
 *  Heights for n ticks, the tallest 1. */
function curve(n: number): number[] {
    if (n <= MARK.length) return MARK.slice(0, n);
    const KA = 8;
    const KE = 1.6;
    // A short rail shows less of the tail, so its last ticks aren't all stubs.
    const SPAN = n < 24 ? 1.5 : 2.2;
    const raw = Array.from({ length: n }, (_, i) => {
        const t = (i / (n - 1)) * SPAN;
        return Math.exp(-KE * t) - Math.exp(-KA * t);
    });
    const top = Math.max(...raw);
    return raw.map(v => v / top);
}

function Ticks({ count, sweep, peak }: { count: number; sweep: number; peak?: boolean }) {
    const heights = React.useMemo(() => curve(count), [count]);
    const top = heights.indexOf(Math.max(...heights));
    return (
        <>
            {heights.map((h, i) => {
                const tall = Math.max(REST, h);
                return (
                    <span
                        key={i}
                        className={`wait-tick ${peak && i === top ? 'text-[var(--accent-ink)]' : ''}`}
                        style={
                            {
                                height: `${(tall * 100).toFixed(1)}%`,
                                '--rest': (REST / tall).toFixed(3),
                                animationDelay: `${Math.round(QUIET_MS + (i / count) * sweep)}ms`,
                            } as React.CSSProperties
                        }
                    />
                );
            })}
        </>
    );
}

/** The busy mark, where an icon would go. Takes the colour of its text. */
export const WaitMark: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
    <span
        className={`wait-rail wait-mark shrink-0 ${className}`}
        style={{
            width: `${size / 16}rem`,
            height: `${size / 16}rem`,
            // An icon's air: the curve stands on the baseline of the words
            // beside it, not on the floor of its box.
            padding: `${(size * 0.14) / 16}rem ${(size * 0.06) / 16}rem ${(size * 0.16) / 16}rem`,
        }}
        aria-hidden="true"
    >
        <Ticks count={MARK.length} sweep={330} />
    </span>
);

/** One tick to about this many pixels, the rail's own grain (LevelRail). */
const TICK_PITCH = 7;

/**
 * A line that says something is on its way. `wide` gives the curve the whole
 * column and sets the words under it, for a page that hasn't arrived.
 */
export const Waiting: React.FC<{ children?: React.ReactNode; wide?: boolean; className?: string }> = ({
    children,
    wide,
    className = '',
}) => {
    const { t } = useTranslation();
    const words = children ?? t('common.loading');
    const [row, setRow] = React.useState<HTMLSpanElement | null>(null);
    const { width } = useElementSize(wide ? row : null);
    const count = width ? Math.min(96, Math.max(24, Math.round(width / TICK_PITCH))) : 48;

    if (wide)
        return (
            <div role="status" className={`wait-quiet select-none text-[var(--text-muted)] ${className}`}>
                <span ref={setRow} dir="ltr" className="wait-rail h-8 w-full" aria-hidden="true">
                    <Ticks count={count} sweep={900} peak />
                </span>
                <span className="mt-3 block text-xs font-medium">{words}</span>
            </div>
        );

    return (
        <p
            role="status"
            className={`wait-quiet flex items-center gap-2.5 text-sm text-[var(--text-muted)] ${className}`}
        >
            <span dir="ltr" className="wait-rail h-3.5 w-12 shrink-0" aria-hidden="true">
                <Ticks count={14} sweep={560} peak />
            </span>
            {words}
        </p>
    );
};

export default Waiting;
