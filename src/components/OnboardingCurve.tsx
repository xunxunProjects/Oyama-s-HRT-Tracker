import React, { useEffect, useState } from 'react';
import {
    runSimulation,
    computeCalibration,
    geometricMeanRatio,
    interpolateConcentration_E2,
    interpolateConcentration_T,
    Route,
    Ester,
    ExtraKey,
    type CalibrationPoint,
    type DoseEvent,
    type LabResult,
} from '../../logic';

/**
 * The chart on the "how it works" step of the intro.
 *
 * It draws the same argument the product film makes, in one plane: eight doses
 * land on a timeline, a curve accumulates through them, then two lab results
 * arrive *below* that curve and the whole line comes down to meet them. The
 * third beat is the one worth the code — showing the model being wrong is the
 * only honest way to say what calibration is for, and it is the one thing the
 * step's prose can assert but not demonstrate.
 *
 * Every number plotted comes from `runSimulation` and `computeCalibration`,
 * the functions the Overview itself runs. Nothing here is a drawn squiggle
 * with plausible-looking bumps: if the engine's answer changes, this picture
 * changes with it, and a curve that could drift away from the product without
 * anyone noticing would be worse than no curve at all.
 */

// ── the plane ────────────────────────────────────────────────────────────
// Fixed for both modes and every phase, so nothing under the reader's eye
// rescales once it has been established.
const X0 = 28, X1 = 306;      // plot box, left and right
const Y0 = 20, Y1 = 118;      // plot box, top and baseline
const DAYS = 56;              // domain, 0 .. DAYS
const SAMPLES = 225;          // points along the curve

/** 0.96 rather than 1 leaves the tallest peak a hair clear of the plot top. */
const HEAD_ROOM = 0.96;

const X = (day: number) => X0 + (day * (X1 - X0)) / DAYS;

// ── the demo regimen ─────────────────────────────────────────────────────
// Eight doses at one a week, and two labs placed in the second half where the
// curve has settled, so the gap between model and measurement reads as a
// standing offset rather than a bad guess about a single peak.
const DOSE_COUNT = 8;
const DOSE_INTERVAL_D = 7;
const WEIGHT_KG = 70;
const LAB_DAYS = [24.5, 45.5] as const;

/**
 * Two labs, not three. At three, `n` reaches MIN_LABS_FOR_CLEARANCE (logic.ts)
 * and MIPD starts fitting clearance as well as amplitude, which bends the
 * curve's *shape* at the very moment the reader is being asked to notice that
 * it came *down*. At two, kMul comes back exactly 1: the correction is pure
 * amplitude, so the only thing that changes is the one thing being claimed.
 */
const LAB_VALUES = {
    transfem: [192, 198],
    transmasc: [352, 364],
} as const;

export interface CurveData {
    unit: string;
    doseX: number[];
    modelD: string;
    calD: string;
    labs: { x: number; y: number }[];
}

