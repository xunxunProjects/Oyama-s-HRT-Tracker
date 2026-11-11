import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import ModelChart, { type ModelSeries } from '../components/ModelChart';
import CustomSelect from '../components/CustomSelect';
import Switch from '../components/Switch';
import CalibrationDoodle from '../components/CalibrationDoodle';
import { useTranslation } from '../contexts/LanguageContext';
import {
    runSimulation,
    computeCalibration,
    interpolateConcentration_E2,
    Route,
    Ester,
    ExtraKey,
    type CalibrationMethod,
    type DoseEvent,
    type LabResult,
} from '../../logic';

/**
 * How each calibration method works, one level below the calibration
 * settings: a picture you can move at the top, then each method with a small
 * drawing and its formula. The picture is computed by computeCalibration on a
 * runSimulation curve, the same functions the Lab page runs, so what it shows
 * is what the method really does with labs like these.
 */

const METHODS: CalibrationMethod[] = ['off', 'mipd', 'ekf', 'ou_kalman', 'bayes', 'mcmc'];
const CLEARANCE: CalibrationMethod[] = ['mipd', 'ekf', 'bayes', 'mcmc'];

const D = 24;
const WEEK = 7 * D;
const DOSES = 12;
const SPAN_H = DOSES * WEEK + 3 * D;
const SAMPLES = 280;
/** Labs in the second half of the picture: which dose they follow, and how many hours after it. */
const LAB_SLOTS: [number, number][] = [
    [5, 100],
    [6, 160],
    [7, 40],
    [8, 150],
    [9, 70],
    [10, 165],
];
const Z90 = 1.6448536269514722;

/** Each formula as short lines, so none runs past a phone's width. */
const FORMULAS: Record<CalibrationMethod, string[]> = {
    off: [String.raw`\hat C(t) = C(t)`],
    mipd: [
        String.raw`\hat C(t) = e^{\hat a}\, C(t; \hat k)`,
        String.raw`(\hat a, \hat k) = \arg\max_{a,k}\ p(a, k \mid y)`,
    ],
    ekf: [
        String.raw`\theta_i = \theta_{i-1} + K_i\big(\log y_i - h_i(\theta_{i-1})\big)`,
        String.raw`K_i = \frac{P_i H_i^{\top}}{H_i P_i H_i^{\top} + \sigma_i^2}`,
    ],
    ou_kalman: [
        String.raw`\mathrm{d}r = -\frac{r}{\tau}\,\mathrm{d}t + s\sqrt{\tfrac{2}{\tau}}\,\mathrm{d}W`,
        String.raw`\tau = 14\ \text{d}`,
    ],
    bayes: [
        String.raw`p(\hat C \mid y) = \sum_h p(h \mid y)\, p(\hat C \mid y, h)`,
        String.raw`p(h \mid y) \propto p(y \mid h)\, p(h)`,
    ],
    mcmc: [
        String.raw`\hat C(t) = \sum_r e^{\,s + u_r}\, C_r(t; k, a)`,
        String.raw`\alpha = \min\left\{1,\ \frac{p(\theta' \mid y)}{p(\theta \mid y)}\right\}`,
    ],
};
const NOISE = [
    String.raw`\sigma_i^2 = 0.13^2 + \left(\frac{f}{y_i}\right)^2 + \left(1\,\text{h} \cdot \partial_t \log C\right)^2`,
];

const Formula: React.FC<{ lines: string[] }> = ({ lines }) => {
    const latex = String.raw`\begin{gathered}` + lines.join(String.raw`\\[6pt]`) + String.raw`\end{gathered}`;
    const html = useMemo(
        () => katex.renderToString(latex, { displayMode: true, throwOnError: false, strict: 'ignore' }),
        [latex],
    );
    return (
        <div className="math-body mt-4 overflow-x-auto text-[var(--text)]" dangerouslySetInnerHTML={{ __html: html }} />
    );
};

/** A labelled slider, its value at the end of the label line (as on the model page). */
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

