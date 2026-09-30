import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { formatDate, formatTime } from '../utils/helpers';
import {
    SimulationResult, DoseEvent, LabResult, HRTMode,
    interpolateConcentration_E2, interpolateConcentration_T,
    convertToPgMl, convertToNgDl, isT_LabUnit, T_ESTERS,
} from '../../logic';
import { useHRTMode } from '../contexts/HRTModeContext';
import { useElementSize } from '../hooks/useElementSize';

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

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Eases a [lo, hi] pair toward its target, so a change of scale glides under
 *  the curve instead of snapping to it. This is the axis behaviour from the
 *  product film. `instant` bypasses it, which is what a live drag needs: the
 *  window has to track the finger, not lag behind it. */
const useEasedPair = (target: [number, number], instant: boolean): [number, number] => {
    const [shown, setShown] = useState<[number, number]>(target);
    const shownRef = useRef<[number, number]>(target);
    const targetRef = useRef<[number, number]>(target);
    const rafRef = useRef(0);
    const lastRef = useRef(0);
    targetRef.current = target;

    // The loop lives across renders rather than inside one. It reads the target
    // through a ref, so a target that keeps moving (the window tracks "now", and
    // the y domain follows the slice the ease itself is widening) just steers the
    // animation already in flight. Tearing the effect down and rebuilding it on
    // every target change instead cancelled the pending frame before it could
    // run, and the ease then never advanced at all: switching 30d/all back to 7d
    // left the drawn window stuck on the old one, squeezing the whole visible
    // range into a hairline at the right-hand edge.
    useEffect(() => {
        if (instant || prefersReducedMotion()) {
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
            shownRef.current = targetRef.current;
            setShown(targetRef.current);
            return;
        }
        if (rafRef.current) return;                     // already easing — let it keep going
        lastRef.current = performance.now();
        const step = (now: number) => {
            const dt = Math.min(64, now - lastRef.current);
            lastRef.current = now;
            const [tl, th] = targetRef.current;
            const [cl, ch] = shownRef.current;
            const k = 1 - Math.exp(-dt / 95);            // ~95 ms time constant
            const nl = cl + (tl - cl) * k;
            const nh = ch + (th - ch) * k;
            const span = Math.abs(th - tl) || 1;
            const done = Math.abs(nl - tl) / span < 1e-4 && Math.abs(nh - th) / span < 1e-4;
            shownRef.current = done ? [tl, th] : [nl, nh];
            setShown(shownRef.current);
            rafRef.current = done ? 0 : requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target[0], target[1], instant]);

    useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

    return shown;
};

/** Holds the outgoing label set on screen alongside the incoming one, so axis
 *  labels dissolve between scales rather than popping in and out. */
function useFadingSet<T>(items: T[], sig: string, instant = false): { prev: T[]; next: T[]; u: number } {
    const last = useRef({ items, sig });
    const [fade, setFade] = useState<{ prev: T[]; u: number }>({ prev: [], u: 1 });

    useEffect(() => {
        if (sig === last.current.sig) return;
        const outgoing = last.current.items;
        last.current = { items, sig };
        // Dates change on every frame of a drag; dissolving each one just
        // reads as flicker, so during a drag they simply swap.
        if (instant || prefersReducedMotion()) { setFade({ prev: [], u: 1 }); return; }
        setFade({ prev: outgoing, u: 0 });
        let raf = 0;
        const start = performance.now();
        const step = (now: number) => {
            const u = Math.min(1, (now - start) / 280);
            setFade(f => ({ prev: f.prev, u }));
            if (u < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sig, instant]);

    if (sig === last.current.sig) last.current.items = items;
    return { prev: fade.prev, next: items, u: fade.u };
}

const fmtAxis = (v: number) => (v >= 100 || v % 1 === 0 ? String(Math.round(v)) : v < 1 ? v.toFixed(2) : v.toFixed(1));

const ResultChart = ({
    sim,
    events,
    labResults = [],
    calibrationFn = (_t: number) => 1,
    onPointClick,
    isDarkMode = false,
    mode,
    title,
    timeZone,
}: {
    sim: SimulationResult | null;
    events: DoseEvent[];
    labResults?: LabResult[];
    calibrationFn?: (timeH: number) => number;
    onPointClick?: (e: DoseEvent) => void;
    isDarkMode?: boolean;
    mode?: HRTMode;
    title?: string;
    timeZone?: string;
}) => {
    const { t, lang } = useTranslation();
    const { isTransmasc: contextIsTransmasc } = useHRTMode();
    const isTransmasc = mode ? mode === 'transmasc' : contextIsTransmasc;
    const clipId = useId().replace(/:/g, '');

    const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
    const { width, height } = useElementSize(plotEl);

    const [range, setRange] = useState<RangeKey>('7d');
    const [hover, setHover] = useState<number | null>(null);
    const [panOffset, setPanOffset] = useState(0); // ms the window is dragged from its centered base
    const [dragging, setDragging] = useState(false);
    const dragRef = useRef<{ startX: number; startY: number; startOffset: number; moved: boolean; pointerId: number } | null>(null);

    const selectRange = (r: RangeKey) => { setRange(r); setPanOffset(0); };

    // The outline around the selected range chip is one element that slides to
    // whichever chip is picked, rather than a border that is drawn on one button
    // and then on another. It is measured from the chips themselves so it follows
    // their widths in every language, and re-measured when the row resizes.
    const hasData = !!sim && sim.timeH.length > 0;
    const chipsRef = useRef<HTMLDivElement | null>(null);
    const chipRefs = useRef<Partial<Record<RangeKey, HTMLButtonElement | null>>>({});
    const [chipBox, setChipBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    useLayoutEffect(() => {
        const measure = () => {
            const el = chipRefs.current[range];
            if (!el) return;
            const next = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
            setChipBox(prev => (prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next));
        };
        measure();
        const row = chipsRef.current;
        if (!row || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(row);
        return () => ro.disconnect();
    }, [range, lang, hasData]);

    // Warm, on-brand palette — terracotta primary against a muted neutral grid.
    const c = isDarkMode
        ? { primary: '#D8927C', second: '#7A776F', grid: '#2E2C28', axis: '#7A776F', faint: '#5C5953', dot: '#1C1B18', lab: '#E0A38C' }
        : { primary: '#CC785C', second: '#C2BDB3', grid: '#E7E4DD', axis: '#A8A59E', faint: '#C2BDB3', dot: '#FAF9F7', lab: '#B5664C' };

    // One series per mode: total T for transmasc, E2 for transfem. Cyproterone
    // is not drawn. Its level isn't modelled; the Overview only tracks whether
    // each dose was taken.
    const primaryMeta = isTransmasc
        ? { label: t('label.total_t'), unit: 'ng/dl', decimals: 0 }
        : { label: t('label.e2'), unit: 'pg/ml', decimals: 1 };

    // Typical target band, matching the reference ranges the app uses for its
    // status labels (see useAppData currentStatus): transmasc total-T sits in
    // the ~300–1000 ng/dL male range; transfem E2 in the ~100–200 pg/mL band.
    const primaryTarget = useMemo<{ low: number; high: number }>(
        () => (isTransmasc ? { low: 300, high: 1000 } : { low: 100, high: 200 }),
        [isTransmasc],
    );

    // Resample the simulation into the (time, value) shape we plot.
    const data = useMemo(() => {
        if (!sim || sim.timeH.length === 0) return [] as { t: number; p: number }[];
        return sim.timeH.map((h, i) => ({
            t: h * HOUR,
            p: isTransmasc ? (sim.concNGdL_T?.[i] ?? 0) : sim.concPGmL_E2[i] * calibrationFn(h),
        }));
    }, [sim, calibrationFn, isTransmasc]);

    // A clock that ticks, not one that is read on every render. `now` anchors the
    // visible window, the "now" marker and the calibration read-off; taking it
    // from Date.now() inline made every one of those a fresh value on each of the
    // ~60 renders a second an animation produces, so nothing downstream of it
    // could ever settle. A minute is finer than this chart resolves, and it is
    // the cadence the readings above it already refresh on.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(id);
    }, []);

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

    // The window actually on screen. It eases toward the target so a change of
    // range glides, but a live drag is exempt: the plot has to track the finger.
    const [vt0, vt1] = useEasedPair([t0, t1], dragging);

    // Only the slice we draw (plus one neighbour each side so lines reach the
    // edges). It spans the union of the target window and the one currently
    // drawn: mid-ease those differ, and slicing to the target alone leaves the
    // rest of the plot with no data to draw, which is what made 30d to 7d snap
    // rather than stretch.
    const slice = useMemo(() => {
        if (data.length === 0) return [];
        const lo0 = Math.min(t0, vt0), hi0 = Math.max(t1, vt1);
        let lo = 0, hi = data.length - 1;
        while (lo < data.length - 1 && data[lo + 1].t < lo0) lo++;
        while (hi > 0 && data[hi - 1].t > hi0) hi--;
        return data.slice(Math.max(0, lo), Math.min(data.length, hi + 1));
    }, [data, t0, t1, vt0, vt1]);

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

    // Dose markers sit on the curve at the moment of each dose. Cyproterone
    // doses have no curve to sit on, so they get no marker.
    const markers = useMemo(() => {
        if (!sim) return [];
        return events.map(e => {
            const isT = T_ESTERS.has(e.ester);
            if (e.ester === 'CPA' || (isTransmasc ? !isT : isT)) return null;
            const value = isTransmasc
                ? interpolateConcentration_T(sim, e.timeH)
                : (() => { const v = interpolateConcentration_E2(sim, e.timeH); return v == null ? null : v * calibrationFn(e.timeH); })();
            const v = value != null && Number.isFinite(value) ? value : 0;
            return { t: e.timeH * HOUR, v, event: e };
        }).filter((m): m is { t: number; v: number; event: DoseEvent } => !!m && m.t >= t0 && m.t <= t1);
    }, [sim, events, isTransmasc, calibrationFn, t0, t1]);

    // Y domains scale to what's visible in the current window.
    const yPrimary = useMemo(() => {
        let mx = -Infinity;
        for (const d of slice) if (d.p > mx) mx = d.p;
        for (const l of labPoints) if (l.v > mx) mx = l.v;
        for (const m of markers) if (m.v > mx) mx = m.v;
        // Keep the target band's lower edge on-screen so "below target" reads clearly,
        // without forcing the whole (often much higher) band into view.
        mx = Math.max(mx, primaryTarget.low * 1.05);
        return buildYDomain(0, mx);
    }, [slice, labPoints, markers, primaryTarget]);

    // Layout. The plot is drawn in raw SVG units, so unlike the rest of the UI
    // it does not follow the root font size. Reading that size back keeps the
    // axis type and the gutters it sits in proportional when the desktop scale
    // steps up. Recomputed with the measured size, which is what a breakpoint
    // change triggers.
    const ui = useMemo(() => {
        if (typeof window === 'undefined') return 1;
        const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return Number.isFinite(px) && px > 0 ? px / 16 : 1;
    }, [width, height]);
    const axisFont = 10 * ui;

    const mL = 32 * ui;
    // Mirrors the left gutter: the plot stays centred in the column, and the
    // last date label, centred on the plot's right edge, has room to finish.
    const mR = mL;
    const mT = 14 * ui;
    const mB = 26 * ui;
    const plotW = Math.max(0, width - mL - mR);
    const plotH = Math.max(0, height - mT - mB);

    // Entrance timing. A marker at x is delayed by however long the sweep takes
    // to reach it, so it lands with the line rather than ahead of it.
    const SWEEP_MS = 900;
    const sweepDelay = (x: number) =>
        plotW > 0 ? `${Math.round(Math.max(0, Math.min(1, (x - mL) / plotW)) * SWEEP_MS)}ms` : '0ms';

    // The vertical axis eases too. Targets stay exact, so hit-testing and the
    // window maths are unaffected; only what is drawn glides.
    const [vy0, vy1] = useEasedPair(yPrimary, false);

    const X = (time: number) => mL + (vt1 === vt0 ? 0 : ((time - vt0) / (vt1 - vt0)) * plotW);
    const YP = (v: number) => mT + plotH - ((v - vy0) / (vy1 - vy0)) * plotH;

    // Monotone cubic Hermite interpolation (Fritsch–Carlson), the same curve
    // family as d3's curveMonotoneX: smoothly connects the sample points
    // without ever overshooting past a local min/max, so a peak never renders
    // higher than the data and a trough never dips below it. Straight `L`
    // segments would always look faceted at the scale a PK curve is viewed at,
    // no matter how dense the underlying simulation grid is.
    const monotonePath = (xs: number[], ys: number[]): string => {
        const n = xs.length;
        if (n === 0) return '';
        if (n === 1) return `M${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;

        const d: number[] = [];
        for (let i = 0; i < n - 1; i++) {
            const h = xs[i + 1] - xs[i];
            d.push(h !== 0 ? (ys[i + 1] - ys[i]) / h : 0);
        }

        const m: number[] = new Array(n);
        m[0] = d[0];
        m[n - 1] = d[n - 2];
        for (let i = 1; i < n - 1; i++) {
            m[i] = (d[i - 1] === 0 || d[i] === 0 || (d[i - 1] < 0) !== (d[i] < 0))
                ? 0
                : (d[i - 1] + d[i]) / 2;
        }
        for (let i = 0; i < n - 1; i++) {
            if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
            const a = m[i] / d[i];
            const b = m[i + 1] / d[i];
            const s = a * a + b * b;
            if (s > 9) {
                const t = 3 / Math.sqrt(s);
                m[i] *= t;
                m[i + 1] *= t;
            }
        }

        let out = `M${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
        for (let i = 0; i < n - 1; i++) {
            const dx = (xs[i + 1] - xs[i]) / 3;
            const c1x = xs[i] + dx;
            const c1y = ys[i] + m[i] * dx;
            const c2x = xs[i + 1] - dx;
            const c2y = ys[i + 1] - m[i + 1] * dx;
            out += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)} ${ys[i + 1].toFixed(1)}`;
        }
        return out;
    };

    const linePath = () => {
        let d = '';
        let xs: number[] = [];
        let ys: number[] = [];
        const flush = () => {
            if (xs.length) d += monotonePath(xs, ys);
            xs = [];
            ys = [];
        };
        for (const pt of slice) {
            if (!Number.isFinite(pt.p)) { flush(); continue; }
            xs.push(X(pt.t));
            ys.push(YP(pt.p));
        }
        flush();
        return d;
    };

    const xTicks = useMemo(() => {
        if (plotW <= 0) return [];
        const count = Math.max(2, Math.min(6, Math.floor(plotW / (90 * ui))));
        const seen = new Set<string>();
        const out: { time: number; label: string }[] = [];
        for (let i = 0; i <= count; i++) {
            const time = t0 + ((t1 - t0) * i) / count;
            const label = formatDate(new Date(time), lang, timeZone);
            if (seen.has(label)) continue;
            seen.add(label);
            out.push({ time, label });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t0, t1, plotW, lang, timeZone, mL, ui]);

    // Label sets for both axes, each carrying whatever it is replacing.
    const yTickVals = useMemo(() => ticksFor(yPrimary), [yPrimary]);
    const yFade = useFadingSet(yTickVals, yTickVals.join(','));
    const xFade = useFadingSet(xTicks, xTicks.map(t => t.label).join('|'), dragging);

    // Mid-rescale an incoming set can be crushed together. Its rules still
    // read; the numbers wait until there is room to hold them.
    const roomFor = (vals: number[]) =>
        vals.length < 2 || Math.abs(YP(vals[0]) - YP(vals[1])) >= 26 * ui;

    // "Now" position on the primary curve.
    const nowVal = useMemo(() => {
        if (!sim) return null;
        const h = now / HOUR;
        const v = isTransmasc
            ? interpolateConcentration_T(sim, h)
            : (() => { const e = interpolateConcentration_E2(sim, h); return e == null ? null : e * calibrationFn(h); })();
        return v != null && Number.isFinite(v) ? v : null;
    }, [sim, now, isTransmasc, calibrationFn]);

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

    // Pages only draw the chart once there are doses, and say "no records"
    // themselves (with their own illustration) when there aren't. So this is
    // just a held space of the chart's height, never a second empty state.
    if (!sim || sim.timeH.length === 0) {
        return <div className="h-72 md:h-96" aria-hidden="true" />;
    }

    const chipBase = 'relative px-2 py-0.5 text-[0.6875rem] rounded-md border border-transparent transition-colors';
    const chipOn = 'text-body font-medium';
    const chipOff = 'text-muted hover:text-body';

    return (
        <div className="w-full">
            {/* Header: title + range chips — flat, matching the page */}
            <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] truncate">
                    {title ?? t('chart.title')}
                </h2>
                <div className="flex items-center gap-2 shrink-0">
                    {Math.abs(calFactor - 1) > 0.001 && (
                        <span className="text-[0.625rem] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] opacity-70 tabular-nums">
                            {t('chart.cal_factor').replace('{n}', calFactor.toFixed(2))}
                        </span>
                    )}
                    <div ref={chipsRef} className="relative flex items-center gap-0.5">
                        {chipBox && (
                            <span
                                aria-hidden="true"
                                className="chip-slide pointer-events-none absolute rounded-md border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]"
                                style={{ left: chipBox.left, top: chipBox.top, width: chipBox.width, height: chipBox.height }}
                            />
                        )}
                        {rangeOpts.map(o => (
                            <button
                                key={o.key}
                                ref={el => { chipRefs.current[o.key] = el; }}
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
            <div className="flex items-center gap-4 mb-1 text-[0.6875rem] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-[2px] rounded-full" style={{ background: c.primary }} />
                    {primaryMeta.label}
                </span>
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
                            <clipPath id={`sweep-${clipId}`}>
                                <rect className="chart-sweep" x={mL} y={0} width={plotW} height={height} />
                            </clipPath>
                            <clipPath id={`clip-${clipId}`}>
                                <rect x={mL} y={mT - 4} width={plotW} height={plotH + 8} />
                            </clipPath>
                        </defs>

                        {/* Target reference band — quiet wash marking the typical range */}
                        {primaryTarget && (() => {
                            const yHi = Math.max(mT, Math.min(mT + plotH, YP(primaryTarget.high)));
                            const yLo = Math.max(mT, Math.min(mT + plotH, YP(primaryTarget.low)));
                            if (yLo - yHi < 0.5) return null; // band entirely off-screen
                            const rawLo = YP(primaryTarget.low);
                            const rawHi = YP(primaryTarget.high);
                            const inView = (y: number) => y >= mT - 0.5 && y <= mT + plotH + 0.5;
                            return (
                                <g className="chart-appear" style={{ animationDelay: '120ms' }}>
                                    <rect x={mL} y={yHi} width={plotW} height={yLo - yHi} fill={c.primary} opacity={0.06} />
                                    {inView(rawLo) && <line x1={mL} y1={yLo} x2={mL + plotW} y2={yLo} stroke={c.faint} strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />}
                                    {inView(rawHi) && <line x1={mL} y1={yHi} x2={mL + plotW} y2={yHi} stroke={c.faint} strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />}
                                    <text x={mL + 4 * ui} y={Math.min(mT + plotH - 3 * ui, yHi + 11 * ui)} fontSize={9 * ui} fill={c.axis} opacity={0.75}>{t('chart.target')}</text>
                                </g>
                            );
                        })()}

                        {/* Horizontal grid + primary axis labels. The outgoing
                            set is kept alongside the incoming one and both are
                            positioned on the eased domain, so a rescale slides
                            and dissolves rather than jumping. */}
                        {([['out', yFade.prev, 1 - yFade.u], ['in', yFade.next, yFade.u]] as const).map(([tag, set, o]) =>
                            o <= 0.002 ? null : (
                                <g key={`yg-${tag}`} opacity={o}>
                                    {set.map((v, i) => {
                                        const y = YP(v);
                                        if (y < mT - 0.5 || y > mT + plotH + 0.5) return null;
                                        return (
                                            <g key={`yp-${i}`}
                                               className={tag === 'in' ? 'chart-appear' : undefined}
                                               style={tag === 'in' ? { animationDelay: `${i * 45}ms` } : undefined}>
                                                <line x1={mL} y1={y} x2={mL + plotW} y2={y} stroke={c.grid} strokeWidth={1} />
                                                {roomFor(set) && (
                                                    <text x={mL - 8 * ui} y={y + 3 * ui} textAnchor="end" fontSize={axisFont} fill={c.axis}>{fmtAxis(v)}</text>
                                                )}
                                            </g>
                                        );
                                    })}
                                </g>
                            )
                        )}

                        {/* X axis labels, on the same treatment */}
                        {([['out', xFade.prev, 1 - xFade.u], ['in', xFade.next, xFade.u]] as const).map(([tag, set, o]) =>
                            o <= 0.002 ? null : (
                                <g key={`xg-${tag}`} opacity={o}>
                                    {set.map((tk, i) => {
                                        const x = X(tk.time);
                                        if (x < mL - 40 || x > mL + plotW + 40) return null;
                                        return (
                                            <text key={`x-${i}`}
                                                  className={tag === 'in' ? 'chart-appear' : undefined}
                                                  style={tag === 'in' ? { animationDelay: sweepDelay(x) } : undefined}
                                                  x={x} y={mT + plotH + 16 * ui} textAnchor="middle"
                                                  fontSize={axisFont} fill={c.axis}>{tk.label}</text>
                                        );
                                    })}
                                </g>
                            )
                        )}

                        <g clipPath={`url(#clip-${clipId})`}>
                            <g clipPath={`url(#sweep-${clipId})`}>
                                <path d={linePath()} fill="none" stroke={c.primary} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
                            </g>

                            {/* "Now" line + dot */}
                            {now >= t0 && now <= t1 && (
                                <line className="chart-appear" style={{ animationDelay: sweepDelay(X(now)) }} x1={X(now)} y1={mT} x2={X(now)} y2={mT + plotH} stroke={c.primary} strokeWidth={1} strokeDasharray="3 4" opacity={0.5} />
                            )}
                            {nowVal != null && now >= t0 && now <= t1 && (
                                <circle className="chart-mark" style={{ animationDelay: sweepDelay(X(now)) }} cx={X(now)} cy={YP(nowVal)} r={4} fill={c.primary} stroke={c.dot} strokeWidth={2} />
                            )}

                            {/* Dose markers (clickable) */}
                            {markers.map((m, i) => {
                                const cx = X(m.t);
                                const cy = YP(m.v);
                                return (
                                    <g
                                        key={`m-${i}`}
                                        className={`chart-mark${onPointClick ? ' cursor-pointer' : ''}`}
                                        style={{ animationDelay: sweepDelay(cx) }}
                                        onClick={() => onPointClick?.(m.event)}
                                    >
                                        <circle cx={cx} cy={cy} r={9} fill="transparent" />
                                        <circle cx={cx} cy={cy} r={3} fill={c.dot} stroke={c.primary} strokeWidth={1.5} />
                                    </g>
                                );
                            })}

                            {/* Lab results (measured) — hollow diamonds */}
                            {labPoints.map((l, i) => {
                                const cx = X(l.t);
                                const cy = YP(l.v);
                                return (
                                    <g key={`l-${i}`} className="chart-mark" style={{ animationDelay: sweepDelay(cx) }}>
                                        <rect
                                            x={cx - 4} y={cy - 4} width={8} height={8}
                                            transform={`rotate(45 ${cx} ${cy})`}
                                            fill={c.dot} stroke={c.lab} strokeWidth={1.75}
                                        />
                                    </g>
                                );
                            })}

                            {/* Hover crosshair + dot */}
                            {showHover && (
                                <>
                                    <line x1={X(hoverPt!.t)} y1={mT} x2={X(hoverPt!.t)} y2={mT + plotH} stroke={c.faint} strokeWidth={1} />
                                    <circle cx={X(hoverPt!.t)} cy={YP(hoverPt!.p)} r={4} fill={c.primary} stroke={c.dot} strokeWidth={2} />
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
                        <div className="text-[0.625rem] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-0.5 whitespace-nowrap">
                            {formatDate(new Date(hoverPt!.t), lang, timeZone)} · {formatTime(new Date(hoverPt!.t), timeZone)}
                        </div>
                        <div className="flex items-baseline gap-1 whitespace-nowrap">
                            <span className="text-sm font-medium tabular-nums" style={{ color: c.primary }}>
                                {hoverPt!.p.toFixed(primaryMeta.decimals)}
                            </span>
                            <span className="text-[0.625rem] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{primaryMeta.unit}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ResultChart;
