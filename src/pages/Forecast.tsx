import React, { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CalibrationHistoryMode, CalibrationMethod, CalibrationResult, DoseEvent, Ester, ExtraKey, LabResult, Route, SL_TIER_ORDER, SublingualTierParams } from '../../logic';
import PageHeader, { PAGE_COLUMN, headerAction } from '../components/PageHeader';
import CustomSelect from '../components/CustomSelect';
import Switch from '../components/Switch';
import Tabs from '../components/Tabs';
import DateTimePicker from '../components/DateTimePicker';
import ForecastChart, { ChartLine } from '../components/ForecastChart';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { useDialog } from '../contexts/DialogContext';
import { DoseTemplate } from '../hooks/useAppData';
import { Regimen, PlanSpec, Scenario, ForecastInput, forecastCurrent, forecastPlan, adherenceOf } from '../utils/regimen';
import { regimenLabel, intervalLabel, dueLabel, fill } from '../utils/regimenText';

const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';
const inputCls = 'w-full rounded-md border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-transparent px-3 py-2 text-sm tabular-nums text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] outline-none focus:border-[var(--color-m3-outline)] dark:focus:border-[var(--color-m3-dark-outline)]';
const labelCls = `block text-xs font-semibold mb-1.5 pl-1 ${muted}`;
const cell = 'py-2.5 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]';

/** Which drugs each route can carry, per mode: what the dose form offers, minus the antiandrogen. */
const DRUGS: Record<'transfem' | 'transmasc', Partial<Record<Route, Ester[]>>> = {
    transfem: {
        [Route.injection]: [Ester.EV, Ester.EB, Ester.EC, Ester.EN, Ester.EU],
        [Route.oral]: [Ester.EV, Ester.E2],
        [Route.sublingual]: [Ester.E2, Ester.EV],
        [Route.gel]: [Ester.E2],
        [Route.patchApply]: [Ester.E2],
    },
    transmasc: {
        [Route.injection]: [Ester.TC, Ester.TE, Ester.TU],
        [Route.gel]: [Ester.T],
        [Route.patchApply]: [Ester.T],
    },
};
const INTERVALS = [12, 24, 48, 84, 120, 168, 240, 336];
const HORIZONS = [4, 8, 12] as const;
const MAX_PLANS = 3;
const LETTERS = ['A', 'B', 'C'];
const DASHES = ['5 3', '2 3', '8 3 2 3'];

interface Draft {
    id: string;
    route: Route;
    ester: Ester;
    dose: string;
    intervalH: number;
    slTier: number;
    wearDays: string;
    startH: number;
    replace: boolean;
}

const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };

interface ForecastProps {
    onBack: () => void;
    events: DoseEvent[];
    weight: number;
    labResults: LabResult[];
    calibration: CalibrationResult;
    calibrationMethod: CalibrationMethod;
    calibrationHistoryMode: CalibrationHistoryMode;
    regimens: Regimen[];
    nowH: number;
    isDarkMode: boolean;
    onSaveTemplate: (template: DoseTemplate) => void;
}

