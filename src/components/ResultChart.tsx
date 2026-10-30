import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { formatDate, formatTime } from '../utils/helpers';
import { fill } from '../utils/regimenText';
import { labVsModelPct } from '../utils/labReport';
import {
    SimulationResult,
    DoseEvent,
    LabResult,
    HRTMode,
    interpolateConcentration_E2,
    interpolateConcentration_CPA,
    interpolateConcentration_T,
    convertToPgMl,
    convertToNgDl,
    isT_LabUnit,
    T_ESTERS,
    CPA_MIN_NGML,
    isEstradiolEster,
    isUnmodelledDrug,
} from '../../logic';
import { useHRTMode } from '../contexts/HRTModeContext';
import { useElementSize } from '../hooks/useElementSize';
import Segmented from './Segmented';

const HOUR = 3600000;
const DAY = 24 * HOUR;

type RangeKey = '7d' | '30d' | 'all';

/**
 * The midnight that starts the day `ms` falls in, and that day's number
 * counted from 1970-01-01, in `timeZone` (a shared chart's) or the device's
 * own. What the x-axis ticks step along.
 */
const dayOf = (ms: number, timeZone?: string): { start: number; n: number } => {
    if (!timeZone) {
        const d = new Date(ms);
        d.setHours(0, 0, 0, 0);
        return { start: d.getTime(), n: Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY) };
    }
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
    });
    // The date on the wall clock at `at`, as a day number, and how long the
    // clock says it has been since that date's midnight.
    const wall = (at: number) => {
        const parts = fmt.formatToParts(new Date(at));
        const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value ?? 0);
        return {
            n: Math.round(Date.UTC(get('year'), get('month') - 1, get('day')) / DAY),
            since: ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 + (at % 1000),
        };
    };
    const here = wall(ms);
    // Stepping back by the clock's time since midnight is out by the size of
    // any clock change earlier that day: after a spring-forward it lands on
    // 23:00 the day before, after a fall-back on 01:00. Reading the clock
    // again where it landed and taking up the difference finds the midnight
    // itself.
    const guess = ms - here.since;
    const there = wall(guess);
    let start = there.n === here.n ? guess - there.since : guess + DAY - there.since;
    // A clock that goes back across midnight (Cuba's does) shows 00:00
    // twice, and the day starts at the first of them.
    const before = wall(start - 1);
    if (before.n === here.n) start -= 1 + before.since;
    return { start, n: here.n };
};

// Pick a "nice" rounding step (1/2/5 × 10^n) near the requested magnitude.
const niceStep = (raw: number): number => {
    if (!(raw > 0)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    return nice * mag;
};

// Build a padded, tick-friendly [min, max] domain from observed values,
// around `steps` gridlines. The span never drops below `minSpan`, so a curve
// that has all but washed out is not blown up to fill the plot.
const buildYDomain = (min: number, max: number, steps = 4, minSpan = 0): [number, number] => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0) return [0, Math.max(1, minSpan)];
    if (max - min < minSpan) {
        const mid = (min + max) / 2;
        min = Math.max(0, mid - minSpan / 2);
        max = min + minSpan;
    }
    if (max === min) max = max + (max * 0.15 || 1);
    const pad = (max - min) * 0.12;
    const step = niceStep((max - min + 2 * pad) / steps);
    const lo = Math.max(0, Math.floor((min - pad) / step) * step);
    let hi = Math.ceil((max + pad) / step) * step;
    if (hi <= lo) hi = lo + step;
    return [lo, hi];
};

const ticksFor = ([lo, hi]: [number, number], steps = 4): number[] => {
    const step = niceStep((hi - lo) / steps);
    const out: number[] = [];
    // From the first whole step: an autoscaled axis need not start at zero.
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 0.5; v += step)
        out.push(Math.round(v / step) * step);
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
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
            shownRef.current = targetRef.current;
            setShown(targetRef.current);
            return;
        }
        if (rafRef.current) return; // already easing — let it keep going
        lastRef.current = performance.now();
        const step = (now: number) => {
            const dt = Math.min(64, now - lastRef.current);
            lastRef.current = now;
            const [tl, th] = targetRef.current;
            const [cl, ch] = shownRef.current;
            const k = 1 - Math.exp(-dt / 95); // ~95 ms time constant
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

    // Clearing the id as well as cancelling the frame: StrictMode in
    // development runs this cleanup and then the effect above again, which
    // took the stale id for an ease in flight and never started one, so the
    // drawn window stayed on 7d whatever range was picked.
    useEffect(
        () => () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
        },
        [],
    );

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
        if (instant || prefersReducedMotion()) {
            setFade({ prev: [], u: 1 });
            return;
        }
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

// Whether a cyproterone level is high enough to be worth an axis of its own
// (see CPA_MIN_NGML). The curve itself is always drawn in full, down to zero.
const cpaMeaningful = (v: number | null | undefined) => v != null && v >= CPA_MIN_NGML;

// Linear read-off of a sampled series at an arbitrary time, so the edges of a
// window can be valued exactly rather than by the nearest sample outside it.
const valueAt = (
    data: { t: number; p: number | null; s: number | null }[],
    key: 'p' | 's',
    time: number,
): number | null => {
    if (!data.length) return null;
    let lo = 0,
        hi = data.length - 1;
    if (time <= data[0].t) return data[0][key];
    if (time >= data[hi].t) return data[hi][key];
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (data[mid].t <= time) lo = mid;
        else hi = mid;
    }
    const a = data[lo][key],
        b = data[hi][key];
    if (a == null || b == null) return a ?? b;
    const f = (time - data[lo].t) / (data[hi].t - data[lo].t || 1);
    return a + (b - a) * f;
};

// The cyproterone axis never spans less than this (ng/mL). Autoscaled to the
// tail of a dose washing out, the curve would otherwise fill the plot.
const CPA_AXIS_MIN = 1;

// Past "now" every curve is an assumption rather than a record, and is drawn
// dashed. Where a curve is already dotted (mono, to tell CPA apart) it keeps
// its dots and the ahead part just steps back.
const AHEAD_DASH = '5 4';
const AHEAD_OPACITY = 0.7;

/** What the curve past "now" assumes: the plan's doses, the rhythm read off the log, or none at all. */
export type AheadBasis = 'plan' | 'rhythm' | 'none';

