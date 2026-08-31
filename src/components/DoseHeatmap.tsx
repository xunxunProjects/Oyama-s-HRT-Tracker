import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { DoseEvent, Route } from '../../logic';
import { LOCALE_MAP, createDayLabelFormatter, toDayKey } from '../utils/helpers';
import { useElementSize } from '../hooks/useElementSize';

/** Local midnight of whatever day a moment falls on. */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** `d` shifted by whole days, through the calendar rather than through
 *  milliseconds, so a DST boundary doesn't slide the grid by an hour. */
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type DayTotals = { count: number; mg: Map<string, number> };
type Cell = { col: number; row: number; date: Date; key: string; count: number; mg: Map<string, number> | null };

/**
 * A GitHub-contributions-style calendar of dosing days: one square per day, a
 * column per week, shaded by how many doses were logged that day.
 *
 * Intensity is a *count*, not an amount. Milligrams of estradiol, of CPA and of
 * a testosterone ester don't share a scale, so summing them into one number to
 * shade a square would be a category error; the tooltip breaks the day down by
 * compound instead, which is where an amount can be read honestly.
 *
 * The ramp is chosen so its grayscale projection stays monotonic — the mono
 * theme is a page-wide `grayscale(1)`, and a ramp picked on hue alone collapses
 * under it. That is why this component, unlike the chart beside it, needs no
 * `isMono` branch: nothing here is distinguished by colour alone, only by
 * lightness, and lightness survives the filter.
 */