const times = (n: number) => `×${n.toFixed(2)}`;

const CalibrationGuide: React.FC<{ onBack: () => void; weight: number }> = ({ onBack, weight }) => {
    const { t } = useTranslation();
    const top = useRef<HTMLDivElement>(null);

    const [method, setMethod] = useState<CalibrationMethod>('mcmc');
    const [level, setLevel] = useState(1.4);
    const [change, setChange] = useState(1);
    const [count, setCount] = useState(4);
    const [wrong, setWrong] = useState(false);
    // Sampling methods take a moment; the sliders stay smooth and the picture follows.
    const inputs = useDeferredValue({ method, level, change, count, wrong });

    // Weekly 5 mg estradiol valerate for twelve weeks, ending a few days before now.
    const base = useMemo(() => {
        const t0 = Math.floor(Date.now() / 3_600_000) - SPAN_H;
        const events: DoseEvent[] = Array.from({ length: DOSES }, (_, i) => ({
            id: `cal-guide-${i}`,
            route: Route.injection,
            ester: Ester.EV,
            timeH: t0 + i * WEEK,
            doseMG: 5,
            extras: { [ExtraKey.concentrationMGmL]: 20 },
        }));
        const w = Math.min(120, Math.max(40, Math.round(weight || 60)));
        const sim = runSimulation(events, w);
        return { t0, events, sim, w };
    }, [weight]);

    const picture = useMemo(() => {
        const { t0, events, sim, w } = base;
        if (!sim) return null;
        const at = (h: number) => interpolateConcentration_E2(sim, h) ?? 0;
        const n = inputs.count;
        const wrongAt = Math.min(n - 1, 2);
        const labs: LabResult[] = LAB_SLOTS.slice(0, n).map(([dose, after], i) => {
            const h = t0 + dose * WEEK + after;
            const ratio =
                (i >= 3 ? inputs.level * inputs.change : inputs.level) * (inputs.wrong && i === wrongAt ? 3 : 1);
            return { id: `cal-guide-lab-${i}`, timeH: h, concValue: Math.round(at(h) * ratio), unit: 'pg/ml' };
        });
        const cal = computeCalibration(sim, events, w, labs, inputs.method, 'retrospective');
        const hours = Array.from({ length: SAMPLES }, (_, i) => t0 + (i / (SAMPLES - 1)) * SPAN_H);
        const raw = hours.map(at);
        const fitted = hours.map((h, i) => raw[i] * cal.factorFn(h));
        const sd = cal.factorSdFn;
        const series: ModelSeries[] = [{ values: raw, ghost: true }];
        if (sd && inputs.method !== 'off') {
            const hi = hours.map((h, i) => fitted[i] * Math.exp(Z90 * sd(h)));
            const lo = hours.map((h, i) => fitted[i] * Math.exp(-Z90 * sd(h)));
            series.push({ values: hi, edge: true, fillTo: 2 }, { values: lo, edge: true });
        } else {
            // Keep the same number of lines, so switching method glides instead of snapping.
            series.push({ values: fitted, edge: true }, { values: fitted, edge: true });
        }
        series.push({ values: fitted });
        const lastLab = labs[labs.length - 1];
        return {
            series,
            labs: labs.map(l => ({ x: (l.timeH - t0) / D, y: l.concValue })),
            doses: events.map(e => (e.timeH - t0) / D),
            atLab: cal.factorFn(lastLab.timeH),
            halfLife: cal.halfLifeDeltaPct,
            fit: cal.fitErrPct,
        };
    }, [base, inputs]);

    const signedPct = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(0)}%`;
    const tryThis = (m: CalibrationMethod) => {
        setMethod(m);
        top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="md:pb-32">
            <PageHeader title={t('cal_guide.title')} onBack={onBack} />
            <div className={`${PAGE_COLUMN} mt-3`}>
                <p className="text-sm leading-relaxed text-[var(--text)]">{t('cal_guide.lead')}</p>

                <section ref={top} className="mt-10 scroll-mt-24">
                    <h2 className="text-xl font-normal text-[var(--text)]">{t('cal_guide.try.title')}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{t('cal_guide.try.text')}</p>

                    <div className="mt-5">
                        <CustomSelect
                            label={t('cal_guide.method')}
                            value={method}
                            onChange={v => setMethod(v as CalibrationMethod)}
                            options={METHODS.map(m => ({ value: m, label: t(`cal.${m}`) }))}
                        />
                    </div>

                    {picture && (
                        <div className="mt-6">
                            <ModelChart
                                series={picture.series}
                                xMax={SPAN_H / D}
                                xUnit={t('model_doc.axis.days')}
                                yUnit="pg/mL"
                                doses={picture.doses}
                                labs={picture.labs}
                                aria-label={t('cal_guide.try.title')}
                            />
                            <p className="mt-2 text-xs text-[var(--text-muted)]">{t('cal_guide.caption')}</p>
                        </div>
                    )}

                    <Slider
                        id="cal-guide-level"
                        label={t('cal_guide.level')}
                        shown={times(level)}
                        min={0.4}
                        max={2.5}
                        step={0.05}
                        value={level}
                        onChange={setLevel}
                    />
                    <Slider
                        id="cal-guide-change"
                        label={t('cal_guide.change')}
                        shown={times(change)}
                        min={0.5}
                        max={2}
                        step={0.05}
                        value={change}
                        onChange={setChange}
                    />
                    <Slider
                        id="cal-guide-count"
                        label={t('cal_guide.count')}
                        shown={String(count)}
                        min={1}
                        max={LAB_SLOTS.length}
                        step={1}
                        value={count}
                        onChange={setCount}
                    />
                    <div className="mt-5 flex items-center justify-between gap-4">
                        <label className="field-label" htmlFor="cal-guide-wrong">
                            {t('cal_guide.wrong')}
                        </label>
                        <Switch id="cal-guide-wrong" checked={wrong} onChange={setWrong} />
                    </div>

                    {picture && (
                        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
                            <div>
                                <dt className="text-xs text-[var(--text-muted)]">{t('cal.interval')}</dt>
                                <dd className="mt-0.5 text-xl font-light tabular-nums text-[var(--text)]">
                                    {times(picture.atLab)}
                                </dd>
                            </div>
                            {CLEARANCE.includes(inputs.method) && (
                                <div>
                                    <dt className="text-xs text-[var(--text-muted)]">{t('cal.halflife')}</dt>
                                    <dd className="mt-0.5 text-xl font-light tabular-nums text-[var(--text)]">
                                        {signedPct(picture.halfLife)}
                                    </dd>
                                </div>
                            )}
                            {picture.fit !== null && inputs.method !== 'off' && (
                                <div>
                                    <dt className="text-xs text-[var(--text-muted)]">{t('cal.fit')}</dt>
                                    <dd className="mt-0.5 text-xl font-light tabular-nums text-[var(--text)]">
                                        ±{picture.fit.toFixed(0)}%
                                    </dd>
                                </div>
                            )}
                        </dl>
                    )}
                </section>

                {METHODS.map(m => (
                    <section key={m} className="mt-12">
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="text-xl font-normal text-[var(--text)]">{t(`cal.${m}`)}</h2>
                            <CalibrationDoodle method={m} />
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{t(`cal_guide.${m}`)}</p>
                        <Formula lines={FORMULAS[m]} />
                        {m !== method && (
                            <button
                                type="button"
                                onClick={() => tryThis(m)}
                                className="mt-3 text-sm text-[var(--accent-ink)] outline-none focus-visible:underline"
                            >
                                {t('cal_guide.try_this')}
                            </button>
                        )}
                    </section>
                ))}

                <section className="mt-12">
                    <h2 className="text-xl font-normal text-[var(--text)]">{t('cal_guide.noise.title')}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{t('cal_guide.noise.text')}</p>
                    <Formula lines={NOISE} />
                </section>
            </div>
        </div>
    );
};

export default CalibrationGuide;
