import React, { useMemo, useState } from 'react';
import { Lang } from '../i18n/translations';
import { LOCALE_MAP } from '../utils/helpers';
import { useElementSize } from '../hooks/useElementSize';
import { Scenario, Series } from '../utils/regimen';

const DAY_H = 24;

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
 * that moment.
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
    labels: { history: string; target: string };
}> = ({ history, lines, band, bandLabel, nowH, horizonH, target, unit, isDarkMode, lang, labels }) => {
    const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
    const { width } = useElementSize(plotEl);
    const [hoverH, setHoverH] = useState<number | null>(null);
    const height = 260;
    const pad = { l: 40, r: 8, t: 22, b: 24 };

    const c = isDarkMode
        // The chart-* design tokens as hex for SVG; band is chart-band.
        ? { primary: '#df8f74', second: '#838078', grid: '#2c2a26', axis: '#a7a49e', faint: '#6b6860', band: 'rgba(223,143,116,0.12)', target: 'rgba(167,164,158,0.12)' }
        : { primary: '#cc785c', second: '#a7a49e', grid: '#eeedea', axis: '#6b6860', faint: '#a7a49e', band: 'rgba(204,120,92,0.1)', target: 'rgba(131,128,120,0.1)' };
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
    const path = (pts: [number, number][]) => pts.map(([h, v], i) => `${i ? 'L' : 'M'}${X(h).toFixed(1)},${Y(v).toFixed(1)}`).join('');

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
    // Only as many week labels as fit: about 48px each, so a 12-week window on
    // a phone shows every other week rather than a smear.
    const shownTicks = useMemo(() => {
        if (plotW <= 0 || xTicks.length < 2) return xTicks;
        const spacing = plotW * (7 * DAY_H) / (x1 - x0);
        const every = Math.max(1, Math.ceil(48 / spacing));
        return xTicks.filter((_, i) => i % every === 0);
    }, [xTicks, plotW, x0, x1]);
    const locale = LOCALE_MAP[lang] ?? lang;
    const dayFmt = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' });
    const whenFmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

    const bandPath = band && plotW > 0
        ? band.timeH.map((h, i) => `${i ? 'L' : 'M'}${X(h).toFixed(1)},${Y(band.hi[i]).toFixed(1)}`).join('')
          + band.timeH.slice().reverse().map((h, i) => `L${X(h).toFixed(1)},${Y(band.lo[band.lo.length - 1 - i]).toFixed(1)}`).join('') + 'Z'
        : null;

    // Read every line off at the hovered hour. Left of now only the log has a
    // value; right of it every projection does.
    const at = (s: Series | null, h: number): number | null => {
        if (!s || !s.timeH.length || h < s.timeH[0] || h > s.timeH[s.timeH.length - 1]) return null;
        let lo = 0, hi = s.timeH.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s.timeH[m] <= h) lo = m; else hi = m; }
        const u = (h - s.timeH[lo]) / (s.timeH[hi] - s.timeH[lo] || 1);
        return s.value[lo] + (s.value[hi] - s.value[lo]) * u;
    };
    const readout = hoverH === null ? null : (
        hoverH <= nowH
            ? [{ key: 'history', label: labels.history, value: at(history, hoverH), color: c.primary, dash: '' }]
            : lines.map(l => ({ key: l.key, label: l.label, value: at(l.series, hoverH), color: tone(l.tone), dash: l.dash }))
    )?.filter(r => r.value !== null) ?? null;

    const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
        if (plotW <= 0) return;
        const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
        if (px < pad.l || px > pad.l + plotW) { setHoverH(null); return; }
        // To the hour: a projection has no minutes to speak of.
        setHoverH(Math.round(x0 + ((px - pad.l) / plotW) * (x1 - x0)));
    };

    const swatch = (color: string, dash: string) => (
        <svg width="18" height="6" aria-hidden="true" className="shrink-0">
            <line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="1.75" strokeDasharray={dash || undefined} />
        </svg>
    );

    return (
        <div className="w-full">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">{swatch(c.primary, '')}{labels.history}</span>
                {lines.map(l => <span key={l.key} className="flex items-center gap-1.5">{swatch(tone(l.tone), l.dash)}{l.label}</span>)}
                {band && <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ background: c.band }} />{bandLabel}</span>}
            </div>
            <div
                ref={setPlotEl}
                className="relative w-full"
                style={{ height, touchAction: 'pan-y' }}
                onPointerMove={onPointer}
                onPointerDown={onPointer}
                onPointerLeave={() => setHoverH(null)}
            >
                {plotW > 0 && (
                    <svg width={width} height={height} role="img">
                        {target && (
                            <g>
                                <rect x={pad.l} y={Y(target.high)} width={plotW} height={Y(target.low) - Y(target.high)} fill={c.target} />
                                <text x={pad.l + 4} y={Y(target.high) + 11} fontSize="10" fill={c.axis}>{labels.target}</text>
                            </g>
                        )}
                        {yTicks.map(v => (
                            <g key={v}>
                                <line x1={pad.l} x2={pad.l + plotW} y1={Y(v)} y2={Y(v)} stroke={c.grid} strokeWidth="1" />
                                <text x={pad.l - 6} y={Y(v) + 3} fontSize="11" textAnchor="end" fill={c.axis} className="tabular-nums">{v}</text>
                            </g>
                        ))}
                        <text x={pad.l - 6} y={9} fontSize="10" textAnchor="end" fill={c.axis}>{unit}</text>
                        {shownTicks.map(h => (
                            <text key={h} x={X(h)} y={height - 6} fontSize="11" textAnchor="middle" fill={c.axis} className="tabular-nums">
                                {dayFmt.format(new Date(h * 3600000))}
                            </text>
                        ))}
                        {bandPath && <path d={bandPath} fill={c.band} stroke="none" />}
                        <line x1={X(nowH)} x2={X(nowH)} y1={pad.t} y2={pad.t + plotH} stroke={c.axis} strokeWidth="1" strokeDasharray="2 3" />
                        <path d={path(historyPts)} fill="none" stroke={c.primary} strokeWidth="2" strokeLinejoin="round" />
                        {linePts.map(l => (
                            <path key={l.key} d={path(l.pts)} fill="none" stroke={tone(l.tone)} strokeWidth={l.tone === 'primary' ? 2 : 1.5} strokeDasharray={l.dash || undefined} strokeLinejoin="round" />
                        ))}
                        {hoverH !== null && readout && readout.length > 0 && (
                            <g>
                                <line x1={X(hoverH)} x2={X(hoverH)} y1={pad.t} y2={pad.t + plotH} stroke={c.faint} strokeWidth="1" />
                                {readout.map(r => <circle key={r.key} cx={X(hoverH)} cy={Y(r.value!)} r="3.5" fill={r.color} stroke={isDarkMode ? '#181714' : '#ffffff'} strokeWidth="2" />)}
                            </g>
                        )}
                    </svg>
                )}
                {hoverH !== null && readout && readout.length > 0 && (
                    <div
                        className="absolute z-10 pointer-events-none px-2.5 py-1.5 rounded-md bg-[var(--surface)] border border-[var(--border)]"
                        style={{
                            left: Math.min(Math.max(X(hoverH), pad.l + 4), pad.l + plotW - 4),
                            top: 8,
                            transform: `translate(${X(hoverH) > pad.l + plotW * 0.6 ? 'calc(-100% - 8px)' : '8px'}, 0)`,
                        }}
                    >
                        <div className="text-[0.6875rem] text-[var(--text-muted)] mb-0.5 whitespace-nowrap">
                            {whenFmt.format(new Date(hoverH * 3600000))}
                        </div>
                        {readout.map(r => (
                            <div key={r.key} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                                {swatch(r.color, r.dash)}
                                <span className="text-[var(--text-muted)]">{r.label}</span>
                                <span className="ml-auto pl-2 font-medium tabular-nums" style={{ color: r.color }}>{Math.round(r.value!)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ForecastChart;