const DoseHeatmap = ({
    events,
    isDarkMode = false,
    className = '',
}: {
    events: DoseEvent[];
    isDarkMode?: boolean;
    className?: string;
}) => {
    const { t, lang } = useTranslation();
    const locale = LOCALE_MAP[lang] || 'en-US';

    const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
    const { width } = useElementSize(wrapEl);
    // The hovered *day*, not a snapshot of its cell: the grid is rebuilt whenever
    // doses change (cloud sync lands one while the page is open), the window is
    // resized or midnight passes, and a captured cell would go on displaying the
    // counts it held at hover time — and, after a resize, at a column index that
    // no longer exists. Holding the key means the tooltip tracks the data and
    // clears itself when the day scrolls out of the window.
    const [hoverKey, setHoverKey] = useState<string | null>(null);

    // The grid ends on "today", so it has to notice midnight passing. Polled
    // rather than scheduled, but the state only changes when the day actually
    // turns over, so this is one comparison a minute and no re-render.
    const [today, setToday] = useState(() => startOfDay(new Date()));
    useEffect(() => {
        const id = setInterval(() => {
            const next = startOfDay(new Date());
            setToday(prev => (prev.getTime() === next.getTime() ? prev : next));
        }, 60000);
        return () => clearInterval(id);
    }, []);

    // Same terracotta family as the chart. Empty is the chart's grid neutral;
    // the four filled steps climb from a light tint to a deep burnt shade.
    const c = isDarkMode
        ? { empty: '#2E2C28', axis: '#7A776F', ring: '#D8927C', levels: ['#4E3428', '#7B4C37', '#AC6A4C', '#D8927C'] }
        : { empty: '#E7E4DD', axis: '#A8A59E', ring: '#CC785C', levels: ['#F0CDB8', '#DFA184', '#CC785C', '#9E4F2E'] };

    // The plot is laid out in raw SVG units, so unlike the rest of the UI it
    // does not follow the root font size. Reading that size back keeps the
    // squares and their labels in proportion when the desktop scale steps up.
    const ui = useMemo(() => {
        if (typeof window === 'undefined') return 1;
        const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return Number.isFinite(px) && px > 0 ? px / 16 : 1;
    }, [width]);

    const gutter = 20 * ui;   // weekday labels down the left
    const header = 14 * ui;   // month labels across the top
    const gap = 3 * ui;

    // How many weeks fit, then the square size that divides that span exactly —
    // so the grid's right edge lands flush with the column it sits in rather
    // than trailing a ragged remainder.
    const geom = useMemo(() => {
        const avail = width - gutter;
        if (avail <= 0) return { weeks: 0, cell: 0 };
        const weeks = clamp(Math.floor((avail + gap) / (12 * ui + gap)), 4, 53);
        const cell = clamp((avail - gap * (weeks - 1)) / weeks, 7 * ui, 15 * ui);
        return { weeks, cell };
    }, [width, gutter, gap, ui]);
    const { weeks, cell } = geom;

    // Doses per calendar day. A patch removal is the end of a dose, not one of
    // its own, so it doesn't light a square.
    const byDay = useMemo(() => {
        const m = new Map<string, DayTotals>();
        for (const e of events) {
            if (e.route === Route.patchRemove) continue;
            const at = new Date(e.timeH * 3600000);
            if (Number.isNaN(at.getTime())) continue;
            const key = toDayKey(at);
            let rec = m.get(key);
            if (!rec) { rec = { count: 0, mg: new Map() }; m.set(key, rec); }
            rec.count += 1;
            if (e.doseMG > 0) rec.mg.set(e.ester, (rec.mg.get(e.ester) ?? 0) + e.doseMG);
        }
        return m;
    }, [events]);

    // Columns of days, oldest week first, ending on the week that holds today.
    // Weeks run Monday-first: six of the app's seven locales write them that
    // way, and the choice is invisible except in the labels down the left.
    const columns = useMemo<Cell[][]>(() => {
        if (weeks <= 0) return [];
        const mondayOffset = (today.getDay() + 6) % 7;
        const first = addDays(today, -mondayOffset - (weeks - 1) * 7);
        const out: Cell[][] = [];
        for (let col = 0; col < weeks; col++) {
            const days: Cell[] = [];
            for (let row = 0; row < 7; row++) {
                const date = addDays(first, col * 7 + row);
                if (date.getTime() > today.getTime()) continue;  // the rest of this week hasn't happened
                const key = toDayKey(date);
                const rec = byDay.get(key);
                days.push({ col, row, date, key, count: rec?.count ?? 0, mg: rec?.mg ?? null });
            }
            out.push(days);
        }
        return out;
    }, [weeks, today, byDay]);

    const byKey = useMemo(() => {
        const m = new Map<string, Cell>();
        for (const column of columns) for (const d of column) m.set(d.key, d);
        return m;
    }, [columns]);
    const hover = hoverKey ? byKey.get(hoverKey) ?? null : null;

    const { total, days, busiest } = useMemo(() => {
        let total = 0, days = 0, busiest = 0;
        for (const column of columns) for (const d of column) {
            total += d.count;
            days += 1;
            if (d.count > busiest) busiest = d.count;
        }
        return { total, days, busiest };
    }, [columns]);

    // Four steps spread over the busiest day, with a floor of four so a routine
    // of one-to-four doses maps straight onto the four shades. Without the floor
    // a once-a-day regimen would paint every square the darkest shade.
    const ceiling = Math.max(4, busiest);
    const levelOf = (count: number) => (count <= 0 ? 0 : Math.min(4, Math.ceil((count / ceiling) * 4)));

    // A month label sits on the first column whose week ends in that month, and
    // only if there is room since the last one — the grid is far narrower than
    // GitHub's and unspaced labels would run together.
    const monthLabels = useMemo(() => {
        const fmt = new Intl.DateTimeFormat(locale, { month: 'short' });
        const out: { col: number; label: string }[] = [];
        let last = -99;
        let prevMonth = -1;
        for (let col = 0; col < columns.length; col++) {
            const monday = columns[col][0]?.date;
            if (!monday) continue;
            const endOfWeek = addDays(monday, 6);
            const month = endOfWeek.getMonth();
            if (month !== prevMonth) {
                prevMonth = month;
                if (col > 0 && col - last >= 3 && col <= columns.length - 2) {
                    out.push({ col, label: fmt.format(endOfWeek) });
                    last = col;
                }
            }
        }
        return out;
    }, [columns, locale]);

    // 2024-01-01 was a Monday, so day n of that week is row n.
    const weekdayLabels = useMemo(() => {
        const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
        return [0, 2, 4].map(row => ({ row, label: fmt.format(new Date(2024, 0, 1 + row)) }));
    }, [locale]);

    const dayLabel = useMemo(() => createDayLabelFormatter(lang), [lang]);
    const doseLabel = (n: number) =>
        n === 1 ? t('heatmap.dose_one') : t('heatmap.doses').replace('{n}', String(n));
    // The grid shows no heading or tally of its own; this is the whole of what a
    // screen reader gets before the per-day detail in the tooltip.
    const summary = (total === 1 ? t('heatmap.summary_one') : t('heatmap.summary').replace('{n}', String(total)))
        .replace('{d}', String(days));

    // A finger has no "leave", so a tapped tooltip is dismissed by the next press
    // anywhere outside the grid. Capture phase, so a press on the grid itself is
    // seen here first and left alone for the tap handler to re-target.
    useEffect(() => {
        if (!hoverKey || !wrapEl) return;
        const dismiss = (e: PointerEvent) => {
            if (!wrapEl.contains(e.target as Node)) setHoverKey(null);
        };
        window.addEventListener('pointerdown', dismiss, true);
        return () => window.removeEventListener('pointerdown', dismiss, true);
    }, [hoverKey, wrapEl]);

    const todayKey = toDayKey(today);
    const step = cell + gap;
    const svgW = weeks > 0 ? gutter + weeks * cell + (weeks - 1) * gap : 0;
    const svgH = header + 7 * cell + 6 * gap;
    const x = (col: number) => gutter + col * step;
    const y = (row: number) => header + row * step;

    // Hit-test from the pointer rather than hanging a handler off each of up to
    // 371 squares. The gap between squares reads as empty space, not as the
    // nearest neighbour, so a pointer between two cells clears the tooltip.
    const cellAt = (clientX: number, clientY: number, target: Element): Cell | null => {
        if (step <= 0) return null;
        const rect = target.getBoundingClientRect();
        const px = clientX - rect.left - gutter;
        const py = clientY - rect.top - header;
        const col = Math.floor(px / step);
        const row = Math.floor(py / step);
        if (col < 0 || col >= columns.length || row < 0 || row > 6) return null;
        if (px - col * step > cell || py - row * step > cell) return null;
        return columns[col].find(d => d.row === row) ?? null;
    };

    const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        if (e.pointerType !== 'mouse') return;   // touch commits on tap, below
        setHoverKey(cellAt(e.clientX, e.clientY, e.currentTarget)?.key ?? null);
    };
    const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        setHoverKey(cellAt(e.clientX, e.clientY, e.currentTarget)?.key ?? null);
    };
    // Only a mouse leaving means "done looking". A finger lifting fires this
    // too, and clearing on it would make the tooltip flash and vanish — so a
    // tapped tooltip is dismissed by the next press outside instead.
    const onPointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
        if (e.pointerType === 'mouse') setHoverKey(null);
    };

    const hoverMg = hover?.mg ? [...hover.mg.entries()].filter(([, mg]) => mg > 0) : [];

    // The tooltip is as tall as the day is busy — two lines plus one per
    // compound — so where it fits can't be decided from the row index. Measured
    // in a layout effect, before paint, so the corrected placement is the first
    // one drawn. Without this a four-line tooltip on rows 2-4 reached back over
    // the header above the grid.
    const [tipEl, setTipEl] = useState<HTMLDivElement | null>(null);
    const [tip, setTip] = useState({ w: 0, h: 0 });
    useLayoutEffect(() => {
        if (!tipEl) return;
        const r = tipEl.getBoundingClientRect();
        setTip(prev => (Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5 ? prev : { w: r.width, h: r.height }));
    });

    // Above the cell when it fits there, below otherwise — and below on the very
    // first hover, before anything has been measured, that being the direction
    // with the whole empty column beneath the grid to spill into.
    const tipBelow = hover != null && (tip.h === 0 || y(hover.row) - 6 - tip.h < 0);
    const tipTop = hover == null ? 0 : tipBelow ? y(hover.row) + cell + 6 : y(hover.row) - 6 - tip.h;
    // Right-aligned to the cell once a left-aligned tooltip would run past the
    // grid, then clamped so neither edge can leave it.
    const tipLeft = hover == null ? 0 : clamp(
        x(hover.col) + tip.w > svgW ? x(hover.col) + cell - tip.w : x(hover.col),
        0,
        Math.max(0, svgW - tip.w),
    );

    return (
        <div className={`w-full ${className}`}>
            <div ref={setWrapEl} className="relative select-none touch-pan-y">
                {weeks > 0 && (
                    <svg
                        width={svgW}
                        height={svgH}
                        /* max-w-full so a stale measurement can never widen the
                           page; the grid crops rather than pushing a scrollbar. */
                        className="block max-w-full"
                        role="img"
                        aria-label={`${t('heatmap.title')} — ${summary}`}
                        style={{ touchAction: 'pan-y' }}
                        onPointerMove={onPointerMove}
                        onPointerDown={onPointerDown}
                        onPointerLeave={onPointerLeave}
                        onPointerCancel={() => setHoverKey(null)}
                    >
                        {monthLabels.map(m => (
                            <text
                                key={`mo-${m.col}`}
                                className="chart-appear"
                                x={x(m.col)} y={header - 5 * ui}
                                fontSize={9 * ui} fill={c.axis}
                            >
                                {m.label}
                            </text>
                        ))}

                        {weekdayLabels.map(w => (
                            <text
                                key={`wd-${w.row}`}
                                className="chart-appear"
                                x={gutter - 6 * ui} y={y(w.row) + cell / 2 + 3 * ui}
                                textAnchor="end" fontSize={9 * ui} fill={c.axis}
                            >
                                {w.label}
                            </text>
                        ))}

                        {/* A column at a time, so the grid fills in left to right
                            the way the curve beside it draws itself on. */}
                        {columns.map((column, col) => (
                            <g
                                key={`col-${col}`}
                                className="chart-appear"
                                style={{ animationDelay: `${Math.round((col / Math.max(1, weeks)) * 420)}ms` }}
                            >
                                {column.map(d => {
                                    const level = levelOf(d.count);
                                    const isToday = d.key === todayKey;
                                    const isHover = d.key === hoverKey;
                                    return (
                                        <rect
                                            key={d.key}
                                            x={x(col)} y={y(d.row)}
                                            width={cell} height={cell}
                                            rx={Math.max(2, cell * 0.22)}
                                            fill={level === 0 ? c.empty : c.levels[level - 1]}
                                            stroke={isHover || isToday ? c.ring : 'none'}
                                            strokeWidth={1}
                                            /* Empty days sit back a little. Fixed, not
                                               keyed off hover — an outline is the hover
                                               affordance; the fill shifting under the
                                               pointer as well just reads as a flicker. */
                                            opacity={level > 0 ? 1 : 0.85}
                                        />
                                    );
                                })}
                            </g>
                        ))}
                    </svg>
                )}

                {hover && (
                    <div
                        ref={setTipEl}
                        className="absolute z-20 pointer-events-none px-2.5 py-1.5 rounded-md bg-[var(--color-m3-surface-bright)] dark:bg-[var(--color-m3-dark-surface-container)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]"
                        style={{ left: tipLeft, top: tipTop }}
                    >
                        <div className="text-[0.625rem] whitespace-nowrap text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                            {dayLabel(hover.date)}
                        </div>
                        <div className="text-xs font-medium whitespace-nowrap text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                            {hover.count > 0 ? doseLabel(hover.count) : t('heatmap.none')}
                        </div>
                        {hoverMg.map(([ester, mg]) => (
                            <div key={ester} className="text-[0.625rem] whitespace-nowrap tabular-nums text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                {ester} · {mg.toFixed(2)} mg
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DoseHeatmap;
