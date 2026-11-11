import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useElementSize } from '../hooks/useElementSize';

export interface ModelSeries {
    /** Values sampled evenly from x = 0 to x = xMax. */
    values: number[];
    /** The uncalibrated model, drawn faint and dashed under the real line. */
    ghost?: boolean;
    /**
     * An edge of a likely range: not stroked. With `fillTo` (another series'
     * index), the space between the two is washed faintly in the line colour.
     */
    edge?: boolean;
    fillTo?: number;
}

interface ModelChartProps {
    series: ModelSeries[];
    /** Right end of the x axis, in the axis's own unit (hours or days). */
    xMax: number;
    /** Name of the x unit, already translated, shown past the arrow. */
    xUnit: string;
    /** Concentration unit, shown above the y arrow. */
    yUnit: string;
    /** When each dose was taken, in x units: hollow rings on the baseline. */
    doses?: number[];
    /** Lab results, drawn as the main chart draws them: a diamond. */
    labs?: { x: number; y: number }[];
    /** Fixed top of the y axis, so a chart that only changes in one way does not rescale under the reader. */
    yMax?: number;
    'aria-label'?: string;
}

/** A step of 1, 2 or 5 times a power of ten giving about `count` ticks up to `max`. */
const niceStep = (max: number, count: number) => {
    const raw = max / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
};

const fmtTick = (v: number) => (Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1));

interface Frame {
    values: number[][];
    yTop: number;
    xMax: number;
    labs: { x: number; y: number }[];
}

const TWEEN_MS = 420;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Glides what is drawn from the last picture to the new one when a control
 * moves: the line, the scale of both axes and the lab mark all ease over the
 * same short span, so a change reads as the curve itself moving rather than a
 * new chart replacing the old. A change of shape (another number of lines or
 * samples) has nothing to glide between and snaps, as does everything for
 * anyone who has asked for reduced motion.
 */
