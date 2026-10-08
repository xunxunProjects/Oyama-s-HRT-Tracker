import React from 'react';
import { useElementSize } from '../hooks/useElementSize';

interface LevelRailProps {
    value: number;
    /** The reference band, in the reading's own unit. Same band the chart shades. */
    band: { low: number; high: number };
    /** Ends of the scale. Spaced logarithmically, so both must be above zero. */
    domain: [number, number];
    /** Status text flown from the top of the current tick. */
    label?: string;
    /** Text colour class for the current tick and its label, from currentStatus. */
    tone?: string;
}

// Roughly one tick per this many pixels, so the scale keeps the same grain on
// a phone and across a wide desktop column.
const TICK_PITCH = 7;
// Delay between neighbouring ticks as the scale rises in, left to right — the
// same direction the chart below draws its line on.
const WAVE_MS = 7;

// "You are here" on a fine tick scale, read like an instrument rather than a
// progress bar: the target band is the run of ticks tinted terracotta, the
// ticks up to the current reading are inked in, and the reading itself is the
// one tall tick in the status colour with the status flown from its top. The
// status used to sit on its own in the header's corner, disconnected from the
// number it described and hidden on phones.
//
// Log-spaced because hormone levels are read in ratios: 50 → 100 is as big a
// move as 400 → 800, and a linear scale let a single high reading squash the
// whole target band against the left edge.
const LevelRail: React.FC<LevelRailProps> = ({ value, band, domain, label, tone = '' }) => {
    const [row, setRow] = React.useState<HTMLDivElement | null>(null);
    const { width } = useElementSize(row);
    const count = width ? Math.min(96, Math.max(24, Math.round(width / TICK_PITCH))) : 48;
    const last = count - 1;

    const [lo, hi] = [Math.log10(domain[0]), Math.log10(domain[1])];
    const at = (v: number) => Math.min(1, Math.max(0, (Math.log10(Math.max(v, domain[0])) - lo) / (hi - lo)));
    const cur = Math.round(at(value) * last);
    const bandL = Math.ceil(at(band.low) * last);
    const bandR = Math.floor(at(band.high) * last);

    // Centre of tick i. Each tick sits in a 2px slot spread edge to edge.
    const x = (i: number) => `calc(1px + ${(i / last).toFixed(4)} * (100% - 2px))`;

    return (
        // A scale reads left to right whatever the page direction.
        <div dir="ltr" className="relative select-none pt-5 pb-[18px]" aria-hidden="true">
            {/* The label's own anchor slides from its left edge to its right edge
                along the scale, so it always sits over the current tick and never
                runs off either end. Lands once the wave has reached its tick. */}
            {label && (
                <span
                    className={`rail-label absolute top-0 whitespace-nowrap text-xs font-semibold leading-none ${tone}`}
                    style={{
                        left: x(cur),
                        transform: `translateX(-${((cur / last) * 100).toFixed(2)}%)`,
                        animationDelay: `${cur * WAVE_MS + 180}ms`,
                    }}
                >
                    {label}
                </span>
            )}

            <div ref={setRow} className="flex h-[18px] items-end justify-between">
                {Array.from({ length: count }, (_, i) => {
                    const reached = i <= cur;
                    const look = i === cur
                        ? `h-[18px] w-[3px] bg-current ${tone}`
                        : i >= bandL && i <= bandR
                            ? `h-[11px] w-[1.5px] ${reached
                                ? 'bg-[var(--accent-ink)]'
                                : 'bg-[var(--accent-ink)]/40'}`
                            : `h-2 w-[1.5px] ${reached
                                ? 'bg-[var(--text-muted)]'
                                : 'bg-[var(--border)]'}`;
                    return (
                        <span key={i} className="flex w-0.5 justify-center">
                            <span className={`rail-tick rounded-full ${look}`} style={{ animationDelay: `${i * WAVE_MS}ms` }} />
                        </span>
                    );
                })}
            </div>

            {([[bandL, band.low], [bandR, band.high]] as const).map(([i, v]) => (
                <span
                    key={v}
                    className="rail-label absolute bottom-0 -translate-x-1/2 text-[0.75rem] font-medium leading-none tabular-nums text-[var(--text-muted)]"
                    style={{ left: x(i), animationDelay: `${i * WAVE_MS + 120}ms` }}
                >
                    {v}
                </span>
            ))}
        </div>
    );
};

export default LevelRail;
