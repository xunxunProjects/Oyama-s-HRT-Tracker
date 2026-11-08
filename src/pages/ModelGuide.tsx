import React, { useMemo, useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import Segmented from '../components/Segmented';
import AnimatedNumber from '../components/AnimatedNumber';
import ModelChart from '../components/ModelChart';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { esterName, fill } from '../utils/regimenText';
import {
    runSimulation,
    computeCalibration,
    geometricMeanRatio,
    interpolateConcentration_E2,
    interpolateConcentration_T,
    sublingualThetaFromHold,
    Route,
    Ester,
    ExtraKey,
    type DoseEvent,
    type LabResult,
    type SimulationResult,
} from '../../logic';

/**
 * What the curve on the Overview is and where it comes from, as a page of
 * About. It used to send people to an article on another site; this says the
 * same few things in the app, beside pictures they can move.
 *
 * Every curve here is computed by runSimulation (and the calibrated one by
 * computeCalibration), the same functions the Overview runs, so the pictures
 * can never drift away from what the app actually does.
 */

type RouteId = 'injection' | 'oral' | 'sublingual' | 'gel';

interface Example {
    id: RouteId;
    route: Route;
    ester: Ester;
    extras?: Partial<Record<ExtraKey, number>>;
    dose: { min: number; max: number; step: number; start: number };
    /** Spacing choices for the repeated-dose picture, in hours. */
    intervals: number[];
    /** How long one dose is followed for, in hours. */
    singleH: number;
    /** Long-acting routes read in days, the rest in hours. */
    days: boolean;
}

const D = 24;

const TRANSFEM: Example[] = [
    {
        id: 'injection',
        route: Route.injection,
        ester: Ester.EV,
        extras: { [ExtraKey.concentrationMGmL]: 20 },
        dose: { min: 1, max: 10, step: 0.5, start: 5 },
        intervals: [5 * D, 7 * D, 10 * D],
        singleH: 14 * D,
        days: true,
    },
    {
        id: 'oral',
        route: Route.oral,
        ester: Ester.E2,
        dose: { min: 0.5, max: 8, step: 0.5, start: 2 },
        intervals: [12, 24],
        singleH: 72,
        days: false,
    },
    {
        id: 'sublingual',
        route: Route.sublingual,
        ester: Ester.E2,
        extras: { [ExtraKey.sublingualTheta]: sublingualThetaFromHold(10) },
        dose: { min: 0.5, max: 4, step: 0.5, start: 1 },
        intervals: [8, 12, 24],
        singleH: 36,
        days: false,
    },
    {
        id: 'gel',
        route: Route.gel,
        ester: Ester.E2,
        extras: { [ExtraKey.gelSite]: 0 },
        dose: { min: 0.5, max: 4, step: 0.25, start: 1.5 },
        intervals: [12, 24],
        singleH: 96,
        days: false,
    },
];

const TRANSMASC: Example[] = [
    {
        id: 'injection',
        route: Route.injection,
        ester: Ester.TC,
        extras: { [ExtraKey.concentrationMGmL]: 200 },
        dose: { min: 25, max: 200, step: 25, start: 100 },
        intervals: [7 * D, 10 * D, 14 * D],
        singleH: 21 * D,
        days: true,
    },
    {
        id: 'oral',
        route: Route.oral,
        ester: Ester.TU,
        dose: { min: 40, max: 240, step: 40, start: 80 },
        intervals: [12, 24],
        singleH: 36,
        days: false,
    },
    {
        id: 'gel',
        route: Route.gel,
        ester: Ester.T,
        extras: { [ExtraKey.gelSite]: 0 },
        dose: { min: 25, max: 100, step: 12.5, start: 50 },
        intervals: [12, 24],
        singleH: 96,
        days: false,
    },
];

const SAMPLES = 240;

interface Run {
    sim: SimulationResult;
    events: DoseEvent[];
    /** Hour zero of the picture, on the engine's clock. */
    t0: number;
    spanH: number;
}

/**
 * Doses land so the last one is a little before now: runSimulation lays its
 * grid from the first dose to whichever is later, now or two weeks past the
 * last dose, so a regimen parked near hour zero would be sampled across every
 * hour since 1970.
 */
const simulate = (ex: Example, dose: number, count: number, everyH: number, spanH: number, weight: number) => {
    const t0 = Math.floor(Date.now() / 3_600_000) - spanH;
    const events: DoseEvent[] = Array.from({ length: count }, (_, i) => ({
        id: `model-guide-${i}`,
        route: ex.route,
        ester: ex.ester,
        timeH: t0 + i * everyH,
        doseMG: dose,
        extras: ex.extras ?? {},
    }));
    const sim = runSimulation(events, weight);
    return sim ? ({ sim, events, t0, spanH } as Run) : null;
};

const sample = (run: Run | null, isT: boolean): number[] => {
    if (!run) return [];
    const at = isT ? interpolateConcentration_T : interpolateConcentration_E2;
    return Array.from({ length: SAMPLES }, (_, i) => at(run.sim, run.t0 + (i / (SAMPLES - 1)) * run.spanH) ?? 0);
};

/** Two to four short facts in a row: the name small, the number at the size of a section title. */
const Readout: React.FC<{ items: { label: string; value: React.ReactNode }[] }> = ({ items }) => (
    <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
        {items.map(({ label, value }) => (
            <div key={label}>
                <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
                <dd className="mt-0.5 text-xl font-light tabular-nums text-[var(--text)]">{value}</dd>
            </div>
        ))}
    </dl>
);

/** A labelled slider, its value at the end of the label line. */
const Slider: React.FC<{
    id: string;
    label: string;
    shown: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (v: number) => void;
}> = ({ id, label, shown, min, max, step, value, onChange }) => (
    <div className="mt-5">
        <label className="field-label flex justify-between" htmlFor={id}>
            <span>{label}</span>
            <span className="tabular-nums text-[var(--text)]">{shown}</span>
        </label>
        <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            className="mt-3 h-1 w-full accent-[var(--accent)]"
        />
    </div>
);

const Section: React.FC<{ title: string; text?: string; children?: React.ReactNode }> = ({ title, text, children }) => (
    <section className="mt-12 first:mt-0">
        <h2 className="text-xl font-normal text-[var(--text)]">{title}</h2>
        {text && <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{text}</p>}
        {children}
    </section>
);

const round = (v: number) => (v >= 100 ? Math.round(v / 5) * 5 : Math.round(v));

const ModelGuide: React.FC<{ onBack: () => void; weight: number }> = ({ onBack, weight: savedWeight }) => {
    const { t } = useTranslation();
    const { mode } = useHRTMode();
    const isT = mode === 'transmasc';
    const examples = isT ? TRANSMASC : TRANSFEM;
    const unit = isT ? 'ng/dL' : 'pg/mL';

    const [routeId, setRouteId] = useState<RouteId>('injection');
    const ex = examples.find(e => e.id === routeId) ?? examples[0];
    const [doses, setDoses] = useState<Partial<Record<RouteId, number>>>({});
    const [spacing, setSpacing] = useState<Partial<Record<RouteId, number>>>({});
    const [weight, setWeight] = useState(() => Math.min(120, Math.max(40, Math.round(savedWeight || 60))));
    const [labRatio, setLabRatio] = useState(0.7);

    const dose = doses[ex.id] ?? ex.dose.start;
    const everyH = spacing[ex.id] ?? ex.intervals[ex.intervals.length > 2 ? 1 : ex.intervals.length - 1];
    const xUnit = ex.days ? t('model_doc.axis.days') : t('model_doc.axis.hours');
    const toX = (h: number) => (ex.days ? h / D : h);
    const span = (h: number) =>
        ex.days
            ? fill(t('model_doc.n_days'), { n: +(h / D).toFixed(1) })
            : fill(t('model_doc.n_hours'), { n: Math.round(h) });

    // One dose, followed until it has mostly gone.
    const single = useMemo(() => {
        const run = simulate(ex, dose, 1, 0, ex.singleH, weight);
        const values = sample(run, isT);
        let peakI = 0;
        values.forEach((v, i) => {
            if (v > values[peakI]) peakI = i;
        });
        return { values, peak: values[peakI] ?? 0, peakH: (peakI / (SAMPLES - 1)) * ex.singleH };
    }, [ex, dose, weight, isT]);

    // The same dose again and again: a week of daily doses, about eight weeks of injections.
    const repeated = useMemo(() => {
        const count = Math.max(4, Math.ceil((ex.days ? 56 * D : 7 * D) / everyH));
        const spanH = count * everyH;
        const run = simulate(ex, dose, count, everyH, spanH, weight);
        const values = sample(run, isT);
        // The last interval is the settled one.
        const tail = values.slice(Math.floor(((count - 1) / count) * (SAMPLES - 1)));
        const lo = Math.min(...tail),
            hi = Math.max(...tail);
        const mean = tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length);
        return { run, values, spanH, count, lo, hi, mean };
    }, [ex, dose, everyH, weight, isT]);

    // One lab just before the last dose, where people are usually asked to draw.
    const calibrated = useMemo(() => {
        const { run, count, spanH, values } = repeated;
        if (!run) return null;
        const labH = run.t0 + (count - 1) * everyH - 0.5;
        const at = isT ? interpolateConcentration_T : interpolateConcentration_E2;
        const pred = at(run.sim, labH) ?? 0;
        if (!(pred > 0)) return null;
        const obs = round(pred * labRatio);
        let scale: number;
        if (isT) {
            // computeCalibration skips testosterone labs, so the one-lab
            // arithmetic it would do is done with its own helper.
            scale = geometricMeanRatio([{ id: 'lab', timeH: labH, obs, pred, ratio: obs / pred }]);
        } else {
            const labs: LabResult[] = [{ id: 'model-guide-lab', timeH: labH, concValue: obs, unit: 'pg/ml' }];
            scale = computeCalibration(run.sim, run.events, weight, labs, 'mipd', 'retrospective').scale;
        }
        return {
            obs,
            scale,
            labX: toX(labH - run.t0),
            values: values.map(v => v * scale),
            // Fixed at the slider's top, so dragging moves the line and not the axis.
            yMax: Math.max(...values) * 1.85,
            spanH,
        };
        // toX depends only on ex, already a dependency through repeated.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [repeated, labRatio, isT, weight, everyH]);

    const drug = esterName(ex.ester, t);
    const vd = isT ? 1 : 2;

    return (
        <div className="md:pb-32">
            <PageHeader title={t('drawer.model_title')} onBack={onBack} />
            <div className={`${PAGE_COLUMN} mt-3`}>
                <p className="text-sm leading-relaxed text-[var(--text)]">{t('model_doc.lead')}</p>

                <div className="mt-8">
                    <Segmented<RouteId>
                        options={examples.map(e => ({ id: e.id, label: t(`model_doc.route.${e.id}`) }))}
                        value={ex.id}
                        onChange={setRouteId}
                        aria-label={t('model_doc.route')}
                    />
                </div>

                <div className="mt-10">
                    <Section title={t('model_doc.single.title')} text={t('model_doc.single.text')}>
                        <Slider
                            id="model-doc-dose"
                            label={t('model_doc.dose')}
                            shown={`${dose} mg ${drug}`}
                            {...ex.dose}
                            value={dose}
                            onChange={v => setDoses(d => ({ ...d, [ex.id]: v }))}
                        />
                        <div className="mt-6">
                            <ModelChart
                                series={[{ values: single.values }]}
                                xMax={toX(ex.singleH)}
                                xUnit={xUnit}
                                yUnit={unit}
                                doses={[0]}
                                // Fixed at the slider's top dose (the model is linear in dose), so a
                                // bigger dose reads as a taller curve rather than relabelled axes.
                                yMax={(single.peak * ex.dose.max) / dose}
                                aria-label={t('model_doc.single.title')}
                            />
                        </div>
                        <Readout
                            items={[
                                {
                                    label: t('model_doc.peak'),
                                    value: (
                                        <>
                                            <AnimatedNumber value={round(single.peak)} decimals={0} />
                                            <span className="ms-1 text-sm text-[var(--text-muted)]">{unit}</span>
                                        </>
                                    ),
                                },
                                { label: t('model_doc.peak_at'), value: span(single.peakH) },
                            ]}
                        />
                    </Section>

                    <Section title={t('model_doc.repeat.title')} text={t('model_doc.repeat.text')}>
                        <div className="mt-5">
                            <p className="field-label mb-2">{t('model_doc.every')}</p>
                            <Segmented<string>
                                options={ex.intervals.map(h => ({ id: String(h), label: span(h) }))}
                                value={String(everyH)}
                                onChange={v => setSpacing(s => ({ ...s, [ex.id]: Number(v) }))}
                                aria-label={t('model_doc.every')}
                            />
                        </div>
                        <div className="mt-6">
                            <ModelChart
                                series={[{ values: repeated.values }]}
                                xMax={toX(repeated.spanH)}
                                xUnit={xUnit}
                                yUnit={unit}
                                doses={Array.from({ length: repeated.count }, (_, i) => toX(i * everyH))}
                                aria-label={t('model_doc.repeat.title')}
                            />
                        </div>
                        <Readout
                            items={[
                                {
                                    label: t('model_doc.range'),
                                    value: (
                                        <>
                                            {fill(t('model_doc.range_value'), {
                                                lo: round(repeated.lo),
                                                hi: round(repeated.hi),
                                            })}
                                            <span className="ms-1 text-sm text-[var(--text-muted)]">{unit}</span>
                                        </>
                                    ),
                                },
                            ]}
                        />
                    </Section>

                    <Section title={t('model_doc.weight.title')} text={fill(t('model_doc.weight.text'), { vd })}>
                        <Slider
                            id="model-doc-weight"
                            label={t('status.weight')}
                            shown={`${weight} kg`}
                            min={40}
                            max={120}
                            step={1}
                            value={weight}
                            onChange={setWeight}
                        />
                        <Readout
                            items={[
                                {
                                    label: t('model_doc.mean'),
                                    value: (
                                        <>
                                            <AnimatedNumber value={round(repeated.mean)} decimals={0} />
                                            <span className="ms-1 text-sm text-[var(--text-muted)]">{unit}</span>
                                        </>
                                    ),
                                },
                            ]}
                        />
                    </Section>

                    <Section title={t('model_doc.calibrate.title')} text={t('model_doc.calibrate.text')}>
                        {calibrated && (
                            <>
                                <Slider
                                    id="model-doc-lab"
                                    label={t('model_doc.lab')}
                                    shown={`${calibrated.obs} ${unit}`}
                                    min={0.4}
                                    max={1.8}
                                    step={0.05}
                                    value={labRatio}
                                    onChange={setLabRatio}
                                />
                                <div className="mt-6">
                                    <ModelChart
                                        series={[
                                            { values: repeated.values, ghost: true },
                                            { values: calibrated.values },
                                        ]}
                                        xMax={toX(calibrated.spanH)}
                                        xUnit={xUnit}
                                        yUnit={unit}
                                        labs={[{ x: calibrated.labX, y: calibrated.obs }]}
                                        yMax={calibrated.yMax}
                                        aria-label={t('model_doc.calibrate.title')}
                                    />
                                </div>
                                <p className="mt-2 text-xs text-[var(--text-muted)]">
                                    {t('model_doc.calibrate.caption')}
                                </p>
                                <Readout
                                    items={[
                                        {
                                            label: t('model_doc.factor'),
                                            value: `× ${calibrated.scale.toFixed(2)}`,
                                        },
                                    ]}
                                />
                            </>
                        )}
                    </Section>

                    <Section title={t('model_doc.limits.title')}>
                        <ul className="mt-3 list-disc space-y-2 ps-5 text-sm leading-relaxed text-[var(--text-muted)] marker:text-[var(--border-strong)]">
                            <li>{t('model_doc.limits.1')}</li>
                            <li>{t('model_doc.limits.2')}</li>
                            <li>{t('model_doc.limits.3')}</li>
                        </ul>
                    </Section>
                </div>
            </div>
        </div>
    );
};

export default ModelGuide;