const useGlide = (target: Frame): Frame => {
    const [shown, setShown] = useState(target);
    const shownRef = useRef(target);
    const key = JSON.stringify(target);

    useEffect(() => {
        const from = shownRef.current;
        const set = (f: Frame) => {
            shownRef.current = f;
            setShown(f);
        };
        const sameShape =
            from.values.length === target.values.length &&
            from.values.every((v, i) => v.length === target.values[i].length) &&
            from.labs.length === target.labs.length;
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!sameShape || reduce) {
            set(target);
            return;
        }
        let raf = 0;
        const start = performance.now();
        const step = (now: number) => {
            const k = easeOut(Math.min(1, (now - start) / TWEEN_MS));
            set({
                values: target.values.map((vs, i) => vs.map((v, j) => mix(from.values[i][j], v, k))),
                yTop: mix(from.yTop, target.yTop, k),
                xMax: mix(from.xMax, target.xMax, k),
                labs: target.labs.map((l, i) => ({ x: mix(from.labs[i].x, l.x, k), y: mix(from.labs[i].y, l.y, k) })),
            });
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
        // The serialised frame is the dependency: a parent re-render that hands
        // over equal numbers in new arrays should not restart the glide.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return shown;
};

/**
 * The plain plane every picture on the model page sits in: two axes with
 * arrows, numbered ticks and a light grid, then the model's own output on it.
 * It draws whatever numbers it is handed; the page gets them from
 * runSimulation, the function the Overview runs.
 *
 * Laid out in measured pixels like the main chart, with every length scaled
 * by the root font size so it grows with the app's --ui-scale.
 */
const ModelChart: React.FC<ModelChartProps> = ({
    series,
    xMax,
    xUnit,
    yUnit,
    doses = [],
    labs = [],
    yMax,
    ...aria
}) => {
    const [box, setBox] = useState<HTMLDivElement | null>(null);
    const { width } = useElementSize(box);

    const ui = useMemo(() => {
        if (typeof window === 'undefined') return 1;
        const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return Number.isFinite(px) && px > 0 ? px / 16 : 1;
        // Re-read when the box resizes: --ui-scale changes the root size at breakpoints.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [width]);

    const fs = 13 * ui;
    const mL = 40 * ui,
        mR = 34 * ui,
        mT = 26 * ui,
        mB = 30 * ui;
    const height = Math.round(Math.min(Math.max(width * 0.56, 190 * ui), 300 * ui));
    const pw = Math.max(0, width - mL - mR);
    const ph = Math.max(0, height - mT - mB);

    const peak = Math.max(1e-9, ...series.flatMap(s => s.values), ...labs.map(l => l.y));
    // Tick spacing comes from where the picture is going, so the numbers settle
    // once; the scale they sit on glides there.
    const yStep = niceStep(yMax ?? peak, Math.max(2, Math.min(5, Math.floor(ph / (34 * ui)))));
    const targetTop = Math.ceil((yMax ?? peak * 1.04) / yStep) * yStep;
    const xStep = niceStep(xMax, Math.max(2, Math.min(7, Math.floor(pw / (52 * ui)))));

    const shown = useGlide({ values: series.map(s => s.values), yTop: targetTop, xMax, labs });
    const yTop = shown.yTop;
    const xSpan = shown.xMax;

    const X = (x: number) => mL + (x / xSpan) * pw;
    const Y = (y: number) => mT + ph - (Math.max(0, y) / yTop) * ph;

    const yTicks: number[] = [];
    for (let v = 0; v <= yTop + 1e-9; v += yStep) yTicks.push(v);
    const xTicks: number[] = [];
    for (let v = 0; v <= xSpan + 1e-9; v += xStep) xTicks.push(v);

    const path = (values: number[]) =>
        values
            .map((v, i) => {
                const x = X((i / Math.max(1, values.length - 1)) * xSpan);
                return `${i ? 'L' : 'M'}${x.toFixed(1)} ${Y(Math.min(v, yTop)).toFixed(1)}`;
            })
            .join('');

    const head = 5 * ui; // arrowhead length
    const x0 = mL,
        y0 = mT + ph;
    const xEnd = mL + pw + 14 * ui,
        yEnd = mT - 14 * ui;

    return (
        <div ref={setBox} className="w-full">
            {width > 0 && (
                <svg
                    width={width}
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    role="img"
                    aria-label={aria['aria-label']}
                    className="block"
                >
                    {/* Grid first, so the axes and the line sit on top of it. */}
                    <g stroke="var(--chart-grid)" strokeWidth={1}>
                        {yTicks.slice(1).map(v => (
                            <line key={`gy${v}`} x1={x0} x2={mL + pw} y1={Y(v)} y2={Y(v)} />
                        ))}
                        {xTicks.slice(1).map(v => (
                            <line key={`gx${v}`} x1={X(v)} x2={X(v)} y1={mT} y2={y0} />
                        ))}
                    </g>

                    <g stroke="var(--chart-axis)" strokeWidth={1} fill="none" strokeLinecap="round">
                        <line x1={x0} y1={y0} x2={xEnd} y2={y0} />
                        <line x1={x0} y1={y0} x2={x0} y2={yEnd} />
                        <path
                            d={`M${xEnd - head} ${y0 - head * 0.6}L${xEnd} ${y0}L${xEnd - head} ${y0 + head * 0.6}`}
                        />
                        <path
                            d={`M${x0 - head * 0.6} ${yEnd + head}L${x0} ${yEnd}L${x0 + head * 0.6} ${yEnd + head}`}
                        />
                        {yTicks.map(v => (
                            <line key={`ty${v}`} x1={x0 - 4 * ui} x2={x0} y1={Y(v)} y2={Y(v)} />
                        ))}
                        {xTicks.map(v => (
                            <line key={`tx${v}`} x1={X(v)} x2={X(v)} y1={y0} y2={y0 + 4 * ui} />
                        ))}
                    </g>

                    <g fill="var(--text-muted)" fontSize={fs} className="tabular-nums">
                        {yTicks.map(v => (
                            <text key={`ly${v}`} x={x0 - 7 * ui} y={Y(v)} dy="0.35em" textAnchor="end">
                                {fmtTick(v)}
                            </text>
                        ))}
                        {xTicks.map(v => (
                            <text key={`lx${v}`} x={X(v)} y={y0 + 19 * ui} textAnchor="middle">
                                {fmtTick(v)}
                            </text>
                        ))}
                        <text x={x0 + 8 * ui} y={yEnd + 4 * ui} dy="0.35em">
                            {yUnit}
                        </text>
                        <text x={xEnd} y={y0 - 8 * ui} textAnchor="end">
                            {xUnit}
                        </text>
                    </g>

                    {series.map((s, i) => {
                        if (s.fillTo === undefined) return null;
                        const top = shown.values[i] ?? s.values;
                        const bottom = shown.values[s.fillTo] ?? series[s.fillTo]?.values ?? [];
                        if (!bottom.length) return null;
                        // The lower edge, walked back from right to left to close the shape.
                        const pts = [...bottom]
                            .map((v, j) => {
                                const x = X((j / Math.max(1, bottom.length - 1)) * xSpan);
                                return `${x.toFixed(1)} ${Y(Math.min(v, yTop)).toFixed(1)}`;
                            })
                            .reverse();
                        return (
                            <path
                                key={`band${i}`}
                                d={`${path(top)}L${pts.join('L')}Z`}
                                fill="var(--chart-line)"
                                fillOpacity={0.12}
                                stroke="none"
                            />
                        );
                    })}

                    {series.map((s, i) =>
                        s.edge ? null : (
                            <path
                                key={i}
                                d={path(shown.values[i] ?? s.values)}
                                fill="none"
                                stroke="var(--chart-line)"
                                strokeWidth={s.ghost ? 1.25 * ui : 1.75 * ui}
                                strokeDasharray={s.ghost ? `${3 * ui} ${4 * ui}` : undefined}
                                opacity={s.ghost ? 0.5 : 1}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        ),
                    )}

                    {doses
                        .filter(d => d <= xSpan + 1e-9)
                        .map(d => (
                            <circle
                                key={`d${d}`}
                                cx={X(d)}
                                cy={y0}
                                r={3 * ui}
                                fill="var(--bg)"
                                stroke="var(--chart-line)"
                                strokeWidth={1.5 * ui}
                            />
                        ))}

                    {shown.labs.map((l, i) => {
                        const cx = X(l.x),
                            cy = Y(l.y),
                            r = 4.5 * ui;
                        return (
                            <path
                                key={`l${i}`}
                                d={`M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`}
                                fill="var(--bg)"
                                stroke="var(--chart-lab)"
                                strokeWidth={1.75 * ui}
                                strokeLinejoin="round"
                            />
                        );
                    })}
                </svg>
            )}
        </div>
    );
};

export default ModelChart;