const Forecast: React.FC<ForecastProps> = ({
    onBack, events, weight, labResults, calibration, calibrationMethod, calibrationHistoryMode, regimens, nowH, isDarkMode, onSaveTemplate,
}) => {
    const { t, lang } = useTranslation();
    const { mode, isTransmasc } = useHRTMode();
    const { showDialog } = useDialog();
    const target = isTransmasc ? { low: 300, high: 1000 } : { low: 100, high: 200 };
    const unit = isTransmasc ? 'ng/dL' : 'pg/mL';
    const hourNow = Math.floor(nowH);

    const main = useMemo(
        () => regimens.filter(r => r.hormone === (isTransmasc ? 'T' : 'E2')).sort((a, b) => b.intervalH - a.intervalH)[0] ?? null,
        [regimens, isTransmasc],
    );

    // A plan starts as the current regimen, so the first thing on screen is
    // where things are heading and every edit reads as a change from it.
    const fromMain = (): Draft => {
        const rate = main?.extras[ExtraKey.releaseRateUGPerDay];
        const wearH = main?.extras[ExtraKey.patchWearH];
        return {
            id: uuidv4(),
            route: main?.route ?? Route.injection,
            ester: main?.ester ?? (isTransmasc ? Ester.TC : Ester.EV),
            dose: main ? String(main.route === Route.patchApply && rate ? rate : Number(main.doseMG.toFixed(3))) : (isTransmasc ? '50' : '5'),
            intervalH: main?.intervalH ?? 168,
            slTier: main?.extras[ExtraKey.sublingualTier] ?? 2,
            wearDays: wearH ? String(Number((wearH / 24).toFixed(2))) : '',
            startH: main ? Math.max(main.nextH, hourNow) : hourNow,
            replace: true,
        };
    };
    const [plans, setPlans] = useState<Draft[]>(() => [fromMain()]);
    const [activeId, setActiveId] = useState(() => plans[0].id);
    const [horizonWeeks, setHorizonWeeks] = useState<number>(8);
    const [pickingStart, setPickingStart] = useState(false);
    const active = plans.find(p => p.id === activeId) ?? plans[0];
    const update = (patch: Partial<Draft>) => setPlans(ps => ps.map(p => (p.id === active.id ? { ...p, ...patch } : p)));

    const drugsFor = (r: Route) => DRUGS[mode][r] ?? [];
    const pickRoute = (r: Route) => {
        const patch: Partial<Draft> = { route: r };
        if (!drugsFor(r).includes(active.ester)) patch.ester = drugsFor(r)[0];
        if (r === Route.patchApply) { patch.intervalH = 84; patch.dose = '100'; patch.wearDays = '3.5'; }
        update(patch);
    };

    const toSpec = (d: Draft): PlanSpec | null => {
        const dose = num(d.dose);
        if (!(dose > 0)) return null;
        const wear = num(d.wearDays);
        const extras: PlanSpec['extras'] =
            d.route === Route.patchApply ? { [ExtraKey.releaseRateUGPerDay]: dose, [ExtraKey.patchWearH]: wear > 0 ? wear * 24 : d.intervalH }
            : d.route === Route.sublingual ? { [ExtraKey.sublingualTier]: d.slTier }
            : d.route === Route.gel ? { [ExtraKey.gelSite]: 0 } : {};
        return { route: d.route, ester: d.ester, doseMG: d.route === Route.patchApply ? 0 : dose, extras, intervalH: d.intervalH, startH: d.startH, replace: d.replace };
    };

    const horizonH = horizonWeeks * 7 * 24;
    const input: ForecastInput = useMemo(() => ({
        events, weight, labResults, calibrationMethod, calibrationHistoryMode, isTransmasc,
        nowH: hourNow, horizonH, target,
        fitErrPct: labResults.length ? calibration.fitErrPct : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [events, weight, labResults, calibrationMethod, calibrationHistoryMode, isTransmasc, hourNow, horizonH, calibration.fitErrPct]);

    // Each scenario is a few hundred ms of simulation. Run after paint, debounce
    // typing, and remember every spec already run so switching plans or
    // horizons back is free.
    const cache = useRef(new Map<string, Scenario | null>());
    const inputKey = `${events.length}|${weight}|${labResults.length}|${calibrationMethod}|${calibrationHistoryMode}|${isTransmasc}|${hourNow}|${horizonH}`;
    const [current, setCurrent] = useState<Scenario | null>(null);
    const [results, setResults] = useState<Record<string, Scenario | null>>({});
    const [busy, setBusy] = useState(true);
    useEffect(() => {
        const id = window.setTimeout(() => setCurrent(forecastCurrent(input, regimens)), 30);
        return () => window.clearTimeout(id);
    }, [input, regimens]);
    const specs = plans.map(p => ({ id: p.id, spec: toSpec(p) }));
    const specsKey = JSON.stringify(specs);
    useEffect(() => {
        setBusy(true);
        const id = window.setTimeout(() => {
            if (cache.current.size > 40) cache.current.clear();
            const next: Record<string, Scenario | null> = {};
            for (const { id, spec } of specs) {
                if (!spec) { next[id] = null; continue; }
                const k = inputKey + JSON.stringify(spec);
                if (!cache.current.has(k)) cache.current.set(k, forecastPlan(input, regimens, spec));
                next[id] = cache.current.get(k)!;
            }
            setResults(next);
            setBusy(false);
        }, 280);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input, regimens, specsKey]);

    const addPlan = () => {
        if (plans.length >= MAX_PLANS) return;
        const d = { ...active, id: uuidv4() };
        setPlans(ps => [...ps, d]);
        setActiveId(d.id);
    };
    const removePlan = () => {
        if (plans.length <= 1) return;
        const rest = plans.filter(p => p.id !== active.id);
        setPlans(rest);
        setActiveId(rest[0].id);
    };
    const saveTemplate = () => {
        const spec = toSpec(active);
        if (!spec) return;
        onSaveTemplate({
            id: uuidv4(),
            name: `${regimenLabel(spec, t)} · ${intervalLabel(spec.intervalH, t)}`,
            route: spec.route, ester: spec.ester, doseMG: spec.doseMG, extras: spec.extras,
            createdAt: Date.now(),
        });
        showDialog('alert', t('template.saved'));
    };

    const habits = main ? adherenceOf(main, events) : { missRate: 0, jitterSdH: 0 };
    const jitter = habits.jitterSdH < 1 ? `${Math.round(habits.jitterSdH * 60)} min` : `${habits.jitterSdH.toFixed(1)} h`;
    const calText = `×${calibration.scale.toFixed(2)}${Math.abs(calibration.halfLifeDeltaPct) >= 1 ? ` · t½ ${calibration.halfLifeDeltaPct > 0 ? '+' : ''}${calibration.halfLifeDeltaPct.toFixed(0)}%` : ''}`;
    const hasCal = !isTransmasc && labResults.length > 0 && calibration.fitErrPct !== null;
    const runs = (results[active.id] ?? current)?.runs ?? 48;
    const methodText = hasCal
        ? fill(t('forecast.method'), { cal: calText, miss: `${Math.round(habits.missRate * 100)}%`, jitter, err: `${calibration.fitErrPct!.toFixed(0)}%`, runs })
        : fill(t('forecast.method_nocal'), { miss: `${Math.round(habits.missRate * 100)}%`, jitter, runs });

    const planName = (i: number) => fill(t('forecast.plan_n'), { n: LETTERS[i] });
    const lines: ChartLine[] = [
        { key: 'current', label: t('forecast.legend.current'), series: current?.series ?? null, dash: '4 3', tone: 'second' },
        ...plans.map((p, i) => ({ key: p.id, label: planName(i), series: results[p.id]?.series ?? null, dash: DASHES[i], tone: 'primary' as const })),
    ];

    const steadyText = (sc: Scenario | null) => {
        if (!sc) return '';
        if (sc.steadyAfterH === null) return fill(t('forecast.steady_beyond'), { n: horizonWeeks });
        const atH = sc.steadyFromH + sc.steadyAfterH;
        if (atH <= hourNow) return t('forecast.steady_now');
        return fill(t('forecast.steady_week'), { n: Math.max(1, Math.ceil((atH - hourNow) / 168)) });
    };
    const statCell = (sc: Scenario | null, key: 'trough' | 'peak' | 'average' | 'inRange') => {
        if (!sc) return <span className={`${cell} ${muted}`}>…</span>;
        if (key === 'inRange') {
            return <span className={`${cell} tabular-nums ${on}`}>{sc.stats.inRange === null ? '—' : `${Math.round(sc.stats.inRange * 100)}%`}</span>;
        }
        const r = sc.range?.[key];
        return (
            <span className={`${cell} tabular-nums`}>
                <span className={on}>{Math.round(sc.stats[key])}</span>
                {/* With no history to measure habits from, every run is the same and the range is a point: say nothing. */}
                {r && Math.round(r[0]) !== Math.round(r[1]) && <span className={`block text-[0.625rem] ${muted}`}>{Math.round(r[0])}–{Math.round(r[1])}</span>}
            </span>
        );
    };
    const statRow = (name: string, sub: string, sc: Scenario | null, isPlan: boolean) => (
        <React.Fragment key={name}>
            <span className={`col-span-4 pt-3 pb-1 text-sm ${isPlan ? on : muted}`}>
                {name}{sub && <span className={`text-xs ${muted}`}> · {sub}</span>}
            </span>
            {statCell(sc, 'trough')}{statCell(sc, 'peak')}{statCell(sc, 'average')}{statCell(sc, 'inRange')}
        </React.Fragment>
    );

    const intervalOptions = Array.from(new Set([...INTERVALS, ...(main ? [main.intervalH] : []), active.intervalH])).sort((a, b) => a - b);
    const tierOptions = SL_TIER_ORDER.map((tierKey, index) => ({ value: String(index), label: t(`sl.tier.${tierKey}`), description: `${SublingualTierParams[tierKey].hold} min` }));
    const activeIndex = plans.findIndex(p => p.id === active.id);
    const planTabs = plans.map((p, i) => ({ id: p.id, label: planName(i) }));

    return (
        <div className="relative pb-32">
            <PageHeader onBack={onBack} title={t('forecast.title')} />
            <div className={`${PAGE_COLUMN} mt-3 space-y-8`}>
                <section>
                    <p className={`text-xs font-semibold mb-2 ${muted}`}>{t('forecast.current')}</p>
                    {main ? (
                        <p className={`text-[0.9375rem] ${on}`}>
                            {regimenLabel(main, t)} <span className={muted}>· {intervalLabel(main.intervalH, t)}</span>
                        </p>
                    ) : (
                        <p className={`text-sm ${muted}`}>{t('forecast.none')}</p>
                    )}
                </section>

                <section className="space-y-4">
                    <div className="flex items-end justify-between gap-4">
                        <Tabs tabs={planTabs} value={active.id} onChange={setActiveId} className="flex-1 min-w-0" />
                        {plans.length < MAX_PLANS && (
                            <button type="button" onClick={addPlan} className="pb-2 text-sm font-medium text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] shrink-0">
                                {t('forecast.add_plan')}
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <CustomSelect
                            label={t('forecast.route')}
                            value={active.route}
                            onChange={v => pickRoute(v as Route)}
                            options={(Object.keys(DRUGS[mode]) as Route[]).map(r => ({ value: r, label: t(`regimen.route.${r}`) }))}
                        />
                        <CustomSelect
                            label={t('forecast.drug')}
                            value={active.ester}
                            onChange={v => update({ ester: v as Ester })}
                            options={drugsFor(active.route).map(e => ({ value: e, label: t(`ester.${e}`) }))}
                        />
                        <label className="block">
                            <span className={labelCls}>{t('forecast.dose')} ({active.route === Route.patchApply ? `µg${t('regimen.per_day')}` : 'mg'})</span>
                            <input type="number" inputMode="decimal" min="0" step="any" value={active.dose} onChange={e => update({ dose: e.target.value })} className={inputCls} style={{ fontSize: '16px' }} />
                        </label>
                        <CustomSelect
                            label={t('forecast.interval')}
                            value={String(active.intervalH)}
                            onChange={v => update({ intervalH: Number(v) })}
                            options={intervalOptions.map(h => ({ value: String(h), label: intervalLabel(h, t) }))}
                        />
                        {active.route === Route.sublingual && (
                            <CustomSelect label={t('field.sl_absorption')} value={String(active.slTier)} onChange={v => update({ slTier: Number(v) })} options={tierOptions} />
                        )}
                        {active.route === Route.patchApply && (
                            <label className="block">
                                <span className={labelCls}>{t('field.patch_wear')}</span>
                                <input type="number" inputMode="decimal" min="0" step="any" value={active.wearDays} onChange={e => update({ wearDays: e.target.value })} className={inputCls} style={{ fontSize: '16px' }} />
                            </label>
                        )}
                        <label className="block">
                            <span className={labelCls}>{t('forecast.start')}</span>
                            <button type="button" onClick={() => setPickingStart(true)} className={`${inputCls} text-start`} style={{ fontSize: '16px' }}>
                                {dueLabel(active.startH, lang, true, hourNow)}
                            </button>
                        </label>
                    </div>
                    {main && (
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className={`text-[0.9375rem] ${on}`}>{t('forecast.replace')}</p>
                                <p className={`text-xs mt-0.5 ${muted}`}>{t('forecast.replace_desc')}</p>
                            </div>
                            <Switch checked={active.replace} onChange={v => update({ replace: v })} label={t('forecast.replace')} />
                        </div>
                    )}
                    <div className="flex items-center justify-end gap-1 -mr-2">
                        {plans.length > 1 && (
                            <button type="button" onClick={removePlan} className={`${headerAction} text-red-600 dark:text-red-400`}>{t('forecast.remove_plan')}</button>
                        )}
                        <button type="button" onClick={saveTemplate} disabled={!toSpec(active)} className={`${headerAction} text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] disabled:opacity-40`}>{t('forecast.save_template')}</button>
                    </div>
                </section>

                <section aria-busy={busy}>
                    <div className="mb-3 flex items-center justify-end">
                        <Tabs compact tabs={HORIZONS.map(w => ({ id: String(w), label: fill(t('forecast.weeks'), { n: w }) }))} value={String(horizonWeeks)} onChange={v => setHorizonWeeks(Number(v))} />
                    </div>
                    <ForecastChart
                        history={current?.series ?? null}
                        lines={lines}
                        band={results[active.id]?.band ?? null}
                        bandLabel={`${planName(activeIndex)} ${t('forecast.legend.band')}`}
                        nowH={hourNow}
                        horizonH={horizonH}
                        target={target}
                        unit={unit}
                        isDarkMode={isDarkMode}
                        lang={lang}
                        labels={{ history: t('forecast.legend.history'), target: t('chart.target') }}
                    />
                    <p className={`mt-1 h-4 text-xs ${muted} transition-opacity ${busy ? 'opacity-100' : 'opacity-0'}`}>{t('forecast.computing')}</p>
                </section>

                <section>
                    <p className={`text-xs font-semibold ${muted}`}>{fill(t('forecast.steady_header'), { n: horizonWeeks })} · {unit}</p>
                    <div className="grid grid-cols-4 gap-x-3 text-sm">
                        <span className={`${cell} text-xs ${muted}`}>{t('forecast.trough')}</span>
                        <span className={`${cell} text-xs ${muted}`}>{t('forecast.peak')}</span>
                        <span className={`${cell} text-xs ${muted}`}>{t('forecast.average')}</span>
                        <span className={`${cell} text-xs ${muted}`}>{t('forecast.in_range')}</span>
                        {statRow(t('forecast.legend.current'), steadyText(current), current, false)}
                        {plans.map((p, i) => statRow(planName(i), steadyText(results[p.id] ?? null), results[p.id] ?? null, true))}
                    </div>
                    {plans.some(p => (results[p.id]?.stats.trough ?? Infinity) < target.low) && (
                        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{fill(t('forecast.below'), { low: `${target.low} ${unit}` })}</p>
                    )}
                    <p className={`mt-4 text-xs leading-relaxed ${muted}`}>{methodText}</p>
                </section>
            </div>

            <DateTimePicker
                isOpen={pickingStart}
                onClose={() => setPickingStart(false)}
                onConfirm={date => { update({ startH: Math.max(hourNow, date.getTime() / 3600000) }); setPickingStart(false); }}
                initialDate={new Date(active.startH * 3600000)}
                mode="datetime"
                title={t('forecast.start')}
            />
        </div>
    );
};

export default Forecast;
