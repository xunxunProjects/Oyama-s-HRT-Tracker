import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { formatDate, formatTime } from '../utils/helpers';
import {
    SimulationResult, DoseEvent, LabResult,
    interpolateConcentration_E2, interpolateConcentration_CPA, interpolateConcentration_T,
    convertToPgMl, convertToNgDl, isT_LabUnit, T_ESTERS,
} from '../../logic';
import { Activity } from 'lucide-react';
import { useHRTMode } from '../contexts/HRTModeContext';

const HOUR = 3600000;
const DAY = 24 * HOUR;

type RangeKey = '7d' | '30d' | 'all';

// Pick a "nice" rounding step (1/2/5 × 10^n) near the requested magnitude.
const niceStep = (raw: number): number => {
    if (!(raw > 0)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    return nice * mag;
};

// Build a padded, tick-friendly [min, max] domain from observed values.
const buildYDomain = (min: number, max: number): [number, number] => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0) return [0, 1];
    if (max === min) max = max + (max * 0.15 || 1);
    const pad = (max - min) * 0.12;
    const step = niceStep((max - min + 2 * pad) / 4);
    const lo = Math.max(0, Math.floor((min - pad) / step) * step);
    let hi = Math.ceil((max + pad) / step) * step;
    if (hi <= lo) hi = lo + step;
    return [lo, hi];
};

const ticksFor = ([lo, hi]: [number, number]): number[] => {
    const step = niceStep((hi - lo) / 4);
    const out: number[] = [];
    for (let v = lo; v <= hi + step * 0.5; v += step) out.push(Math.round(v / step) * step);
    return out;
};

const fmtAxis = (v: number) => (v >= 100 || v % 1 === 0 ? String(Math.round(v)) : v < 1 ? v.toFixed(2) : v.toFixed(1));

// Track the rendered pixel size of an element. Takes the node itself (via a
// state-backed callback ref) rather than a ref object, so measurement re-runs
// when the element actually mounts — e.g. after the simulation finishes loading
// and the plot replaces the empty state. Measures on layout and on resize;
// ResizeObserver is a bonus (some embedded browsers never fire it).
const useElementSize = (el: HTMLElement | null) => {
    const [size, setSize] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
        if (!el) return;
        const measure = () => {
            const r = el.getBoundingClientRect();
            setSize(prev => (prev.width === r.width && prev.height === r.height ? prev : { width: r.width, height: r.height }));
        };
        measure();
        window.addEventListener('resize', measure);
        let ro: ResizeObserver | undefined;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(measure);
            ro.observe(el);
        }
        return () => {
            window.removeEventListener('resize', measure);
            ro?.disconnect();
        };
    }, [el]);
    return size;
};