// The line draws itself on once per visit to the app. Coming back to the
// Overview from one of its pages remounts the chart, and playing the sweep
// again there made the returning page arrive half drawn and fill in after.
let entrancePlayed = false;

const ResultChart = ({
    sim,
    showAhead = false,
    ahead = null,
    aheadBasis = 'none',
    events,
    labResults = [],
    calibrationFn = (_t: number) => 1,
    onPointClick,
    isDarkMode = false,
    isMono = false,
    mode,
    title,
    timeZone,
}: {
    sim: SimulationResult | null;
    /** Past "now", draw `ahead` dashed. Off, the chart is as it always was: `sim` throughout, solid. */
    showAhead?: boolean;
    /** `sim` run on with the doses `aheadBasis` expects; drawn in its place after "now". */
    ahead?: SimulationResult | null;
    aheadBasis?: AheadBasis;
    events: DoseEvent[];
    labResults?: LabResult[];
    calibrationFn?: (timeH: number) => number;
    onPointClick?: (e: DoseEvent) => void;
    isDarkMode?: boolean;
    isMono?: boolean;
    mode?: HRTMode;
    title?: string;
    timeZone?: string;
}) => {
    const { t, lang } = useTranslation();
    const { isTransmasc: contextIsTransmasc } = useHRTMode();
    const [still] = useState(() => entrancePlayed);
    useEffect(() => {
        entrancePlayed = true;
    }, []);
    const isTransmasc = mode ? mode === 'transmasc' : contextIsTransmasc;
    const clipId = useId().replace(/:/g, '');

    const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
    const { width, height } = useElementSize(plotEl);

    const [range, setRange] = useState<RangeKey>('7d');
    const [hover, setHover] = useState<number | null>(null);
    const [panOffset, setPanOffset] = useState(0); // ms the window is dragged from its centered base
    const [dragging, setDragging] = useState(false);
    const dragRef = useRef<{
        startX: number;
        startY: number;
        startOffset: number;
        moved: boolean;
        pointerId: number;
    } | null>(null);
    // Where the current press went down, pan or no pan, so lifting can tell a tap from a swipe.
    const pressRef = useRef<{ x: number; y: number } | null>(null);

    const selectRange = (r: RangeKey) => {
        setRange(r);
        setPanOffset(0);
    };

    // The chart tokens (chart-line, chart-second, chart-grid, chart-axis,
    // chart-dot, chart-lab) as hex, because SVG attributes are set from here:
    // terracotta on a warm neutral grid, axis figures at text-muted strength.
    const c = isDarkMode
        ? {
              primary: '#df8f74',
              second: '#838078',
              grid: '#2c2a26',
              axis: '#a7a49e',
              faint: '#6b6860',
              dot: '#181714',
              lab: '#facebd',
          }
        : {
              primary: '#cc785c',
              second: '#a7a49e',
              grid: '#eeedea',
              axis: '#6b6860',
              faint: '#a7a49e',
              dot: '#ffffff',
              lab: '#924833',
          };

    // Which series are relevant for the current mode / logged doses: total T
    // for transmasc; E2 for transfem, with cyproterone on its own right-hand
    // axis, or cyproterone alone when it is all that has been logged.
    const hasE2 = !isTransmasc && events.some(e => isEstradiolEster(e.ester));
    const hasCPA = !isTransmasc && events.some(e => e.ester === 'CPA');
    const primaryIsCPA = hasCPA && !hasE2;
    const hasSecondary = hasE2 && hasCPA;

    const primaryMeta = isTransmasc
        ? { label: t('label.total_t'), unit: 'ng/dL', decimals: 0 }
        : primaryIsCPA
          ? { label: t('label.cpa_chart'), unit: 'ng/mL', decimals: 2 }
          : { label: t('label.e2'), unit: 'pg/mL', decimals: 1 };

    // Typical target band, matching the reference ranges the app uses for its
    // status labels (see useAppData currentStatus): transmasc total-T sits in
    // the ~300–1000 ng/dL male range; transfem E2 in the ~100–200 pg/mL band.
    // Cyproterone has no target range, so it gets none.
    const primaryTarget = useMemo<{ low: number; high: number } | null>(() => {
        if (isTransmasc) return { low: 300, high: 1000 };
        if (primaryIsCPA) return null;
        return { low: 100, high: 200 };
    }, [isTransmasc, primaryIsCPA]);

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

    // Resample the simulation into the (time, primary, secondary) shape we
    // plot, `f` marking samples after "now". Those come from `ahead` when
    // there is one, up to where `sim` itself ends, so the window spans the
    // same dates either way. With `showAhead` off the chart is as it always
    // was: `sim` throughout, past "now" too, solid, nothing marked as ahead.
    // Cyproterone is drawn as modelled, all the way down, so its curve never
    // breaks off as a dose washes out.
    const data = useMemo(() => {
        type Pt = { t: number; p: number | null; s: number | null; f: boolean };
        if (!sim || sim.timeH.length === 0) return [] as Pt[];
        const nowH = now / HOUR;
        const point = (src: SimulationResult, i: number): Pt => {
            const h = src.timeH[i];
            const time = h * HOUR;
            const f = showAhead && h > nowH;
            if (isTransmasc) return { t: time, p: src.concNGdL_T?.[i] ?? 0, s: null, f };
            const cpa = src.concPGmL_CPA[i] ?? 0;
            if (primaryIsCPA) return { t: time, p: cpa, s: null, f };
            return { t: time, p: src.concPGmL_E2[i] * calibrationFn(h), s: hasSecondary ? cpa : null, f };
        };
        const out: Pt[] = [];
        for (let i = 0; i < sim.timeH.length; i++) {
            if (showAhead && ahead && sim.timeH[i] > nowH) break;
            out.push(point(sim, i));
        }
        if (showAhead && ahead) {
            const endH = sim.timeH[sim.timeH.length - 1];
            for (let i = 0; i < ahead.timeH.length && ahead.timeH[i] <= endH; i++) {
                if (ahead.timeH[i] > nowH) out.push(point(ahead, i));
            }
        }
        return out;
    }, [sim, showAhead, ahead, now, calibrationFn, isTransmasc, primaryIsCPA, hasSecondary]);

    const fullMin = data.length ? data[0].t : now;
    const fullMax = data.length ? data[data.length - 1].t : now;

    // Base window (before drag) — centered on "now" for 7d/30d, full span for "all".
    const baseWindow = useMemo<[number, number]>(() => {
        if (range === 'all' || data.length === 0) return [fullMin, fullMax];
        const span = range === '7d' ? 7 * DAY : 30 * DAY;
        const center = Math.min(Math.max(now, fullMin), fullMax);
        let lo = center - span / 2;
        let hi = center + span / 2;
        if (lo < fullMin) {
            lo = fullMin;
            hi = Math.min(fullMax, lo + span);
        }
        if (hi > fullMax) {
            hi = fullMax;
            lo = Math.max(fullMin, hi - span);
        }
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
        const lo0 = Math.min(t0, vt0),
            hi0 = Math.max(t1, vt1);
        let lo = 0,
            hi = data.length - 1;
        while (lo < data.length - 1 && data[lo + 1].t < lo0) lo++;
        while (hi > 0 && data[hi - 1].t > hi0) hi--;
        return data.slice(Math.max(0, lo), Math.min(data.length, hi + 1));
    }, [data, t0, t1, vt0, vt1]);

    // Labs and dose markers are worked out once, then drawn wherever they fall
    // in what is on screen: mid-stretch that is wider than the window being
    // headed for, and filtering them to the target made them vanish early.
    const allLabPoints = useMemo(() => {
        if (!labResults.length) return [];
        return labResults
            .filter(l => (isTransmasc ? isT_LabUnit(l.unit) : !isT_LabUnit(l.unit)))
            .map(l => ({
                t: l.timeH * HOUR,
                v: isTransmasc ? convertToNgDl(l.concValue, l.unit) : convertToPgMl(l.concValue, l.unit),
                raw: l.concValue,
                unit: l.unit,
                id: l.id,
            }));
    }, [labResults, isTransmasc]);

    // Dose markers sit on whichever axis their compound belongs to. A drug
    // with no level model has no curve to sit on, so it gets no marker.
    const allMarkers = useMemo(() => {
        if (!sim) return [];
        return events
            .map(e => {
                const isT = T_ESTERS.has(e.ester);
                const isCPA = e.ester === 'CPA';
                if ((isTransmasc ? !isT : isT) || isUnmodelledDrug(e.ester)) return null;
                let value: number | null, axis: 'p' | 's';
                if (isTransmasc) {
                    value = interpolateConcentration_T(sim, e.timeH);
                    axis = 'p';
                } else if (isCPA) {
                    value = interpolateConcentration_CPA(sim, e.timeH);
                    axis = hasSecondary ? 's' : 'p';
                } else {
                    const v = interpolateConcentration_E2(sim, e.timeH);
                    value = v == null ? null : v * calibrationFn(e.timeH);
                    axis = 'p';
                }
                const v = value != null && Number.isFinite(value) ? value : 0;
                return { t: e.timeH * HOUR, v, axis, event: e };
            })
            .filter((m): m is { t: number; v: number; axis: 'p' | 's'; event: DoseEvent } => !!m);
    }, [sim, events, isTransmasc, hasSecondary, calibrationFn]);

    const onScreen = (time: number) => time >= Math.min(t0, vt0) && time <= Math.max(t1, vt1);
    const labPoints = allLabPoints.filter(l => onScreen(l.t));
    const markers = allMarkers.filter(m => onScreen(m.t));

    // Y domains scale to the window being shown, and only that: the samples
    // inside it, its two edges read off exactly, and the labs and doses in it.
    // Not to whatever is mid-stretch on screen, which kept re-aiming the axis
    // every frame of a range change, and not to the neighbouring sample just
    // outside the window, which could stretch the axis to a peak off-screen.
    // Both ends follow the window, not just the top: pinned to zero, a level
    // swinging between 250 and 300 was a flat line along the top of the plot.
    const windowExtent = useMemo(() => {
        const e = { pLo: Infinity, pHi: -Infinity, sLo: Infinity, sHi: -Infinity };
        const take = (key: 'p' | 's', v: number | null | undefined) => {
            if (v == null || !Number.isFinite(v)) return;
            if (key === 'p') {
                e.pLo = Math.min(e.pLo, v);
                e.pHi = Math.max(e.pHi, v);
            } else {
                e.sLo = Math.min(e.sLo, v);
                e.sHi = Math.max(e.sHi, v);
            }
        };
        for (const time of [t0, t1]) {
            take('p', valueAt(data, 'p', time));
            take('s', valueAt(data, 's', time));
        }
        for (const d of data) {
            if (d.t < t0 || d.t > t1) continue;
            take('p', d.p);
            take('s', d.s);
        }
        for (const l of allLabPoints) if (l.t >= t0 && l.t <= t1) take('p', l.v);
        for (const m of allMarkers) if (m.t >= t0 && m.t <= t1) take(m.axis, m.v);
        return e;
    }, [data, allLabPoints, allMarkers, t0, t1]);

    // With cyproterone beside estradiol the chart splits in two, estradiol
    // above and cyproterone below, each on its own axis: on one shared plot
    // the two scales crossed and neither could be read against its numbers.
    // The lower plot is the smaller one and steps in fewer gridlines.
    const S_STEPS = 3;

    const yPrimary = useMemo(
        () => buildYDomain(windowExtent.pLo, windowExtent.pHi, 4, isTransmasc ? 100 : primaryIsCPA ? CPA_AXIS_MIN : 20),
        [windowExtent, isTransmasc, primaryIsCPA],
    );

    const ySecondary = useMemo(() => {
        if (!hasSecondary) return [0, 1] as [number, number];
        return buildYDomain(windowExtent.sLo, windowExtent.sHi, S_STEPS, CPA_AXIS_MIN);
    }, [windowExtent, hasSecondary]);
    // The lower axis is only labelled while the window holds a level of
    // cyproterone worth reading; the curve itself is drawn either way.
    const cpaInView = hasSecondary && cpaMeaningful(windowExtent.sHi);

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
    // 12px, the design system's floor for anything meant to be read.
    const axisFont = 13 * ui;

    // Gutters wide enough for the longest label they hold, so "5000" or
    // "0.50" is never clipped by the edge of the plot. Digits run about 0.6em.
    const labelW = (vals: number[]) => Math.max(0, ...vals.map(v => fmtAxis(v).length)) * axisFont * 0.6;
    const yTickVals = useMemo(() => ticksFor(yPrimary), [yPrimary]);
    const ysTickVals = useMemo(() => (cpaInView ? ticksFor(ySecondary, S_STEPS) : []), [cpaInView, ySecondary]);
    // Both plots' numbers sit in the left gutter, one above the other.
    const mLTarget = Math.max(32 * ui, labelW([...yTickVals, ...ysTickVals]) + 12 * ui);
    // A gutter that widens for "1000" eases with the axes rather than jumping
    // the whole plot sideways at the start of a range change. The right one
    // matches it, so the plot stays centred in the column and the last date
    // label, centred on the plot's right edge, has room to finish.
    const [mL] = useEasedPair([mLTarget, mLTarget], false);
    const mR = mL;
    // Room above the plot for the "now" line's label.
    const mT = 32 * ui;
    const mB = 26 * ui;
    const plotW = Math.max(0, width - mL - mR);
    const plotH = Math.max(0, height - mT - mB);
    // Split, the two plots share the window and the dates along the bottom,
    // with a gap between them and the lower one about a third of the height.
    const gapH = hasSecondary ? 42 * ui : 0;
    const sH = hasSecondary ? Math.round((plotH - gapH) * 0.36) : 0;
    const pH = Math.max(0, plotH - gapH - sH);
    const sTop = mT + pH + gapH;

    // Entrance timing. A marker at x is delayed by however long the sweep takes
    // to reach it, so it lands with the line rather than ahead of it.
    const SWEEP_MS = 900;
    const sweepDelay = (x: number) =>
        plotW > 0 ? `${Math.round(Math.max(0, Math.min(1, (x - mL) / plotW)) * SWEEP_MS)}ms` : '0ms';

    // The vertical axes ease too. Targets stay exact, so hit-testing and the
    // window maths are unaffected; only what is drawn glides.
    const [vy0, vy1] = useEasedPair(yPrimary, false);
    const [vs0, vs1] = useEasedPair(ySecondary, false);

    const X = (time: number) => mL + (vt1 === vt0 ? 0 : ((time - vt0) / (vt1 - vt0)) * plotW);
    const YP = (v: number) => mT + pH - ((v - vy0) / (vy1 - vy0)) * pH;
    const YS = (v: number) => sTop + sH - ((v - vs0) / (vs1 - vs0)) * sH;

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
            m[i] = d[i - 1] === 0 || d[i] === 0 || d[i - 1] < 0 !== d[i] < 0 ? 0 : (d[i - 1] + d[i]) / 2;
        }
        for (let i = 0; i < n - 1; i++) {
            if (d[i] === 0) {
                m[i] = 0;
                m[i + 1] = 0;
                continue;
            }
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

    // One series, either the run up to "now" or the run after it. The run
    // after starts from the last sample before, so the two meet at the line.
    const linePath = (key: 'p' | 's', after: boolean) => {
        let d = '';
        let xs: number[] = [];
        let ys: number[] = [];
        const flush = () => {
            if (xs.length) d += monotonePath(xs, ys);
            xs = [];
            ys = [];
        };
        for (let i = 0; i < slice.length; i++) {
            const pt = slice[i];
            const inRun = after ? pt.f || !!slice[i + 1]?.f : !pt.f;
            const val = pt[key];
            if (!inRun || val == null || !Number.isFinite(val)) {
                flush();
                continue;
            }
            xs.push(X(pt.t));
            ys.push(key === 'p' ? YP(val) : YS(val));
        }
        flush();
        return d;
    };

    // Ticks on the start of a day, a whole number of days apart, so equal
    // gaps on the axis are equal stretches of time. Evenly spaced moments
    // labelled with whatever day they fell in skipped a day here and there
    // (9, 12, 14, 16), which read as a gap in the record. Steps count from a
    // fixed day (weeks from a Monday), so panning slides the ticks along
    // rather than reshuffling which days get one.
    const xTicks = useMemo(() => {
        if (plotW <= 0) return [];
        const span = (t1 - t0) / DAY;
        // The shortest step that keeps neighbouring dates a label and a gap
        // apart. Rationing the step by a label count instead left every range
        // on a phone with two dates, and a 7-day desktop axis with three.
        const minGap = 64 * ui;
        const step =
            [1, 2, 3, 7, 14, 28, 56, 91, 182, 364].find(s => (plotW * s) / span >= minGap) ??
            Math.ceil((span * minGap) / plotW);
        const phase = step % 7 === 0 ? 3 : 0;
        const seen = new Set<string>();
        const out: { time: number; label: string }[] = [];
        // Half a day past a midnight, then back to it, so a 23- or 25-hour
        // day at a clock change still lands on the right date.
        let day = dayOf(t0, timeZone);
        if (day.start < t0) day = dayOf(day.start + 1.5 * DAY, timeZone);
        const ahead = (step - ((day.n + phase) % step)) % step;
        if (ahead) day = dayOf(day.start + (ahead + 0.5) * DAY, timeZone);
        for (; day.start <= t1; day = dayOf(day.start + (step + 0.5) * DAY, timeZone)) {
            const label = formatDate(new Date(day.start), lang, timeZone);
            if (seen.has(label)) continue;
            seen.add(label);
            out.push({ time: day.start, label });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t0, t1, plotW, lang, timeZone, mL, ui]);

    // Label sets for both axes, each carrying whatever it is replacing.
    const yFade = useFadingSet(yTickVals, yTickVals.join(','));
    const ysFade = useFadingSet(ysTickVals, ysTickVals.join(','));
    const xFade = useFadingSet(xTicks, xTicks.map(t => t.label).join('|'), dragging);

    // Mid-rescale an incoming set can be crushed together. Its rules still
    // read; the numbers wait until there is room to hold them.
    const roomFor = (vals: number[], y: (v: number) => number, gap = 26) =>
        vals.length < 2 || Math.abs(y(vals[0]) - y(vals[1])) >= gap * ui;

    // "Now" position on the primary curve.
    const nowVal = useMemo(() => {
        if (!sim) return null;
        const h = now / HOUR;
        if (primaryIsCPA) return interpolateConcentration_CPA(sim, h);
        const v = isTransmasc
            ? interpolateConcentration_T(sim, h)
            : (() => {
                  const e = interpolateConcentration_E2(sim, h);
                  return e == null ? null : e * calibrationFn(h);
              })();
        return v != null && Number.isFinite(v) ? v : null;
    }, [sim, now, isTransmasc, primaryIsCPA, calibrationFn]);

    // "Now" position on the secondary (CPA) curve.
    const nowValS = useMemo(
        () => (sim && hasSecondary ? interpolateConcentration_CPA(sim, now / HOUR) : null),
        [sim, now, hasSecondary],
    );

    // Hover lookup — nearest sample to the pointer.
    const updateHover = (clientX: number) => {
        if (!plotEl || data.length === 0) return;
        const rect = plotEl.getBoundingClientRect();
        const px = clientX - rect.left;
        if (px < mL || px > mL + plotW) {
            setHover(null);
            return;
        }
        // The window as drawn, which mid-stretch is not yet the target.
        const time = vt0 + ((px - mL) / plotW) * (vt1 - vt0);
        let best = 0,
            bestDiff = Infinity;
        for (let i = 0; i < data.length; i++) {
            const diff = Math.abs(data[i].t - time);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = i;
            }
        }
        setHover(best);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        pressRef.current = { x: e.clientX, y: e.clientY };
        if (!canPan) return;
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startOffset: panOffset,
            moved: false,
            pointerId: e.pointerId,
        };
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
                    try {
                        e.currentTarget.setPointerCapture(drag.pointerId);
                    } catch {
                        /* ignore */
                    }
                } else if (Math.abs(dy) > 6) {
                    // Vertical scroll: bail out of the drag, and drop the press
                    // too, so the moves until the browser takes over don't
                    // scrub a readout (see onPointerUp).
                    dragRef.current = null;
                    pressRef.current = null;
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
        if (e.pointerType === 'touch' && !pressRef.current) return;
        updateHover(e.clientX);
    };

    const endDrag = (e?: React.PointerEvent) => {
        const drag = dragRef.current;
        if (drag && e) {
            try {
                e.currentTarget.releasePointerCapture(drag.pointerId);
            } catch {
                /* ignore */
            }
        }
        dragRef.current = null;
        pressRef.current = null;
        if (dragging) setDragging(false);
    };

    // A finger has no hover: every press on a pannable window starts a drag,
    // which keeps the readout away, and the "leave" a lifting finger fires
    // cleared whatever was left. So on touch the chart could only be looked
    // at. Now a tap that didn't turn into a pan or a scroll puts the readout
    // where it landed, and it stays until the next press outside the plot,
    // the way the heatmap's tooltip does. A tap on a dose marker that opens
    // the dose does only that; where nothing opens (a shared chart) it reads
    // the level like any other tap.
    const onPointerUp = (e: React.PointerEvent) => {
        const press = pressRef.current;
        const panned = !!dragRef.current?.moved;
        endDrag(e);
        if (e.pointerType === 'mouse' || !press || panned) return;
        if (Math.abs(e.clientX - press.x) > 10 || Math.abs(e.clientY - press.y) > 10) return;
        if (onPointClick && (e.target as Element).closest?.('[data-dose-marker]')) {
            setHover(null);
            return;
        }
        updateHover(e.clientX);
    };

    // A press that turns into a page scroll ends in a cancel, not a lift, and
    // the leave that used to clear the readout is now mouse-only, so the
    // cancel clears it: scrolling past the chart leaves no readout behind.
    const onPointerCancel = (e: React.PointerEvent) => {
        endDrag(e);
        if (e.pointerType !== 'mouse') setHover(null);
    };

    // Only a mouse leaving means "done looking"; see onPointerUp.
    const onPointerLeave = (e: React.PointerEvent) => {
        endDrag(e);
        if (e.pointerType === 'mouse') setHover(null);
    };

    // A tapped readout is dismissed by the next press anywhere outside the
    // plot. Capture phase, so a press on the plot itself is seen here first
    // and left alone for the tap above to move the readout.
    const hovering = hover != null;
    useEffect(() => {
        if (!hovering || !plotEl) return;
        const dismiss = (e: PointerEvent) => {
            if (!plotEl.contains(e.target as Node)) setHover(null);
        };
        window.addEventListener('pointerdown', dismiss, true);
        return () => window.removeEventListener('pointerdown', dismiss, true);
    }, [hovering, plotEl]);

    const hoverPt = hover != null ? data[hover] : null;
    const showHover = !dragging && hoverPt != null && hoverPt.t >= t0 && hoverPt.t <= t1 && plotW > 0;
    const calFactor = calibrationFn(now / HOUR);

    // A lab within a fingertip of the readout joins it, beside what the model
    // said for that moment before calibration: the line drawn is calibrated
    // onto the labs, so only the raw model tells whether it reads high or low.
    const hoverLab = (() => {
        if (!showHover || !sim) return null;
        const hx = X(hoverPt!.t);
        let best: (typeof labPoints)[number] | null = null;
        for (const l of labPoints) {
            const d = Math.abs(X(l.t) - hx);
            if (d <= 14 * ui && (!best || d < Math.abs(X(best.t) - hx))) best = l;
        }
        if (!best) return null;
        const h = best.t / HOUR;
        const m = isTransmasc ? interpolateConcentration_T(sim, h) : interpolateConcentration_E2(sim, h);
        const model = m != null && Number.isFinite(m) && m >= 1 ? m : null;
        return { ...best, model, pct: model != null ? labVsModelPct(best.v, model) : null };
    })();

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

    // Each plot names its line above itself, starting where the page column
    // does (the plot bleeds past it by its negative margin), with a swatch
    // drawn the way the line is.
    const colX = plotEl ? Math.max(0, -parseFloat(getComputedStyle(plotEl).marginLeft) || 0) : 0;
    const textW = (str: string) => [...str].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.6), 0) * axisFont;
    const seriesLabels = [
        {
            key: 'p',
            y: mT - 14 * ui,
            text: `${primaryMeta.label} ${primaryMeta.unit}`,
            color: c.primary,
            weight: 2,
            dash: isMono && primaryIsCPA ? '2 5' : undefined,
        },
        ...(hasSecondary
            ? [
                  {
                      key: 's',
                      y: sTop - 14 * ui,
                      text: `${t('label.cpa_chart')} ng/mL`,
                      color: c.second,
                      weight: 1.5,
                      dash: isMono ? '2 5' : undefined,
                  },
              ]
            : []),
    ];
    // "Now" gives way where it would run into the upper plot's name.
    const nowLabelFits = X(now) - textW(t('time.now')) / 2 - 8 * ui > colX + 20 * ui + textW(seriesLabels[0].text);

    // The target band as drawn, clamped to the plot; null while it is entirely off-screen.
    const band = (() => {
        if (!primaryTarget) return null;
        const yHi = Math.max(mT, Math.min(mT + pH, YP(primaryTarget.high)));
        const yLo = Math.max(mT, Math.min(mT + pH, YP(primaryTarget.low)));
        if (yLo - yHi < 0.5) return null;
        const inView = (y: number) => y >= mT - 0.5 && y <= mT + pH + 0.5;
        return { yHi, yLo, lowEdge: inView(YP(primaryTarget.low)), highEdge: inView(YP(primaryTarget.high)) };
    })();

    return (
        <div className="w-full">
            {/* Header: title + range chips — flat, matching the page */}
            <div className="flex items-center justify-between gap-3 mb-1">
                <h2 className="text-sm font-medium text-[var(--text)] truncate">{title ?? t('chart.title')}</h2>
                <Segmented
                    options={rangeOpts.map(o => ({ id: o.key, label: o.label }))}
                    value={range}
                    onChange={selectRange}
                    aria-label={title ?? t('chart.title')}
                />
            </div>

            {/* Plot */}
            {/* Taller when split, so neither plot is squeezed thinner than a glance can read. */}
            <div
                ref={setPlotEl}
                className={`relative ${hasSecondary ? 'h-[22rem] md:h-[28rem]' : 'h-72 md:h-96'} -mx-4 md:-mx-6 select-none touch-pan-y`}
            >
                {width > 0 && (
                    <svg
                        width={width}
                        height={height}
                        className={`block tabular-nums ${still ? 'chart-still' : ''}`}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerCancel}
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
                            {/* Each curve kept to its own plot while an axis eases. */}
                            <clipPath id={`clip-p-${clipId}`}>
                                <rect x={mL} y={mT - 4} width={plotW} height={pH + 8} />
                            </clipPath>
                            <clipPath id={`clip-s-${clipId}`}>
                                <rect x={mL} y={sTop - 4} width={plotW} height={sH + 8} />
                            </clipPath>
                        </defs>

                        {/* Target reference band — quiet wash marking the typical range */}
                        {band && (
                            <g className="chart-appear" style={{ animationDelay: '120ms' }}>
                                <rect
                                    x={mL}
                                    y={band.yHi}
                                    width={plotW}
                                    height={band.yLo - band.yHi}
                                    fill={c.primary}
                                    opacity={0.06}
                                />
                                {band.lowEdge && (
                                    <line
                                        x1={mL}
                                        y1={band.yLo}
                                        x2={mL + plotW}
                                        y2={band.yLo}
                                        stroke={c.faint}
                                        strokeWidth={1}
                                        strokeDasharray="2 4"
                                        opacity={0.6}
                                    />
                                )}
                                {band.highEdge && (
                                    <line
                                        x1={mL}
                                        y1={band.yHi}
                                        x2={mL + plotW}
                                        y2={band.yHi}
                                        stroke={c.faint}
                                        strokeWidth={1}
                                        strokeDasharray="2 4"
                                        opacity={0.6}
                                    />
                                )}
                            </g>
                        )}

                        {/* Horizontal grid + primary axis labels. The outgoing
                            set is kept alongside the incoming one and both are
                            positioned on the eased domain, so a rescale slides
                            and dissolves rather than jumping. */}
                        {(
                            [
                                ['out', yFade.prev, 1 - yFade.u],
                                ['in', yFade.next, yFade.u],
                            ] as const
                        ).map(([tag, set, o]) =>
                            o <= 0.002 ? null : (
                                <g key={`yg-${tag}`} opacity={o}>
                                    {set.map((v, i) => {
                                        const y = YP(v);
                                        if (y < mT - 0.5 || y > mT + pH + 0.5) return null;
                                        return (
                                            <g
                                                key={`yp-${i}`}
                                                className={tag === 'in' ? 'chart-appear' : undefined}
                                                style={tag === 'in' ? { animationDelay: `${i * 45}ms` } : undefined}
                                            >
                                                <line
                                                    x1={mL}
                                                    y1={y}
                                                    x2={mL + plotW}
                                                    y2={y}
                                                    stroke={c.grid}
                                                    strokeWidth={1}
                                                />
                                                {roomFor(set, YP) && (
                                                    <text
                                                        x={mL - 8 * ui}
                                                        y={y + 4 * ui}
                                                        textAnchor="end"
                                                        fontSize={axisFont}
                                                        fill={c.axis}
                                                    >
                                                        {fmtAxis(v)}
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    })}
                                </g>
                            ),
                        )}

                        {/* The lower (cyproterone) plot's grid and labels, on
                            the same treatment as the upper one's */}
                        {hasSecondary &&
                            (
                                [
                                    ['out', ysFade.prev, 1 - ysFade.u],
                                    ['in', ysFade.next, ysFade.u],
                                ] as const
                            ).map(([tag, set, o]) =>
                                o <= 0.002 ? null : (
                                    <g key={`ysg-${tag}`} opacity={o}>
                                        {set.map((v, i) => {
                                            const y = YS(v);
                                            if (y < sTop - 0.5 || y > sTop + sH + 0.5) return null;
                                            return (
                                                <g
                                                    key={`ys-${i}`}
                                                    className={tag === 'in' ? 'chart-appear' : undefined}
                                                    style={tag === 'in' ? { animationDelay: `${i * 45}ms` } : undefined}
                                                >
                                                    <line
                                                        x1={mL}
                                                        y1={y}
                                                        x2={mL + plotW}
                                                        y2={y}
                                                        stroke={c.grid}
                                                        strokeWidth={1}
                                                    />
                                                    {roomFor(set, YS, 18) && (
                                                        <text
                                                            x={mL - 8 * ui}
                                                            y={y + 4 * ui}
                                                            textAnchor="end"
                                                            fontSize={axisFont}
                                                            fill={c.axis}
                                                        >
                                                            {fmtAxis(v)}
                                                        </text>
                                                    )}
                                                </g>
                                            );
                                        })}
                                    </g>
                                ),
                            )}

                        {/* X axis labels, on the same treatment */}
                        {(
                            [
                                ['out', xFade.prev, 1 - xFade.u],
                                ['in', xFade.next, xFade.u],
                            ] as const
                        ).map(([tag, set, o]) =>
                            o <= 0.002 ? null : (
                                <g key={`xg-${tag}`} opacity={o}>
                                    {set.map((tk, i) => {
                                        const x = X(tk.time);
                                        if (x < mL - 40 || x > mL + plotW + 40) return null;
                                        return (
                                            <text
                                                key={`x-${i}`}
                                                className={tag === 'in' ? 'chart-appear' : undefined}
                                                style={tag === 'in' ? { animationDelay: sweepDelay(x) } : undefined}
                                                x={x}
                                                y={mT + plotH + 16 * ui}
                                                textAnchor="middle"
                                                fontSize={axisFont}
                                                fill={c.axis}
                                            >
                                                {tk.label}
                                            </text>
                                        );
                                    })}
                                </g>
                            ),
                        )}

                        {/* "Now" over the top of its dashed line, in the room
                            left above the plot for it. */}
                        {seriesLabels.map(l => (
                            <g key={`name-${l.key}`} className="chart-appear" pointerEvents="none">
                                <line
                                    x1={colX}
                                    y1={l.y - 4 * ui}
                                    x2={colX + 14 * ui}
                                    y2={l.y - 4 * ui}
                                    stroke={l.color}
                                    strokeWidth={l.weight}
                                    strokeLinecap="round"
                                    strokeDasharray={l.dash}
                                />
                                <text
                                    x={colX + 20 * ui}
                                    y={l.y}
                                    fontSize={axisFont}
                                    fill={c.axis}
                                    paintOrder="stroke"
                                    stroke={c.dot}
                                    strokeWidth={3 * ui}
                                    strokeLinejoin="round"
                                >
                                    {l.text}
                                </text>
                            </g>
                        ))}

                        {now >= t0 && now <= t1 && nowLabelFits && (
                            <text
                                className="chart-appear"
                                style={{ animationDelay: sweepDelay(X(now)) }}
                                x={X(now)}
                                y={mT - 14 * ui}
                                textAnchor="middle"
                                fontSize={axisFont}
                                fill={c.axis}
                                pointerEvents="none"
                            >
                                {t('time.now')}
                            </text>
                        )}

                        <g clipPath={`url(#clip-${clipId})`}>
                            <g clipPath={`url(#sweep-${clipId})`}>
                                <g clipPath={`url(#clip-p-${clipId})`}>
                                    {/* Primary curve — dotted in mono when it's the CPA series */}
                                    <path
                                        d={linePath('p', false)}
                                        fill="none"
                                        stroke={c.primary}
                                        strokeWidth={2}
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                        strokeDasharray={isMono && primaryIsCPA ? '2 5' : undefined}
                                    />
                                    <path
                                        d={linePath('p', true)}
                                        fill="none"
                                        stroke={c.primary}
                                        strokeWidth={2}
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                        strokeDasharray={isMono && primaryIsCPA ? '2 5' : AHEAD_DASH}
                                        opacity={AHEAD_OPACITY}
                                    />
                                </g>

                                {/* Secondary curve (CPA), in the lower plot — kept quiet so E2 stays the focus; dotted in mono so the curves stay distinguishable */}
                                {hasSecondary && (
                                    <g clipPath={`url(#clip-s-${clipId})`}>
                                        <path
                                            d={linePath('s', false)}
                                            fill="none"
                                            stroke={c.second}
                                            strokeWidth={1.5}
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                            strokeDasharray={isMono ? '2 5' : undefined}
                                        />
                                        <path
                                            d={linePath('s', true)}
                                            fill="none"
                                            stroke={c.second}
                                            strokeWidth={1.5}
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                            strokeDasharray={isMono ? '2 5' : AHEAD_DASH}
                                            opacity={AHEAD_OPACITY}
                                        />
                                    </g>
                                )}
                            </g>

                            {/* The band's name, over the curves rather than under
                                them with the wash: the curve crosses the band's top
                                edge right where it sits, and drew through it. The
                                halo in the page colour keeps it legible there; the
                                marks drawn after it still sit on top. */}
                            {band && (
                                <text
                                    className="chart-appear"
                                    style={{ animationDelay: '120ms' }}
                                    x={mL + 4 * ui}
                                    y={Math.min(mT + pH - 3 * ui, band.yHi + 14 * ui)}
                                    fontSize={axisFont}
                                    fill={c.axis}
                                    paintOrder="stroke"
                                    stroke={c.dot}
                                    strokeWidth={3 * ui}
                                    strokeLinejoin="round"
                                    pointerEvents="none"
                                >
                                    {t('chart.target')}
                                </text>
                            )}

                            {/* "Now" line + dot, one line per plot so it leaves
                                the lower plot's name in the gap alone */}
                            {now >= t0 &&
                                now <= t1 &&
                                (hasSecondary
                                    ? [
                                          [mT, mT + pH],
                                          [sTop, sTop + sH],
                                      ]
                                    : [[mT, mT + plotH]]
                                ).map(([y1, y2]) => (
                                    <line
                                        key={`now-${y1}`}
                                        className="chart-appear"
                                        style={{ animationDelay: sweepDelay(X(now)) }}
                                        x1={X(now)}
                                        y1={y1}
                                        x2={X(now)}
                                        y2={y2}
                                        stroke={c.axis}
                                        strokeWidth={1}
                                        strokeDasharray="2 4"
                                    />
                                ))}
                            {nowValS != null && now >= t0 && now <= t1 && (
                                <circle
                                    className="chart-mark"
                                    style={{ animationDelay: sweepDelay(X(now)) }}
                                    cx={X(now)}
                                    cy={YS(nowValS)}
                                    r={4}
                                    fill={c.second}
                                    stroke={c.dot}
                                    strokeWidth={2}
                                />
                            )}
                            {nowVal != null && now >= t0 && now <= t1 && (
                                <circle
                                    className="chart-mark"
                                    style={{ animationDelay: sweepDelay(X(now)) }}
                                    cx={X(now)}
                                    cy={YP(nowVal)}
                                    r={5}
                                    fill={c.primary}
                                    stroke={c.dot}
                                    strokeWidth={2.5}
                                />
                            )}

                            {/* Dose markers (clickable) */}
                            {markers.map((m, i) => {
                                const cx = X(m.t);
                                const cy = m.axis === 'p' ? YP(m.v) : YS(m.v);
                                const col = m.axis === 's' ? c.second : c.primary;
                                return (
                                    <g
                                        key={`m-${i}`}
                                        data-dose-marker=""
                                        className={`chart-mark${onPointClick ? ' cursor-pointer' : ''}`}
                                        style={{ animationDelay: sweepDelay(cx) }}
                                        onClick={() => onPointClick?.(m.event)}
                                    >
                                        <circle cx={cx} cy={cy} r={9} fill="transparent" />
                                        <circle cx={cx} cy={cy} r={3.5} fill={c.dot} stroke={col} strokeWidth={2} />
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
                                            x={cx - 4}
                                            y={cy - 4}
                                            width={8}
                                            height={8}
                                            transform={`rotate(45 ${cx} ${cy})`}
                                            fill={c.dot}
                                            stroke={c.lab}
                                            strokeWidth={2}
                                            strokeLinejoin="round"
                                        />
                                    </g>
                                );
                            })}

                            {/* Hover crosshair + dot */}
                            {showHover && (
                                <>
                                    <line
                                        x1={X(hoverPt!.t)}
                                        y1={mT}
                                        x2={X(hoverPt!.t)}
                                        y2={mT + plotH}
                                        stroke={c.faint}
                                        strokeWidth={1}
                                    />
                                    {hoverPt!.p != null && (
                                        <circle
                                            cx={X(hoverPt!.t)}
                                            cy={YP(hoverPt!.p)}
                                            r={5}
                                            fill={c.primary}
                                            stroke={c.dot}
                                            strokeWidth={2.5}
                                        />
                                    )}
                                    {hoverPt!.s != null && (
                                        <circle
                                            cx={X(hoverPt!.t)}
                                            cy={YS(hoverPt!.s)}
                                            r={3.5}
                                            fill={c.second}
                                            stroke={c.dot}
                                            strokeWidth={2}
                                        />
                                    )}
                                </>
                            )}
                        </g>
                    </svg>
                )}

                {/* Hover tooltip */}
                {showHover && (
                    <div
                        className="absolute z-20 pointer-events-none px-2.5 py-1.5 rounded-md bg-[var(--surface)] border-(length:--hairline) border-[var(--border)]"
                        style={{
                            left: Math.min(Math.max(X(hoverPt!.t), mL + 4), mL + plotW - 4),
                            top: Math.max(YP(hoverPt!.p ?? 0) - 12, 8),
                            transform: `translate(${X(hoverPt!.t) > mL + plotW * 0.6 ? '-100%' : '0'}, -100%)`,
                        }}
                    >
                        <div className="text-xs text-[var(--text-muted)] mb-0.5 whitespace-nowrap">
                            <span className="block">{formatDate(new Date(hoverPt!.t), lang, timeZone)}</span>
                            <span className="block">{formatTime(new Date(hoverPt!.t), timeZone)}</span>
                        </div>
                        {/* A curve too low to show reads "--", and has no unit. */}
                        <div className="flex items-baseline gap-1 whitespace-nowrap">
                            <span className="text-sm font-medium tabular-nums" style={{ color: c.primary }}>
                                {hoverPt!.p != null ? hoverPt!.p.toFixed(primaryMeta.decimals) : '--'}
                            </span>
                            {hoverPt!.p != null && (
                                <span className="text-xs text-[var(--text-muted)]">{primaryMeta.unit}</span>
                            )}
                        </div>
                        {hasSecondary && (
                            <div className="flex items-baseline gap-1 whitespace-nowrap">
                                <span className="text-xs font-medium tabular-nums" style={{ color: c.second }}>
                                    {hoverPt!.s != null ? hoverPt!.s.toFixed(2) : '--'}
                                </span>
                                {hoverPt!.s != null && <span className="text-xs text-[var(--text-muted)]">ng/mL</span>}
                            </div>
                        )}
                        {/* One line: the lab, and how it sits against the raw model. */}
                        {hoverLab && (
                            <div className="mt-1 pt-1 border-t-(length:--hairline) border-[var(--border)] flex items-center gap-1.5 text-xs whitespace-nowrap tabular-nums">
                                <svg width="10" height="10" viewBox="-5 -5 10 10" aria-label={t('cal.plot.lab')}>
                                    <path
                                        d="M0 -3.5L3.5 0L0 3.5L-3.5 0Z"
                                        fill={c.dot}
                                        stroke={c.lab}
                                        strokeWidth={1.5}
                                    />
                                </svg>
                                <span className="font-medium text-[var(--text)]">{hoverLab.raw}</span>
                                <span className="text-[var(--text-muted)]">
                                    {hoverLab.unit}
                                    {hoverLab.pct != null ? ',' : ''}
                                </span>
                                {hoverLab.pct != null && (
                                    <span className="text-[var(--text-muted)]">
                                        {hoverLab.pct === 0
                                            ? '±0%'
                                            : fill(t(hoverLab.pct > 0 ? 'lab.ratio_above' : 'lab.ratio_below'), {
                                                  pct: Math.abs(hoverLab.pct),
                                              })}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* What the dashed part assumes, and the calibration factor, under
                the dates. Each plot names its own line, so no legend sits
                between the title and the curves. */}
            {(showAhead || Math.abs(calFactor - 1) > 0.001) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-[var(--text-muted)]">
                    {showAhead && (
                        <span className="flex items-center gap-1.5">
                            <span
                                className="w-3.5 h-[2px]"
                                style={{
                                    background: `repeating-linear-gradient(90deg, ${c.axis} 0, ${c.axis} 5px, transparent 5px, transparent 9px)`,
                                }}
                            />
                            {t(`chart.ahead_${aheadBasis}`)}
                        </span>
                    )}
                    {Math.abs(calFactor - 1) > 0.001 && (
                        <span className="ms-auto tabular-nums">
                            {t('chart.cal_factor').replace('{n}', calFactor.toFixed(2))}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default ResultChart;
