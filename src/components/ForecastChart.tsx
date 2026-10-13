import React, { useEffect, useMemo, useState } from 'react';
import { Lang } from '../i18n/translations';
import { LOCALE_MAP } from '../utils/helpers';
import { useElementSize } from '../hooks/useElementSize';
import { Scenario, Series } from '../utils/regimen';

const DAY_H = 24;
// How a dense line is drawn as its range; see columns(). Columns are COL_PX
// wide, or two dose cycles wide where a cycle is narrower than CYCLE_PX.
const COL_PX = 2;
const CYCLE_PX = 12;

/** One column of a dense series: time-weighted sums (w, h, v), its range, the pixels it spans, and the width it may take. */
interface Column {
    w: number;
    h: number;
    v: number;
    lo: number;
    hi: number;
    x0: number;
    x1: number;
    cw: number;
}

export interface ChartLine {
    key: string;
    label: string;
    series: Series | null;
    /** SVG dash pattern; solid when empty. */
    dash: string;
    tone: 'primary' | 'second';
}

/**
 * The next weeks under each schedule, side by side. Left of the "now" line
 * is what was logged; right of it every line is a projection from the same
 * engine. The shaded band is one scenario's 10th to 90th percentile across
 * the Monte Carlo runs.
 *
 * Smaller than ResultChart on purpose: a fixed window from two weeks back to
 * the horizon, no panning, same palette and target band, so it reads as the
 * same chart looking forward. Hovering (or touching) reads every line off at
 * that moment; a tap leaves the readout up until the next press elsewhere.
 */