const ResultChart = ({
    sim,
    events,
    labResults = [],
    calibrationFn = (_t: number) => 1,
    onPointClick,
    isDarkMode = false,
}: {
    sim: SimulationResult | null;
    events: DoseEvent[];
    labResults?: LabResult[];
    calibrationFn?: (timeH: number) => number;
    onPointClick: (e: DoseEvent) => void;
    isDarkMode?: boolean;
}) => {
    const { t, lang } = useTranslation();
    const { isTransmasc } = useHRTMode();
    const clipId = useId().replace(/:/g, '');

    const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
    const { width, height } = useElementSize(plotEl);

    const [range, setRange] = useState<RangeKey>('7d');
    const [hover, setHover] = useState<number | null>(null);
    const [panOffset, setPanOffset] = useState(0); // ms the window is dragged from its centered base
    const [dragging, setDragging] = useState(false);
    const dragRef = useRef<{ startX: number; startY: number; startOffset: number; moved: boolean; pointerId: number } | null>(null);

    const selectRange = (r: RangeKey) => { setRange(r); setPanOffset(0); };

    // Warm, on-brand palette — terracotta primary against a muted neutral grid.
    const c = isDarkMode
        ? { primary: '#D8927C', second: '#7A776F', grid: '#2E2C28', axis: '#7A776F', faint: '#5C5953', dot: '#1C1B18', lab: '#E0A38C' }
        : { primary: '#CC785C', second: '#C2BDB3', grid: '#E7E4DD', axis: '#A8A59E', faint: '#C2BDB3', dot: '#FAF9F7', lab: '#B5664C' };

    // Which series are relevant for the current mode / logged doses.
    const hasE2 = isTransmasc ? false : events.some(e => e.ester !== 'CPA' && !T_ESTERS.has(e.ester));
    const hasT = isTransmasc && events.some(e => T_ESTERS.has(e.ester));
    const hasCPA = !isTransmasc && events.some(e => e.ester === 'CPA');
    const primaryIsCPA = !isTransmasc && !hasE2 && hasCPA;
    const hasSecondary = hasE2 && hasCPA; // CPA shown on its own right-hand axis

    const primaryMeta = isTransmasc
        ? { label: t('label.total_t'), unit: 'ng/dl', decimals: 0 }
        : primaryIsCPA
            ? { label: t('label.cpa_chart'), unit: 'ng/ml', decimals: 2 }
            : { label: t('label.e2'), unit: 'pg/ml', decimals: 1 };

    // Resample the simulation into the (time, primary, secondary) shape we plot.
    const data = useMemo(() => {
        if (!sim || sim.timeH.length === 0) return [] as { t: number; p: number; s: number | null }[];
        return sim.timeH.map((h, i) => {
            const time = h * HOUR;
            if (isTransmasc) return { t: time, p: sim.concNGdL_T?.[i] ?? 0, s: null };
            const e2 = sim.concPGmL_E2[i] * calibrationFn(h);
            const cpa = sim.concPGmL_CPA[i];
            return { t: time, p: primaryIsCPA ? cpa : e2, s: hasSecondary ? cpa : null };
        });
    }, [sim, calibrationFn, isTransmasc, primaryIsCPA, hasSecondary]);

    const now = Date.now();
    const fullMin = data.length ? data[0].t : now;
    const fullMax = data.length ? data[data.length - 1].t : now;

    // Base window (before drag) — centered on "now" for 7d/30d, full span for "all".
    const baseWindow = useMemo<[number, number]>(() => {
        if (range === 'all' || data.length === 0) return [fullMin, fullMax];
        const span = range === '7d' ? 7 * DAY : 30 * DAY;
        const center = Math.min(Math.max(now, fullMin), fullMax);
        let lo = center - span / 2;
        let hi = center + span / 2;
        if (lo < fullMin) { lo = fullMin; hi = Math.min(fullMax, lo + span); }
        if (hi > fullMax) { hi = fullMax; lo = Math.max(fullMin, hi - span); }
        return [lo, hi];
    }, [range, data.length, fullMin, fullMax, now]);

    // How far the window can be dragged in each direction without leaving the data.
    const [minOffset, maxOffset] = useMemo<[number, number]>(() => {
        const a = fullMin - baseWindow[0]; // shifts t0 down to fullMin
        const b = fullMax - baseWindow[1]; // shifts t1 up to fullMax
        return [Math.min(a, b), Math.max(a, b)];
    }, [baseWindow, fullMin, fullMax]);

    // Visible window with the (clamped) drag offset applied.
    const [t0, t1] = useMemo<[number, number]>(() => {
        const off = Math.max(minOffset, Math.min(maxOffset, panOffset));
        return [baseWindow[0] + off, baseWindow[1] + off];
    }, [baseWindow, panOffset, minOffset, maxOffset]);
    const canPan = maxOffset - minOffset > DAY;

    // Only the slice we draw (plus one neighbour each side so lines reach the edges).
    const slice = useMemo(() => {
        if (data.length === 0) return [];
        let lo = 0, hi = data.length - 1;
        while (lo < data.length - 1 && data[lo + 1].t < t0) lo++;
        while (hi > 0 && data[hi - 1].t > t1) hi--;
        return data.slice(Math.max(0, lo), Math.min(data.length, hi + 1));
    }, [data, t0, t1]);

    const labPoints = useMemo(() => {
        if (!labResults.length) return [];
        return labResults
            .filter(l => (isTransmasc ? isT_LabUnit(l.unit) : !isT_LabUnit(l.unit)))
            .map(l => ({
                t: l.timeH * HOUR,
                v: isTransmasc ? convertToNgDl(l.concValue, l.unit) : convertToPgMl(l.concValue, l.unit),
                raw: l.concValue, unit: l.unit, id: l.id,
            }))
            .filter(l => l.t >= t0 && l.t <= t1);
    }, [labResults, isTransmasc, t0, t1]);

    // Dose markers sit on whichever axis their compound belongs to.
    const markers = useMemo(() => {
        if (!sim) return [];
        return events.map(e => {
            const isT = T_ESTERS.has(e.ester);
            const isCPA = e.ester === 'CPA';
            if (isTransmasc ? !isT : isT) return null;
            let value: number | null, axis: 'p' | 's';
            if (isTransmasc) { value = interpolateConcentration_T(sim, e.timeH); axis = 'p'; }
            else if (isCPA) { value = interpolateConcentration_CPA(sim, e.timeH); axis = hasSecondary ? 's' : 'p'; }
            else { const v = interpolateConcentration_E2(sim, e.timeH); value = v == null ? null : v * calibrationFn(e.timeH); axis = 'p'; }
            const v = value != null && Number.isFinite(value) ? value : 0;
            return { t: e.timeH * HOUR, v, axis, event: e };
        }).filter((m): m is { t: number; v: number; axis: 'p' | 's'; event: DoseEvent } => !!m && m.t >= t0 && m.t <= t1);
    }, [sim, events, isTransmasc, hasSecondary, calibrationFn, t0, t1]);

    // Y domains scale to what's visible in the current window.
    const yPrimary = useMemo(() => {
        let mx = -Infinity;
        for (const d of slice) if (d.p > mx) mx = d.p;
        for (const l of labPoints) if (l.v > mx) mx = l.v;
        for (const m of markers) if (m.axis === 'p' && m.v > mx) mx = m.v;
        return buildYDomain(0, mx);
    }, [slice, labPoints, markers]);

    const ySecondary = useMemo(() => {
        if (!hasSecondary) return [0, 1] as [number, number];
        let mx = -Infinity;
        for (const d of slice) if (d.s != null && d.s > mx) mx = d.s;
        for (const m of markers) if (m.axis === 's' && m.v > mx) mx = m.v;
        return buildYDomain(0, mx);
    }, [slice, markers, hasSecondary]);

    // Layout
    const mL = 32;
    const mR = hasSecondary ? 32 : 10;
    const mT = 14;
    const mB = 26;
    const plotW = Math.max(0, width - mL - mR);
    const plotH = Math.max(0, height - mT - mB);

    const X = (time: number) => mL + (t1 === t0 ? 0 : ((time - t0) / (t1 - t0)) * plotW);
    const YP = (v: number) => mT + plotH - ((v - yPrimary[0]) / (yPrimary[1] - yPrimary[0])) * plotH;
    const YS = (v: number) => mT + plotH - ((v - ySecondary[0]) / (ySecondary[1] - ySecondary[0])) * plotH;

    const linePath = (key: 'p' | 's') => {
        let d = '';
        let started = false;
        for (const pt of slice) {
            const val = key === 'p' ? pt.p : pt.s;
            if (val == null || !Number.isFinite(val)) { started = false; continue; }
            const x = X(pt.t).toFixed(1);
            const y = (key === 'p' ? YP(val) : YS(val)).toFixed(1);
            d += `${started ? 'L' : 'M'}${x} ${y}`;
            started = true;
        }
        return d;
    };

    const areaPath = useMemo(() => {
        const base = (mT + plotH).toFixed(1);
        const line = linePath('p');
        if (!line || slice.length === 0) return '';
        const x0 = X(slice[0].t).toFixed(1);
        const x1 = X(slice[slice.length - 1].t).toFixed(1);
        return `${line}L${x1} ${base}L${x0} ${base}Z`;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slice, yPrimary, plotW, plotH, mT, t0, t1, width]);

    const xTicks = useMemo(() => {
        if (plotW <= 0) return [];
        const count = Math.max(2, Math.min(6, Math.floor(plotW / 90)));
        const seen = new Set<string>();
        const out: { x: number; label: string }[] = [];
        for (let i = 0; i <= count; i++) {
            const time = t0 + ((t1 - t0) * i) / count;
            const label = formatDate(new Date(time), lang);
            if (seen.has(label)) continue;
            seen.add(label);
            out.push({ x: X(time), label });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t0, t1, plotW, lang, mL]);

    // "Now" position on the primary curve.
    const nowVal = useMemo(() => {
        if (!sim) return null;
        const h = now / HOUR;
        const v = isTransmasc
            ? interpolateConcentration_T(sim, h)
            : primaryIsCPA
                ? interpolateConcentration_CPA(sim, h)
                : (() => { const e = interpolateConcentration_E2(sim, h); return e == null ? null : e * calibrationFn(h); })();
        return v != null && Number.isFinite(v) ? v : null;
    }, [sim, now, isTransmasc, primaryIsCPA, calibrationFn]);

    // Hover lookup — nearest sample to the pointer.
    const updateHover = (clientX: number) => {
        if (!plotEl || data.length === 0) return;
        const rect = plotEl.getBoundingClientRect();
        const px = clientX - rect.left;
        if (px < mL || px > mL + plotW) { setHover(null); return; }
        const time = t0 + ((px - mL) / plotW) * (t1 - t0);
        let best = 0, bestDiff = Infinity;
        for (let i = 0; i < data.length; i++) {
            const diff = Math.abs(data[i].t - time);
            if (diff < bestDiff) { bestDiff = diff; best = i; }
        }
        setHover(best);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        if (!canPan) return;
        dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: panOffset, moved: false, pointerId: e.pointerId };
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const drag = dragRef.current;
        if (drag) {
            const dx = e.clientX - drag.startX;
            const dy = e.clientY - drag.startY;
            if (!drag.moved) {
                // Decide intent from the first decisive movement: horizontal pans
                // the chart, vertical (or a tap) is left to the page scroller.
                if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
                    drag.moved = true;
                    setDragging(true);
                    setHover(null);
                    // Capture so the pan keeps tracking even if the finger leaves the SVG.
                    try { e.currentTarget.setPointerCapture(drag.pointerId); } catch { /* ignore */ }
                } else if (Math.abs(dy) > 6) {
                    dragRef.current = null; // vertical scroll — bail out of the drag
                    return;
                }
            }
            if (drag.moved && plotW > 0) {
                const span = baseWindow[1] - baseWindow[0];
                const next = drag.startOffset - (dx / plotW) * span; // drag right → see earlier time
                setPanOffset(Math.max(minOffset, Math.min(maxOffset, next)));
            }
            return;
        }
        updateHover(e.clientX);
    };

    const endDrag = (e?: React.PointerEvent) => {
        const drag = dragRef.current;
        if (drag && e) { try { e.currentTarget.releasePointerCapture(drag.pointerId); } catch { /* ignore */ } }
        dragRef.current = null;
        if (dragging) setDragging(false);
    };

    const onPointerLeave = (e: React.PointerEvent) => { endDrag(e); setHover(null); };

    const hoverPt = hover != null ? data[hover] : null;
    const showHover = !dragging && hoverPt != null && hoverPt.t >= t0 && hoverPt.t <= t1 && plotW > 0;
    const calFactor = calibrationFn(now / HOUR);

    const rangeOpts: { key: RangeKey; label: string }[] = [
        { key: '7d', label: t('chart.range_7d') },
        { key: '30d', label: t('chart.range_30d') },
        { key: 'all', label: t('chart.range_all') },
    ];

    if (!sim || sim.timeH.length === 0) {
        return (
            <div className="h-72 md:h-96 flex flex-col items-center justify-center text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                <Activity className="w-10 h-10 mb-3 opacity-25" strokeWidth={1.25} />
                <p className="text-sm">{t('timeline.empty')}</p>
            </div>
        );
    }

    const chipBase = 'px-2 py-0.5 text-[11px] rounded-md transition-colors';
    const chipOn = 'text-body font-medium border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]';
    const chipOff = 'text-muted hover:text-body';

    return (
        <div className="w-full">
            {/* Header: title + range chips — flat, matching the page */}
            <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] truncate">
                    {t('chart.title')}
                </h2>
                <div className="flex items-center gap-2 shrink-0">
                    {Math.abs(calFactor - 1) > 0.001 && (
                        <span className="text-[10px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] opacity-70 tabular-nums">
                            ×{calFactor.toFixed(2)}
                        </span>
                    )}
                    <div className="flex items-center gap-0.5">
                        {rangeOpts.map(o => (
                            <button
                                key={o.key}
                                onClick={() => selectRange(o.key)}
                                className={`${chipBase} ${range === o.key ? chipOn : chipOff}`}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Legend — always visible so each line is labelled, on mobile too */}
            <div className="flex items-center gap-4 mb-1 text-[11px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-[2px] rounded-full" style={{ background: c.primary }} />
                    {primaryMeta.label}
                </span>
                {hasSecondary && (
                    <span className="flex items-center gap-1.5">
                        <span className="w-3.5 h-[2px] rounded-full" style={{ background: c.second }} />
                        {t('label.cpa_chart')}
                    </span>
                )}
            </div>

            {/* Plot */}
            <div ref={setPlotEl} className="relative h-72 md:h-96 -mx-4 md:-mx-6 select-none touch-pan-y">


                {width > 0 && (
                    <svg
                        width={width}
                        height={height}
                        className="block"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onPointerLeave={onPointerLeave}
                        style={{ touchAction: 'pan-y', cursor: canPan ? (dragging ? 'grabbing' : 'grab') : 'default' }}
                    >
                        <defs>
                            <clipPath id={`clip-${clipId}`}>
                                <rect x={mL} y={mT - 4} width={plotW} height={plotH + 8} />
                            </clipPath>
                        </defs>

                        {/* Horizontal grid + primary axis labels */}
                        {ticksFor(yPrimary).map((v, i) => {
                            const y = YP(v);
                            if (y < mT - 0.5 || y > mT + plotH + 0.5) return null;
                            return (
                                <g key={`yp-${i}`}>
                                    <line x1={mL} y1={y} x2={mL + plotW} y2={y} stroke={c.grid} strokeWidth={1} />
                                    <text x={mL - 8} y={y + 3} textAnchor="end" fontSize={10} fill={c.axis}>{fmtAxis(v)}</text>
                                </g>
                            );
                        })}

                        {/* Secondary (CPA) axis labels */}
                        {hasSecondary && ticksFor(ySecondary).map((v, i) => {
                            const y = YS(v);
                            if (y < mT - 0.5 || y > mT + plotH + 0.5) return null;
                            return (
                                <text key={`ys-${i}`} x={mL + plotW + 8} y={y + 3} textAnchor="start" fontSize={10} fill={c.faint}>{fmtAxis(v)}</text>
                            );
                        })}

                        {/* X axis labels */}
                        {xTicks.map((tk, i) => (
                            <text key={`x-${i}`} x={tk.x} y={mT + plotH + 16} textAnchor="middle" fontSize={10} fill={c.axis}>{tk.label}</text>
                        ))}

                        <g clipPath={`url(#clip-${clipId})`}>
                            {/* Primary curve */}
                            <path d={linePath('p')} fill="none" stroke={c.primary} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

                            {/* Secondary curve (CPA) — kept quiet so E2 stays the focus */}
                            {hasSecondary && (
                                <path d={linePath('s')} fill="none" stroke={c.second} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
                            )}

                            {/* "Now" line + dot */}
                            {now >= t0 && now <= t1 && (
                                <line x1={X(now)} y1={mT} x2={X(now)} y2={mT + plotH} stroke={c.primary} strokeWidth={1} strokeDasharray="3 4" opacity={0.5} />
                            )}
                            {nowVal != null && now >= t0 && now <= t1 && (
                                <circle cx={X(now)} cy={YP(nowVal)} r={4} fill={c.primary} stroke={c.dot} strokeWidth={2} />
                            )}

                            {/* Dose markers (clickable) */}
                            {markers.map((m, i) => {
                                const cx = X(m.t);
                                const cy = m.axis === 'p' ? YP(m.v) : YS(m.v);
                                const col = m.axis === 's' ? c.second : c.primary;
                                return (
                                    <g key={`m-${i}`} className="cursor-pointer" onClick={() => onPointClick(m.event)}>
                                        <circle cx={cx} cy={cy} r={9} fill="transparent" />
                                        <circle cx={cx} cy={cy} r={3} fill={c.dot} stroke={col} strokeWidth={1.5} />
                                    </g>
                                );
                            })}

                            {/* Lab results (measured) — hollow diamonds */}
                            {labPoints.map((l, i) => {
                                const cx = X(l.t);
                                const cy = YP(l.v);
                                return (
                                    <rect
                                        key={`l-${i}`}
                                        x={cx - 4} y={cy - 4} width={8} height={8}
                                        transform={`rotate(45 ${cx} ${cy})`}
                                        fill={c.dot} stroke={c.lab} strokeWidth={1.75}
                                    />
                                );
                            })}

                            {/* Hover crosshair + dot */}
                            {showHover && (
                                <>
                                    <line x1={X(hoverPt!.t)} y1={mT} x2={X(hoverPt!.t)} y2={mT + plotH} stroke={c.faint} strokeWidth={1} />
                                    <circle cx={X(hoverPt!.t)} cy={YP(hoverPt!.p)} r={4} fill={c.primary} stroke={c.dot} strokeWidth={2} />
                                    {hasSecondary && hoverPt!.s != null && (
                                        <circle cx={X(hoverPt!.t)} cy={YS(hoverPt!.s)} r={3} fill={c.second} stroke={c.dot} strokeWidth={1.5} />
                                    )}
                                </>
                            )}
                        </g>
                    </svg>
                )}

                {/* Hover tooltip */}
                {showHover && (
                    <div
                        className="absolute z-20 pointer-events-none px-2.5 py-1.5 rounded-md bg-[var(--color-m3-surface-bright)] dark:bg-[var(--color-m3-dark-surface-container)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]"
                        style={{
                            left: Math.min(Math.max(X(hoverPt!.t), mL + 4), mL + plotW - 4),
                            top: Math.max(YP(hoverPt!.p) - 12, 8),
                            transform: `translate(${X(hoverPt!.t) > mL + plotW * 0.6 ? '-100%' : '0'}, -100%)`,
                        }}
                    >
                        <div className="text-[10px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-0.5 whitespace-nowrap">
                            {formatDate(new Date(hoverPt!.t), lang)} · {formatTime(new Date(hoverPt!.t))}
                        </div>
                        <div className="flex items-baseline gap-1 whitespace-nowrap">
                            <span className="text-sm font-medium tabular-nums" style={{ color: c.primary }}>
                                {hoverPt!.p.toFixed(primaryMeta.decimals)}
                            </span>
                            <span className="text-[10px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{primaryMeta.unit}</span>
                        </div>
                        {hasSecondary && hoverPt!.s != null && (
                            <div className="flex items-baseline gap-1 whitespace-nowrap">
                                <span className="text-xs font-medium tabular-nums" style={{ color: c.second }}>
                                    {hoverPt!.s.toFixed(2)}
                                </span>
                                <span className="text-[10px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">ng/ml</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ResultChart;
