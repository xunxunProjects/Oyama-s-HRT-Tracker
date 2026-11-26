import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
    Ester,
    ExtraKey,
    Route,
    isEstradiolEster,
    isTestosteroneEster,
    runSimulation,
    type DoseEvent,
    type SimulationResult,
} from '../../logic';
import PageHeader, { PAGE_COLUMN, headerActionAccent } from '../components/PageHeader';
import { Molecule, Formula, useStructure } from '../components/Molecule';
import LevelRail from '../components/LevelRail';
import Segmented from '../components/Segmented';
import Tick from '../components/Tick';
import { DoseCurve, type CurvePoint } from '../components/DoseCurve';
import { ChevronRight, Plus } from '../components/icons';
import type { DoodleName } from '../components/Doodle';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { medName, medsFor, noteRecent, productsOf } from '../data/meds';
import {
    DOSE_GUIDE_CONFIG,
    LEVEL_BADGE_STYLES,
    formatGuideNumber,
    levelOf,
    type DoseLevelKey,
} from '../data/doseGuide';
import { draftToItem, freshDraft, type PlanItem } from '../utils/plan';
import { fill, frequencyLabel } from '../utils/regimenText';

/*
 * One medicine, laid out as Oyama Journal lays out a substance:
 *
 * - what it is: its structure, a line on what it is, what it's sold as, its
 *   formula and molar mass (PubChem's), and where it stands in your plan and
 *   your journal;
 * - how much: the amount in large numerals with the route chosen beside the
 *   title, read off the dose rail where there is a guide for it (estradiol by
 *   mouth, under the tongue, as a gel or a patch), and that rail's levels
 *   as rows, the one the amount is in ticked;
 * - how long: one dose's level over the days after it, as the model draws
 *   it, with when it's highest, half gone and mostly gone.
 *
 * The amounts are the ones a new plan starts at, or yours when it's in your
 * plan. Nothing here is advice: the page says so, and links the model's
 * own explanation.
 */

const muted = 'text-[var(--text-muted)]';
/** An amount as it is taken: 2, 1.5, 1.25 (never 1.25 rounded to 1.3). */
const fmtAmount = (v: number) => String(Math.round(v * 100) / 100);
const LEVELS: DoseLevelKey[] = ['low', 'medium', 'high', 'very_high'];

/** The series the model draws for a medicine, and its unit. */
function seriesOf(
    ester: Ester,
): { pick: (s: SimulationResult) => number[] | undefined; unit: string; decimals: number } | null {
    if (isEstradiolEster(ester)) return { pick: s => s.concPGmL_E2, unit: 'pg/mL', decimals: 0 };
    if (isTestosteroneEster(ester)) return { pick: s => s.concNGdL_T, unit: 'ng/dL', decimals: 0 };
    if (ester === Ester.CPA) return { pick: s => s.concPGmL_CPA, unit: 'ng/mL', decimals: 1 };
    if (ester === Ester.BICA) return { pick: s => s.concPGmL_BICA, unit: 'ng/mL', decimals: 0 };
    return null;
}

/** One dose of it, `amount` big, at `startH`, as the dose form would log it. */
function doseEvent(route: Route, ester: Ester, amount: number, startH: number): DoseEvent | null {
    const item = draftToItem({ ...freshDraft(route, ester), dose: String(amount) }, 'preview');
    if (!item) return null;
    return { id: 'preview', route, ester, doseMG: item.doseMG, timeH: startH, extras: item.extras };
}