const ForecastChart: React.FC<{
    history: Series | null;
    lines: ChartLine[];
    band: Scenario['band'];
    bandLabel: string;
    nowH: number;
    horizonH: number;
    target: { low: number; high: number } | null;
    unit: string;
    isDarkMode: boolean;
    lang: Lang;
    labels: { history: string; target: string; swing: string };
}> = ({ history, lines, band, bandLabel, nowH, horizonH, target, unit, isDarkMode, lang, labels }) => {
    const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
    const { width } = useElementSize(plotEl);
    const [hoverH, setHoverH] = useState<number | null>(null);
    // The readout's width, measured before paint, so it can be kept inside the
    // plot: a fixed flip at 60% let a wide readout (long line names, or a tap
    // near the right on a phone) run off the screen.
    const [tipEl, setTipEl] = useState<HTMLDivElement | null>(null);
    const { width: tipW } = useElementSize(tipEl);
    const height = 260;
    // SVG units do not follow the root font size, so, as in ResultChart, the
    // root size is read back to keep the axis type at the 12px floor for
    // anything meant to be read, and the gutters in proportion, when the
    // desktop scale steps up. Read again once the plot is measured, which is
    // what a breakpoint change triggers.
    const ui = useMemo(() => {
        if (typeof window === 'undefined' || width <= 0) return 1;
        const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return Number.isFinite(px) && px > 0 ? px / 16 : 1;
    }, [width]);
    const axisFont = 12 * ui;
    const pad = { l: 40 * ui, r: 8 * ui, t: 22 * ui, b: 24 * ui };

    const c = isDarkMode
        ? // The chart-* design tokens as hex for SVG; band is chart-band, dot is
          // chart-dot (the page colour). The target band is drawn in primary,
          // as on the Overview chart, so the two read as the same range.
          {
              primary: '#df8f74',
              second: '#838078',
              grid: '#2c2a26',
              axis: '#a7a49e',
              faint: '#6b6860',
              band: 'rgba(223,143,116,0.12)',
              dot: '#181714',
          }
        : {
              primary: '#cc785c',
              second: '#a7a49e',
              grid: '#eeedea',
              axis: '#6b6860',
              faint: '#a7a49e',
              band: 'rgba(204,120,92,0.1)',
              dot: '#ffffff',
          };
    const tone = (t: ChartLine['tone']) => (t === 'primary' ? c.primary : c.second);

    const x0 = nowH - 14 * DAY_H;
    const x1 = nowH + horizonH;

    const slice = (s: Series | null, from: number, to: number) => {
        if (!s) return [] as [number, number][];
        const out: [number, number][] = [];
        for (let i = 0; i < s.timeH.length; i++) {
            const h = s.timeH[i];
            if (h < from || h > to) continue;
            out.push([h, s.value[i]]);
        }
        return out;
    };
    const historyPts = useMemo(() => slice(history, x0, nowH), [history, x0, nowH]);
    const linePts = useMemo(() => lines.map(l => ({ ...l, pts: slice(l.series, nowH, x1) })), [lines, nowH, x1]);

    const yMax = useMemo(() => {
        let m = target ? target.high : 0;
        for (const [, v] of historyPts) m = Math.max(m, v);
        for (const l of linePts) for (const [, v] of l.pts) m = Math.max(m, v);
        if (band) for (const v of band.hi) m = Math.max(m, v);
        const step = m > 800 ? 200 : m > 400 ? 100 : m > 150 ? 50 : 25;
        return Math.ceil((m * 1.05) / step) * step || 100;
    }, [historyPts, linePts, band, target]);

    const plotW = Math.max(0, width - pad.l - pad.r);
    const plotH = height - pad.t - pad.b;
    const X = (h: number) => pad.l + ((h - x0) / (x1 - x0)) * plotW;
    const Y = (v: number) => pad.t + plotH - (v / yMax) * plotH;
    const path = (pts: [number, number][]) =>
        pts.map(([h, v], i) => `${i ? 'L' : 'M'}${X(h).toFixed(1)},${Y(v).toFixed(1)}`).join('');

    const yTicks = useMemo(() => [0, 1, 2, 3, 4].map(i => Math.round((yMax / 4) * i)), [yMax]);
    // A tick at local midnight each week from the start of the window.
    const xTicks = useMemo(() => {
        const start = new Date(x0 * 3600000);
        start.setHours(0, 0, 0, 0);
        const ticks: number[] = [];
        for (let d = new Date(start); d.getTime() / 3600000 <= x1; d.setDate(d.getDate() + 7)) {
            const h = d.getTime() / 3600000;
            if (h >= x0) ticks.push(h);
        }
        return ticks;
    }, [x0, x1]);
    // Only as many week labels as fit: about 52px each at 12px type, so a
    // 12-week window on a phone shows every other week rather than a smear.
    const shownTicks = useMemo(() => {
        if (plotW <= 0 || xTicks.length < 2) return xTicks;
        const spacing = (plotW * (7 * DAY_H)) / (x1 - x0);
        const every = Math.max(1, Math.ceil((52 * ui) / spacing));
        return xTicks.filter((_, i) => i % every === 0);
    }, [xTicks, plotW, x0, x1, ui]);
    const locale = LOCALE_MAP[lang] ?? lang;
    const dayFmt = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' });
    const whenFmt = new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    // A dose cycle a few pixels wide (sublingual twice a day over eight weeks
    // is about 2px on a phone) drew each line as a solid zigzag block, and the
    // dashes that tell the scenarios apart broke it into noise; the band
    // striped the same way. Where samples are denser than one per COL_PX, a
    // series is cut into columns and each is drawn as its range, a line in it
    // through the column's mean, so the dash still reads. Where cycles are
    // narrower than CYCLE_PX a column takes two of them, or the peaks falling
    // in some columns and not others striped the range and shook the line.
    // That is judged cycle by cycle, since a plan that moves from sublingual
    // to injections has both in one line. Only the drawing changes: the
    // readout and the numbers below the chart use every sample.
    const columns = (t: number[], lo: number[], hi: number[]): { xs: string[]; cols: Column[] } | null => {
        const n = t.length;
        const spanPx = n ? X(t[n - 1]) - X(t[0]) : 0;
        if (n < 3 || n * COL_PX <= spanPx) return null;
        // The peaks, passing over wobbles under 2% of the range (the band's
        // percentiles wobble from hour to hour); a sample's column is two of
        // the cycles around it wide when they are narrow.
        let top = -Infinity,
            bottom = Infinity;
        for (const v of hi) {
            top = Math.max(top, v);
            bottom = Math.min(bottom, v);
        }
        const tol = (top - bottom) * 0.02;
        const peaks: number[] = [];
        let rising = true,
            ext = 0;
        for (let i = 1; i < n; i++) {
            if (rising ? hi[i] >= hi[ext] : hi[i] <= hi[ext]) ext = i;
            else if (rising ? hi[i] < hi[ext] - tol : hi[i] > hi[ext] + tol) {
                if (rising) peaks.push(ext);
                rising = !rising;
                ext = i;
            }
        }
        const gaps = peaks.slice(1).map((p, k) => X(t[p]) - X(t[peaks[k]]));
        const even = (a: number, b: number | undefined) => b !== undefined && Math.max(a, b) < 1.5 * Math.min(a, b);
        const widthAt = new Float64Array(n).fill(COL_PX);
        for (let k = 0; k < gaps.length; k++) {
            const gap = gaps[k];
            // A run of narrow cycles, not one dose that happens to land
            // near another, such as the first injection after the last
            // sublingual dose.
            if (gap >= CYCLE_PX || !(even(gap, gaps[k - 1]) || even(gap, gaps[k + 1]))) continue;
            // On through one more cycle, so the last dose of a run is
            // averaged like the rest rather than left standing as a spike.
            let to = peaks[k + 1];
            while (to < n && X(t[to]) < X(t[peaks[k + 1]]) + gap) to++;
            widthAt.fill(Math.max(COL_PX, 2 * gap), k === 0 ? 0 : peaks[k], k + 1 === gaps.length ? n : to);
        }
        const cols: Column[] = [];
        // A column cut short, where the cycles widen again or at the end,
        // holds part of a cycle, and its mean jumped to a peak or a trough;
        // it joins the column before instead.
        const joinShort = () => {
            const b = cols[cols.length - 1];
            if (cols.length < 3 || b.x1 - b.x0 >= b.cw / 2) return;
            const a = cols[cols.length - 2];
            cols.splice(-2, 2, {
                w: a.w + b.w,
                h: a.h + b.h,
                v: a.v + b.v,
                lo: Math.min(a.lo, b.lo),
                hi: Math.max(a.hi, b.hi),
                x0: a.x0,
                x1: b.x1,
                cw: a.cw,
            });
        };
        for (let i = 0; i < n; i++) {
            // Each sample stands for half the gap to either neighbour. The
            // simulation samples more closely around each dose, which would
            // pull a plain average up toward the peaks.
            const w = (t[Math.min(i + 1, n - 1)] - t[Math.max(i - 1, 0)]) / 2 || 1e-6;
            const x = X(t[i]);
            const mid = (lo[i] + hi[i]) / 2;
            const col = cols[cols.length - 1];
            // A wide column stops where the cycles widen again, rather than
            // smoothing over the start of an injection's rise.
            if (col && x - col.x0 < Math.min(col.cw, widthAt[i])) {
                col.w += w;
                col.h += t[i] * w;
                col.v += mid * w;
                col.lo = Math.min(col.lo, lo[i]);
                col.hi = Math.max(col.hi, hi[i]);
                col.x1 = x;
            } else {
                if (col && x - col.x0 < col.cw) joinShort();
                cols.push({ w, h: t[i] * w, v: mid * w, lo: lo[i], hi: hi[i], x0: x, x1: x, cw: widthAt[i] });
            }
        }
        joinShort();
        // Each column at the centre of its time, except that the ends reach
        // the first and last sample, so a line still meets the now line.
        const xs = cols.map((col, i) =>
            X(i === 0 ? t[0] : i === cols.length - 1 ? t[n - 1] : col.h / col.w).toFixed(1),
        );
        return { xs, cols };
    };
    const rangePath = ({ xs, cols }: { xs: string[]; cols: Column[] }) =>
        cols.map((col, i) => `${i ? 'L' : 'M'}${xs[i]},${Y(col.hi).toFixed(1)}`).join('') +
        cols
            .map((col, i) => `L${xs[i]},${Y(col.lo).toFixed(1)}`)
            .reverse()
            .join('') +
        'Z';
    const trace = (pts: [number, number][]): { line: string; ribbon: string | null } => {
        const t = pts.map(p => p[0]);
        const v = pts.map(p => p[1]);
        const cc = columns(t, v, v);
        if (!cc) return { line: path(pts), ribbon: null };
        return {
            line: cc.cols.map((col, i) => `${i ? 'L' : 'M'}${cc.xs[i]},${Y(col.v / col.w).toFixed(1)}`).join(''),
            ribbon: rangePath(cc),
        };
    };
    const historyTrace = trace(historyPts);
    const lineTraces = linePts.map(l => ({ ...l, ...trace(l.pts) }));
    // The colours of the lines drawn as a range, one legend swatch each.
    const swingTones =
        plotW <= 0
            ? []
            : [
                  ...new Set([
                      ...(historyTrace.ribbon ? [c.primary] : []),
                      ...lineTraces.filter(l => l.ribbon).map(l => tone(l.tone)),
                  ]),
              ];

    const bandCols = band && plotW > 0 ? columns(band.timeH, band.lo, band.hi) : null;
    const bandPath =
        band && plotW > 0
            ? bandCols
                ? rangePath(bandCols)
                : band.timeH.map((h, i) => `${i ? 'L' : 'M'}${X(h).toFixed(1)},${Y(band.hi[i]).toFixed(1)}`).join('') +
                  band.timeH
                      .slice()
                      .reverse()
                      .map((h, i) => `L${X(h).toFixed(1)},${Y(band.lo[band.lo.length - 1 - i]).toFixed(1)}`)
                      .join('') +
                  'Z'
            : null;

    // Read every line off at the hovered hour. Left of now only the log has a
    // value; right of it every projection does.
    const at = (s: Series | null, h: number): number | null => {
        if (!s || !s.timeH.length || h < s.timeH[0] || h > s.timeH[s.timeH.length - 1]) return null;
        let lo = 0,
            hi = s.timeH.length - 1;
        while (hi - lo > 1) {
            const m = (lo + hi) >> 1;
            if (s.timeH[m] <= h) lo = m;
            else hi = m;
        }
        const u = (h - s.timeH[lo]) / (s.timeH[hi] - s.timeH[lo] || 1);
        return s.value[lo] + (s.value[hi] - s.value[lo]) * u;
    };
    const readout =
        hoverH === null
            ? null
            : ((hoverH <= nowH
                  ? [{ key: 'history', label: labels.history, value: at(history, hoverH), color: c.primary, dash: '' }]
                  : lines.map(l => ({
                        key: l.key,
                        label: l.label,
                        value: at(l.series, hoverH),
                        color: tone(l.tone),
                        dash: l.dash,
                    }))
              )?.filter(r => r.value !== null) ?? null);

    const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
        if (plotW <= 0) return;
        const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
        if (px < pad.l || px > pad.l + plotW) {
            setHoverH(null);
            return;
        }
        // To the hour: a projection has no minutes to speak of.
        setHoverH(Math.round(x0 + ((px - pad.l) / plotW) * (x1 - x0)));
    };

    // A finger lifting fires pointerleave straight after pointerup, which
    // took the readout away the moment it appeared. Only a mouse leaving
    // means done looking. A tapped readout stays until the next press
    // outside the plot (capture phase, so a press on the plot moves it
    // instead), and a press that turns into a scroll cancels it.
    const onPointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === 'mouse') setHoverH(null);
    };
    const hovering = hoverH !== null;
    useEffect(() => {
        if (!hovering || !plotEl) return;
        const dismiss = (e: PointerEvent) => {
            if (!plotEl.contains(e.target as Node)) setHoverH(null);
        };
        window.addEventListener('pointerdown', dismiss, true);
        return () => window.removeEventListener('pointerdown', dismiss, true);
    }, [hovering, plotEl]);

    const swatch = (color: string, dash: string) => (
        <svg width="18" height="6" aria-hidden="true" className="shrink-0">
            <line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="1.75" strokeDasharray={dash || undefined} />
        </svg>
    );

    return (
        <div className="w-full">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">
                    {swatch(c.primary, '')}
                    {labels.history}
                </span>
                {lines.map(l => (
                    <span key={l.key} className="flex items-center gap-1.5">
                        {swatch(tone(l.tone), l.dash)}
                        {l.label}
                    </span>
                ))}
                {band && (
                    <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-4 rounded-sm" style={{ background: c.band }} />
                        {bandLabel}
                    </span>
                )}
                {/* A line drawn as its range (see columns()) carries a wash much
                    like the band's, and in a twice-daily plan the two merged into
                    one block that read as the 10–90% interval. Its swatch is the
                    wash with the line through it, in each colour that has one,
                    and says what the wash is. */}
                {swingTones.length > 0 && (
                    <span className="flex items-center gap-1.5">
                        {swingTones.map(col => (
                            <svg key={col} width="18" height="10" aria-hidden="true" className="shrink-0">
                                <rect x="0" y="1" width="18" height="8" fill={col} fillOpacity={0.18} />
                                <line x1="0" y1="5" x2="18" y2="5" stroke={col} strokeWidth="1.75" />
                            </svg>
                        ))}
                        {labels.swing}
                    </span>
                )}
            </div>
            <div
                ref={setPlotEl}
                className="relative w-full"
                style={{ height, touchAction: 'pan-y' }}
                onPointerMove={onPointer}
                onPointerDown={onPointer}
                onPointerLeave={onPointerLeave}
                onPointerCancel={() => setHoverH(null)}
            >
                {plotW > 0 && (
                    <svg width={width} height={height} role="img">
                        {target && (
                            <g>
                                <rect
                                    x={pad.l}
                                    y={Y(target.high)}
                                    width={plotW}
                                    height={Y(target.low) - Y(target.high)}
                                    fill={c.primary}
                                    opacity={0.06}
                                />
                                <line
                                    x1={pad.l}
                                    x2={pad.l + plotW}
                                    y1={Y(target.low)}
                                    y2={Y(target.low)}
                                    stroke={c.faint}
                                    strokeWidth="1"
                                    strokeDasharray="2 4"
                                    opacity={0.6}
                                />
                                <line
                                    x1={pad.l}
                                    x2={pad.l + plotW}
                                    y1={Y(target.high)}
                                    y2={Y(target.high)}
                                    stroke={c.faint}
                                    strokeWidth="1"
                                    strokeDasharray="2 4"
                                    opacity={0.6}
                                />
                            </g>
                        )}
                        {yTicks.map(v => (
                            <g key={v}>
                                <line
                                    x1={pad.l}
                                    x2={pad.l + plotW}
                                    y1={Y(v)}
                                    y2={Y(v)}
                                    stroke={c.grid}
                                    strokeWidth="1"
                                />
                                <text
                                    x={pad.l - 6 * ui}
                                    y={Y(v) + 4 * ui}
                                    fontSize={axisFont}
                                    textAnchor="end"
                                    fill={c.axis}
                                    className="tabular-nums"
                                >
                                    {v}
                                </text>
                            </g>
                        ))}
                        {/* From the left edge: at 12px "pg/mL" is wider than the gutter. */}
                        <text x={0} y={11 * ui} fontSize={axisFont} fill={c.axis}>
                            {unit}
                        </text>
                        {shownTicks.map(h => {
                            const day = dayFmt.format(new Date(h * 3600000));
                            // Centred on a week that falls near the right edge, a date ran
                            // past the narrow right gutter and was cut to "12/"; it is left
                            // out instead. Digits run about 0.6em.
                            if (X(h) + day.length * axisFont * 0.3 > width) return null;
                            return (
                                <text
                                    key={h}
                                    x={X(h)}
                                    y={height - 6 * ui}
                                    fontSize={axisFont}
                                    textAnchor="middle"
                                    fill={c.axis}
                                    className="tabular-nums"
                                >
                                    {day}
                                </text>
                            );
                        })}
                        {bandPath && <path d={bandPath} fill={c.band} stroke="none" />}
                        {historyTrace.ribbon && (
                            <path d={historyTrace.ribbon} fill={c.primary} fillOpacity={0.18} stroke="none" />
                        )}
                        {lineTraces.map(
                            l =>
                                l.ribbon && (
                                    <path
                                        key={l.key}
                                        d={l.ribbon}
                                        fill={tone(l.tone)}
                                        fillOpacity={0.18}
                                        stroke="none"
                                    />
                                ),
                        )}
                        <line
                            x1={X(nowH)}
                            x2={X(nowH)}
                            y1={pad.t}
                            y2={pad.t + plotH}
                            stroke={c.axis}
                            strokeWidth="1"
                            strokeDasharray="2 3"
                        />
                        <path
                            d={historyTrace.line}
                            fill="none"
                            stroke={c.primary}
                            strokeWidth="2"
                            strokeLinejoin="round"
                        />
                        {lineTraces.map(l => (
                            <path
                                key={l.key}
                                d={l.line}
                                fill="none"
                                stroke={tone(l.tone)}
                                strokeWidth={l.tone === 'primary' ? 2 : 1.5}
                                strokeDasharray={l.dash || undefined}
                                strokeLinejoin="round"
                            />
                        ))}
                        {/* The band's name goes over the lines, which cross its
                            top edge right where it sits; the halo in the page
                            colour keeps it legible there. */}
                        {target && (
                            <text
                                x={pad.l + 4 * ui}
                                y={Math.min(pad.t + plotH - 3 * ui, Y(target.high) + 14 * ui)}
                                fontSize={axisFont}
                                fill={c.axis}
                                paintOrder="stroke"
                                stroke={c.dot}
                                strokeWidth={3 * ui}
                                strokeLinejoin="round"
                                pointerEvents="none"
                            >
                                {labels.target}
                            </text>
                        )}
                        {hoverH !== null && readout && readout.length > 0 && (
                            <g>
                                <line
                                    x1={X(hoverH)}
                                    x2={X(hoverH)}
                                    y1={pad.t}
                                    y2={pad.t + plotH}
                                    stroke={c.faint}
                                    strokeWidth="1"
                                />
                                {readout.map(r => (
                                    <circle
                                        key={r.key}
                                        cx={X(hoverH)}
                                        cy={Y(r.value!)}
                                        r="3.5"
                                        fill={r.color}
                                        stroke={c.dot}
                                        strokeWidth="2"
                                    />
                                ))}
                            </g>
                        )}
                    </svg>
                )}
                {hoverH !== null && readout && readout.length > 0 && (
                    <div
                        ref={setTipEl}
                        className="absolute z-10 pointer-events-none px-2.5 py-1.5 rounded-md bg-[var(--surface)] border border-[var(--border)]"
                        style={{
                            // Right of the line when it fits, left of it when it
                            // doesn't, and never past either edge.
                            left:
                                X(hoverH) + 8 + tipW > width
                                    ? Math.max(0, X(hoverH) - 8 - tipW)
                                    : Math.max(0, Math.min(X(hoverH) + 8, width - tipW)),
                            top: 8,
                        }}
                    >
                        <div className="text-xs text-[var(--text-muted)] mb-0.5 whitespace-nowrap">
                            {whenFmt.format(new Date(hoverH * 3600000))}
                        </div>
                        {readout.map(r => (
                            <div key={r.key} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                                {swatch(r.color, r.dash)}
                                <span className="text-[var(--text-muted)]">{r.label}</span>
                                <span className="ml-auto pl-2 font-medium tabular-nums" style={{ color: r.color }}>
                                    {Math.round(r.value!)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ForecastChart;