const buildPath = (ys: number[], yMax: number): string => {
    const k = (Y1 - Y0) / yMax;
    return ys
        .map((v, i) => {
            const x = X0 + ((X1 - X0) * i) / (SAMPLES - 1);
            const y = Y1 - Math.max(0, v) * k;
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join('');
};

const compute = (isTransmasc: boolean): CurveData | null => {
    // Anchored so the last dose lands about now. `runSimulation` spreads its
    // grid from the first dose to max(lastDose + 14 d, now) under a step cap,
    // so events left near hour zero would get a grid stretched across every
    // hour since 1970 and the curve would come back faceted.
    const t0 = Date.now() / 3_600_000 - (DOSE_COUNT - 1) * DOSE_INTERVAL_D * 24;
    const at = (day: number) => t0 + day * 24;

    const events: DoseEvent[] = Array.from({ length: DOSE_COUNT }, (_, i) => ({
        id: `onboarding-dose-${i}`,
        route: Route.injection,
        ester: isTransmasc ? Ester.TC : Ester.EV,
        timeH: at(i * DOSE_INTERVAL_D),
        doseMG: isTransmasc ? 100 : 4,
        extras: { [ExtraKey.concentrationMGmL]: isTransmasc ? 200 : 20 },
    }));

    const sim = runSimulation(events, WEIGHT_KG);
    if (!sim) return null;

    const interpolate = isTransmasc ? interpolateConcentration_T : interpolateConcentration_E2;
    const values = Array.from({ length: SAMPLES }, (_, i) =>
        interpolate(sim, at((i * DAYS) / (SAMPLES - 1))) ?? 0,
    );

    const simMax = Math.max(...values);
    if (!(simMax > 0)) return null;
    const yMax = simMax / HEAD_ROOM;

    const labValues = LAB_VALUES[isTransmasc ? 'transmasc' : 'transfem'];
    const labs: LabResult[] = LAB_DAYS.map((day, i) => ({
        id: `onboarding-lab-${i}`,
        timeH: at(day),
        concValue: labValues[i],
        unit: isTransmasc ? 'ng/dl' : 'pg/ml',
    }));

    let scale: number;
    if (isTransmasc) {
        // `computeCalibrationPoints` drops every testosterone lab
        // (`.filter(r => !isT_LabUnit(r.unit))` in logic.ts), so `computeCalibration`
        // would hand back an identity fit and the beat would show nothing
        // happening. The points are therefore built here against the T series
        // and averaged with the engine's own `geometricMeanRatio`, which is the
        // arithmetic MIPD itself performs below the clearance threshold. No
        // second model enters the app; when the filter is fixed this branch goes.
        const points = labs
            .map((lab): CalibrationPoint | null => {
                const pred = interpolate(sim, lab.timeH);
                if (pred === null || !(pred > 0)) return null;
                return { id: lab.id, timeH: lab.timeH, obs: lab.concValue, pred, ratio: lab.concValue / pred };
            })
            .filter((p): p is CalibrationPoint => !!p);
        if (!points.length) return null;
        scale = geometricMeanRatio(points);
    } else {
        scale = computeCalibration(sim, events, WEIGHT_KG, labs, 'mipd', 'retrospective').scale;
    }

    const k = (Y1 - Y0) / yMax;
    return {
        unit: isTransmasc ? 'ng/dl' : 'pg/ml',
        doseX: Array.from({ length: DOSE_COUNT }, (_, i) => X(i * DOSE_INTERVAL_D)),
        modelD: buildPath(values, yMax),
        calD: buildPath(values.map(v => v * scale), yMax),
        labs: labs.map((lab, i) => ({
            x: X(LAB_DAYS[i]),
            y: Y1 - lab.concValue * k,
        })),
    };
};

/**
 * Runs the engine off the critical path. The MIPD fit costs about 20 ms, which
 * is a visible hitch if it lands on the frame that mounts a step, so this is
 * called from the top of Onboarding and has the whole of the language and mode
 * steps to finish in.
 */
export const useOnboardingCurve = (isTransmasc: boolean): CurveData | null => {
    const [data, setData] = useState<CurveData | null>(null);

    useEffect(() => {
        let live = true;
        const run = () => { if (live) setData(compute(isTransmasc)); };
        const idle = (window as unknown as {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        }).requestIdleCallback;
        if (idle) {
            const handle = idle(run, { timeout: 800 });
            return () => {
                live = false;
                (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle);
            };
        }
        const handle = window.setTimeout(run, 0);
        return () => { live = false; window.clearTimeout(handle); };
    }, [isTransmasc]);

    return data;
};

/** Matches the onboarding page's own background, so a marker reads as hollow. */
const HOLLOW = 'fill-[var(--color-m3-surface-dim)] dark:fill-[var(--color-m3-dark-surface)]';
const RULE = 'stroke-[var(--color-m3-outline-variant)] dark:stroke-[var(--color-m3-dark-outline-variant)]';

const TICKS: { day: number; anchor: 'start' | 'middle' | 'end' }[] = [
    { day: 0, anchor: 'start' },
    { day: 14, anchor: 'middle' },
    { day: 28, anchor: 'middle' },
    { day: 42, anchor: 'middle' },
    { day: 56, anchor: 'end' },
];

interface OnboardingCurveProps {
    data: CurveData | null;
    /** What the axes are, and that this is not the reader's own data. */
    caption: string;
    /** Both legend labels, already translated. */
    legend: { model: string; labs: string };
}

const OnboardingCurve: React.FC<OnboardingCurveProps> = ({ data, caption, legend }) => (
    <>
        <svg
            viewBox="0 0 320 146"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            focusable="false"
            className="block h-auto w-full text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]"
        >
            {/* The spine of every later frame, so it is there from the first
                paint with no animation of its own. */}
            <line x1={X0} y1={Y1} x2={X1} y2={Y1} strokeWidth={1} className={RULE} />

            {data && (
                <>
                    <g className="oc-frame">
                        <line x1={X0} y1={Y0} x2={X0} y2={Y1} strokeWidth={1} className={RULE} />
                        {[0.25, 0.5, 0.75].map(f => (
                            <line
                                key={f}
                                x1={X0}
                                y1={Y1 - (Y1 - Y0) * f}
                                x2={X1}
                                y2={Y1 - (Y1 - Y0) * f}
                                strokeWidth={1}
                                opacity={0.55}
                                className={RULE}
                            />
                        ))}
                        <g className="text-muted">
                            {/* The only numerals on screen are days. A level on
                                the y axis would be a number to aim at, and this
                                is somebody else's body. */}
                            {TICKS.map(({ day, anchor }) => (
                                <text key={day} x={X(day)} y={131} fontSize={8.5} textAnchor={anchor} fill="currentColor">
                                    {day}
                                </text>
                            ))}
                            <text x={X0} y={12} fontSize={8.5} textAnchor="start" fill="currentColor">
                                {data.unit}
                            </text>
                        </g>
                    </g>

                    {/* Doses, on the zero rule rather than on the curve: this
                        beat is only about when they were taken. */}
                    {data.doseX.map((cx, i) => (
                        <circle
                            key={cx}
                            className={`oc-pop ${HOLLOW}`}
                            style={{ animationDelay: `${i * 190}ms` }}
                            cx={cx}
                            cy={Y1}
                            r={3}
                            strokeWidth={1.5}
                            stroke="currentColor"
                        />
                    ))}

                    {/* pathLength normalises the line to 1 unit long, which is
                        what lets the CSS draw it on with a dasharray it can
                        write without knowing the geometry. */}
                    <path className="oc-model" d={data.modelD} pathLength={1} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
                    <path className="oc-ghost" d={data.modelD} fill="none" stroke="currentColor" strokeWidth={1.75} strokeDasharray="3 4" strokeLinejoin="round" strokeLinecap="round" />
                    <path className="oc-cal" d={data.calD} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

                    {data.labs.map(({ x, y }, i) => (
                        <rect
                            key={x}
                            /* ResultChart's lab marker: an 8×8 square on its
                               corner, in that chart's own lab colour. The first
                               real result someone enters should look like the
                               thing they were shown here. */
                            className={`oc-pop ${HOLLOW} text-[#B5664C] dark:text-[#E0A38C]`}
                            style={{ animationDelay: `${5100 + i * 180}ms` }}
                            x={x - 4}
                            y={y - 4}
                            width={8}
                            height={8}
                            transform={`rotate(45 ${x} ${y})`}
                            strokeWidth={1.75}
                            stroke="currentColor"
                        />
                    ))}
                </>
            )}
        </svg>

        {/* The caption comes before the legend: it says what the plane is, and
            the legend then names the two lines on it. It is also the sentence
            that has to be read whether or not the sequence ever plays, so it
            sits directly under the chart rather than below a legend that only
            arrives at seven seconds. */}
        <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">{caption}</p>

        {data && (
            <div className="oc-legend mt-1.5 flex items-center gap-4 text-[0.6875rem] text-muted">
                {/* One series in two states, so both swatches are the same
                    colour and only the dashes tell them apart. */}
                <span className="flex items-center gap-1.5">
                    <Swatch dashed />
                    {legend.model}
                </span>
                <span className="flex items-center gap-1.5">
                    <Swatch />
                    {legend.labs}
                </span>
            </div>
        )}
    </>
);

const Swatch: React.FC<{ dashed?: boolean }> = ({ dashed }) => (
    <svg
        viewBox="0 0 14 4"
        width={14}
        height={4}
        aria-hidden="true"
        className="shrink-0 text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]"
    >
        <line
            x1={0}
            y1={2}
            x2={14}
            y2={2}
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeDasharray={dashed ? '3 4' : undefined}
            opacity={dashed ? 0.28 : undefined}
        />
    </svg>
);

export default OnboardingCurve;