/** The level after one dose, sampled for drawing, out to where it has mostly gone. */
function curveOf(ev: DoseEvent, weight: number, birthYear: number | null): CurvePoint[] {
    const series = seriesOf(ev.ester);
    if (!series) return [];
    const options = ev.ester === Ester.BICA ? { bicalutamide: true } : {};
    // The model runs to two weeks after the last dose; a long-acting one is
    // given more room by a dose of nothing further along.
    for (const days of [14, 35, 70, 120]) {
        const pad: DoseEvent = { ...ev, id: 'preview-end', doseMG: 0, timeH: ev.timeH + (days - 14) * 24, extras: {} };
        const sim = runSimulation(days > 14 ? [ev, pad] : [ev], weight, birthYear, options);
        const values = sim ? series.pick(sim) : undefined;
        if (!sim || !values?.length) return [];
        const pts: CurvePoint[] = [];
        for (let i = 0; i < sim.timeH.length; i++) {
            const h = sim.timeH[i] - ev.timeH;
            if (h < 0) continue;
            pts.push({ h, v: values[i] ?? 0 });
        }
        const peak = Math.max(...pts.map(p => p.v));
        const last = pts[pts.length - 1]?.v ?? 0;
        if (peak <= 0) return [];
        // Mostly gone inside the window: cut it a little after that.
        if (last <= peak * 0.08 || days === 120) {
            const goneAt = pts.findIndex(
                (p, i) => i > 0 && p.v <= peak * 0.05 && pts.slice(0, i).some(q => q.v >= peak * 0.99),
            );
            const end = goneAt > 0 ? Math.min(pts.length, Math.ceil(goneAt * 1.15)) : pts.length;
            const kept = pts.slice(0, end);
            const step = Math.max(1, Math.floor(kept.length / 320));
            return kept.filter((_, i) => i % step === 0 || i === kept.length - 1);
        }
    }
    return [];
}

const Medication = ({
    id,
    weight,
    birthYear,
    events,
    plan,
    onBack,
    onLog,
    onOpenJournal,
}: {
    id: string | undefined;
    weight: number;
    birthYear: number | null;
    events: DoseEvent[];
    plan: PlanItem[];
    onBack: () => void;
    /** Opens the journal's form with this medicine and route already chosen. */
    onLog: (route: Route, ester: Ester, amount: number) => void;
    onOpenJournal: () => void;
}) => {
    const { t } = useTranslation();
    const { mode, isTransmasc } = useHRTMode();
    const med = useMemo(() => medsFor(mode).find(m => m.id === id), [mode, id]);
    const structure = useStructure(id ?? '');

    useEffect(() => {
        if (med) noteRecent(med.id);
    }, [med]);

    const planned = med ? plan.filter(p => p.ester === med.id) : [];
    const [route, setRoute] = useState<Route | undefined>(() => planned[0]?.route ?? med?.routes[0]);
    const r = route && med?.routes.includes(route) ? route : med?.routes[0];
    const mine = planned.find(p => p.route === r);
    const isPatch = r === Route.patchApply;
    const usual = r && med ? parseFloat(freshDraft(r, med.id).dose) : 0;
    const planAmount = mine ? (isPatch ? (mine.extras[ExtraKey.releaseRateUGPerDay] ?? usual) : mine.doseMG) : null;
    const [picked, setPicked] = useState<Record<string, number>>({});
    const amount = (r && picked[r]) ?? planAmount ?? usual;
    // Dragging the rail: the number follows the finger at once; the curve,
    // which runs the model, catches up when there is time.
    const railRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const curveAmount = useDeferredValue(amount);

    // The level guide, where there is one for this amount and route.
    const guide = r && med && !isTransmasc && isEstradiolEster(med.id) ? DOSE_GUIDE_CONFIG[r] : undefined;
    const level = guide ? levelOf(amount, guide) : null;

    const [startMs] = useState(() => Math.round(Date.now() / 60000) * 60000);
    // One dose's curve. Cheap enough to run on every change of the amount
    // (the model steps an hour at a time over at most four months).
    const startEv = r && med?.modelled ? doseEvent(r, med.id, curveAmount, startMs / 3600000) : null;
    const curve = startEv ? curveOf(startEv, weight, birthYear) : [];
    const series = med ? seriesOf(med.id) : null;

    if (!med || !r) {
        return (
            <>
                <PageHeader title={t('med.not_found')} onBack={onBack} />
                <div className={PAGE_COLUMN}>
                    <p className={`text-sm ${muted}`}>{t('med.not_found_hint')}</p>
                </div>
            </>
        );
    }

    const name = medName(med.id, t);
    const products = productsOf(med, t);
    const unit = isPatch ? 'µg/d' : 'mg';
    const logged = events.filter(e => e.ester === med.id).sort((a, b) => b.timeH - a.timeH);

    // The rail: a band from the guide's medium step, ends either side of the
    // whole guide, on the log scale LevelRail draws. The amount snaps to a step
    // a dose comes in: a quarter milligram under 4, a half under 10, then
    // whole ones; a patch by 25 µg a day.
    const domain: [number, number] = guide
        ? [guide.thresholds[0] / 4, guide.thresholds[3] * 1.6]
        : [Math.max(usual / 8, 0.01), usual * 8];
    const fromRail = (f: number) => domain[0] * Math.pow(domain[1] / domain[0], f);
    const stepOf = (v: number) => (isPatch ? 25 : v < 4 ? 0.25 : v < 10 ? 0.5 : 1);
    const snap = (v: number) => Math.max(stepOf(v), Math.round(v / stepOf(v)) * stepOf(v));
    const setAmount = (v: number) => setPicked(p => (p[r] === v ? p : { ...p, [r]: v }));
    const amountAt = (clientX: number) => {
        const box = railRef.current?.getBoundingClientRect();
        if (!box || !box.width) return amount;
        return snap(fromRail(Math.min(1, Math.max(0, (clientX - box.left) / box.width))));
    };

    return (
        <>
            <PageHeader
                title={name}
                onBack={onBack}
                actions={
                    <button
                        type="button"
                        className={`${headerActionAccent} tap-target`}
                        onClick={() => onLog(r, med.id, amount)}
                    >
                        <Plus size={16} />
                        {t('med.log')}
                    </button>
                }
            />

            {/* What it is, then how much, as the journal's substance page opens. */}
            <header className="pt-2 pb-5 border-b-(length:--hairline) border-[var(--border)]">
                <div className={PAGE_COLUMN}>
                    <div className="flex items-center gap-4">
                        <Molecule id={med.id} fallback={med.routes[0] as DoodleName} size="lg" />
                        <div className="min-w-0">
                            <p className="text-sm text-[var(--text)]">{t(`kind.${med.kind}.one`)}</p>
                            {products.length > 0 && (
                                <p className={`text-xs ${muted} mt-1`}>{products.join(t('list.sep'))}</p>
                            )}
                            {structure?.formula && (
                                <a
                                    href={`https://pubchem.ncbi.nlm.nih.gov/compound/${structure.cid}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 block text-sm text-[var(--text)] no-underline"
                                >
                                    <Formula of={structure.formula} />
                                    {structure.mass != null && (
                                        <span className={`text-xs ${muted}`}>{`, ${structure.mass} g/mol`}</span>
                                    )}
                                </a>
                            )}
                        </div>
                    </div>

                    {(mine || logged.length > 0) && (
                        <button
                            type="button"
                            onClick={onOpenJournal}
                            className={`mt-4 flex items-center gap-1 text-start text-sm tabular-nums ${muted} hover:text-[var(--text)]`}
                        >
                            {[
                                mine && `${fmtAmount(planAmount ?? 0)} ${unit} · ${frequencyLabel(mine, t)}`,
                                logged.length > 0 &&
                                    (logged.length === 1
                                        ? t('stats.one_dose')
                                        : fill(t('stats.n_doses'), { n: logged.length })),
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                            <ChevronRight size={16} className="shrink-0 opacity-70 rtl:-scale-x-100" />
                        </button>
                    )}

                    {/* How much, the route chosen on the right. */}
                    <div className="mt-6 flex items-center justify-between gap-3 mb-4">
                        <h2 className={`text-sm ${muted}`}>{t('med.how_much')}</h2>
                        {med.routes.length > 1 && (
                            <Segmented
                                aria-label={t('med.route')}
                                options={med.routes.map(rt => ({ id: rt, label: t(`regimen.route.${rt}`) }))}
                                value={r}
                                onChange={v => setRoute(v as Route)}
                            />
                        )}
                    </div>

                    <p className={`text-xs font-medium ${muted}`}>
                        {fill(t('med.in_unit'), { route: t(`regimen.route.${r}`), unit })}
                    </p>
                    <p className="font-display mt-1.5 flex items-baseline gap-x-2 font-light leading-none tracking-[-0.035em] tabular-nums text-[length:var(--text-reading-sm-size)] sm:text-[length:var(--text-reading-md-size)]">
                        <span className="text-[var(--text)]">{fmtAmount(amount)}</span>
                        <span className={`text-sm font-normal tracking-normal ${muted}`}>{unit}</span>
                    </p>

                    {guide && level && (
                        // The rail itself is the slider: press anywhere on it and
                        // slide, or use the arrow keys.
                        <div
                            ref={railRef}
                            role="slider"
                            tabIndex={0}
                            aria-label={t('med.how_much')}
                            aria-valuemin={domain[0]}
                            aria-valuemax={domain[1]}
                            aria-valuenow={amount}
                            aria-valuetext={`${fmtAmount(amount)} ${unit}`}
                            className="relative mt-3 cursor-ew-resize select-none rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-ink)]"
                            style={{ touchAction: 'pan-y' }}
                            onPointerDown={e => {
                                if (e.button !== 0) return;
                                try {
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                } catch {
                                    /* already let go */
                                }
                                setDragging(true);
                                setAmount(amountAt(e.clientX));
                            }}
                            onPointerMove={e => {
                                if (dragging) setAmount(amountAt(e.clientX));
                            }}
                            onPointerUp={() => setDragging(false)}
                            onPointerCancel={() => setDragging(false)}
                            onKeyDown={e => {
                                const step = stepOf(amount);
                                if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
                                    setAmount(snap(Math.min(domain[1], amount + step)));
                                else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
                                    setAmount(snap(Math.max(domain[0], amount - step)));
                                else return;
                                e.preventDefault();
                            }}
                        >
                            <LevelRail
                                value={amount}
                                band={{ low: guide.thresholds[0], high: guide.thresholds[1] }}
                                domain={domain}
                                label={t(`dose.guide.level.${level}`)}
                                tone={LEVEL_BADGE_STYLES[level]}
                            />
                        </div>
                    )}

                    {guide && (
                        <div className="settings-section mt-4">
                            {LEVELS.map((lv, i) => {
                                const lo = i === 0 ? 0 : guide.thresholds[i - 1];
                                const hi = guide.thresholds[i];
                                const here = level === lv || (lv === 'very_high' && level === 'above');
                                return (
                                    <button
                                        key={lv}
                                        type="button"
                                        onClick={() => setAmount(hi)}
                                        className="w-full min-h-12 flex items-center justify-between gap-3 py-2 text-start"
                                    >
                                        <span className="min-w-0">
                                            <span
                                                className={`block text-sm ${here ? 'text-[var(--text)] font-medium' : 'text-[var(--text)]'}`}
                                            >
                                                {t(`dose.guide.level.${lv}`)}
                                            </span>
                                            <span className={`block text-xs ${muted} mt-0.5 tabular-nums`}>
                                                {i === 0
                                                    ? `≤ ${formatGuideNumber(hi)} ${t(`dose.guide.unit.${guide.unitKey}`)}`
                                                    : `${formatGuideNumber(lo)}–${formatGuideNumber(hi)} ${t(`dose.guide.unit.${guide.unitKey}`)}`}
                                            </span>
                                        </span>
                                        <Tick on={here} tone="current" className={LEVEL_BADGE_STYLES[lv]} />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </header>

            <main className={`${PAGE_COLUMN} pt-5 pb-10 md:pb-32 flex flex-col gap-10`}>
                <section>
                    <h2 className="text-sm font-medium text-[var(--text)] mb-1">{t('med.how_long')}</h2>
                    {series && curve.length > 0 ? (
                        <DoseCurve points={curve} unit={series.unit} startMs={startMs} decimals={series.decimals} />
                    ) : (
                        <p className={`text-sm ${muted}`}>{t('med.no_model')}</p>
                    )}
                </section>
            </main>
        </>
    );
};

export default Medication;
