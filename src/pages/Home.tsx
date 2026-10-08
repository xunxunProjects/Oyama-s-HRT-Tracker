import React from 'react';
import { Info, Share2, ChevronRight } from 'lucide-react';
import { DoseEvent, Ester, SimulationResult, LabResult, getDoseAdvisory, getHormoneLevelAdvisory, isT_LabUnit, CPA_MIN_NGML } from '../../logic';
import ResultChart from '../components/ResultChart';
import DoseHeatmap from '../components/DoseHeatmap';
import EstimateInfoModal from '../components/EstimateInfoModal';
import DoseAdvisoryNotice from '../components/DoseAdvisory';
import AnimatedNumber from '../components/AnimatedNumber';
import LevelRail from '../components/LevelRail';
import PixelCat from '../components/PixelCat';
import DoseDoodle from '../components/DoseDoodle';
import { useHRTMode } from '../contexts/HRTModeContext';
import { usePixelCats } from '../contexts/PixelCatContext';
import { AppTheme } from '../constants';
import { useTranslation } from '../contexts/LanguageContext';
import { getShareCopy } from '../i18n/share';
import { Regimen, Supply, supplyStatus } from '../utils/regimen';
import { PlanItem, planStatus } from '../utils/plan';
import { planItemLabel, supplyLabel, dueLabel, fill, fillNodes } from '../utils/regimenText';
import { headerAction, headerActionAccent } from '../components/PageHeader';

interface HomeProps {
    t: (key: string) => string;
    currentLevel: number;
    currentCPA: number;
    currentT: number;
    currentStatus: { label: string, color: string, bg: string, border: string } | null;
    events: DoseEvent[];
    simulation: SimulationResult | null;
    /** The same model with the regimens' next doses added: what the chart draws, dashed, after "now". */
    simulationAhead: SimulationResult | null;
    /** Whether the chart carries on past "now" at all (Settings, off by default). */
    showPrediction: boolean;
    labResults: LabResult[];
    onEditEvent: (e: DoseEvent) => void;
    calibrationFn: (timeH: number) => number;
    theme: AppTheme;
    onNavigateToHistory: () => void;
    onNavigateToLab: () => void;
    onNavigateToShare: () => void;
    authToken: string | null;
    onAuthRequired: () => void;
    regimens: Regimen[];
    supplies: Supply[];
    nowH: number;
    onNavigateToForecast: () => void;
    supplyLeadDays: number;
    /** The medication plan; each item gets a line saying where today stands, and a button that logs its dose. */
    plan: PlanItem[];
    onLogPlanItem: (item: PlanItem) => void;
    /** The item whose dose was just logged from here and can still be taken back. */
    /** Plan items with a dose tapped in from here that can still be taken back. */
    undoableIds: string[];
    onUndoPlanLog: (itemId: string) => void;
    onNavigateToPlan: () => void;
}

const Home: React.FC<HomeProps> = ({
    t,
    currentLevel,
    currentCPA,
    currentT,
    currentStatus,
    events,
    simulation,
    simulationAhead,
    showPrediction,
    labResults,
    onEditEvent,
    calibrationFn,
    theme,
    onNavigateToHistory,
    onNavigateToLab,
    onNavigateToShare,
    authToken,
    onAuthRequired,
    regimens,
    supplies,
    nowH,
    onNavigateToForecast,
    supplyLeadDays,
    plan,
    onLogPlanItem,
    undoableIds,
    onUndoPlanLog,
    onNavigateToPlan,
}) => {
    const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const isMono = theme === 'mono';
    const [isEstimateInfoOpen, setIsEstimateInfoOpen] = React.useState(false);
    const { isTransmasc } = useHRTMode();
    const { showCats } = usePixelCats();
    const { lang } = useTranslation();
    const shareCopy = getShareCopy(lang);

    // Warn on how much medication was actually logged (a hard fact), and nudge
    // toward calibration when there's no lab yet to anchor the estimate.
    const doseAdvisory = React.useMemo(() => getDoseAdvisory(events), [events]);

    // A supply nothing current uses never runs low.
    const lowSupplies = React.useMemo(() => supplies
        .map(s => supplyStatus(s, events, regimens, nowH))
        .filter(st => st.dailyUse !== null && (st.remaining <= 0 || (st.runOutH !== null && st.runOutH - nowH < supplyLeadDays * 24))),
    [supplies, events, regimens, nowH, supplyLeadDays]);
    const hormoneAdvisory = React.useMemo(() => getHormoneLevelAdvisory(labResults), [labResults]);
    const hasLabForMode = labResults.some(l => (isTransmasc ? isT_LabUnit(l.unit) : !isT_LabUnit(l.unit)));
    const showCalibrate = events.length > 0 && !hasLabForMode;

    // What the header holds. With nothing logged there is no estimate to read,
    // and a "--" under "Current estimated level" only said again what the empty
    // state below says better; the plan rows still show, since tapping one is
    // the quickest way to log that first dose.
    const hasReading = events.length > 0;
    const hasAdvisory = !!doseAdvisory || !!hormoneAdvisory || showCalibrate;
    const showPlanBlock = hasReading || plan.length > 0 || lowSupplies.length > 0;
    const showHeader = hasAdvisory || showPlanBlock;

    // A cat turns up for each kind of record that's been logged: the donut for
    // doses, the loaf for labs. Sits in the gap between the two readings, so it
    // has to be rendered inside whichever mode branch is active.
    // Sits inline right after the reading so it costs a bit of the number's own
    // line rather than a block of its own. On a narrow screen two cats and two
    // long readings don't fit across; the line wraps and the cats drop under the
    // number rather than shoving the second reading off the edge.
    const cats = showCats && (events.length > 0 || labResults.length > 0) ? (
        <span className="flex shrink-0 items-end gap-1 self-end pb-1">
            {events.length > 0 && <PixelCat pose="donut" size={32} />}
            {labResults.length > 0 && <PixelCat pose="loaf" size={32} />}
        </span>
    ) : null;

    const on = "text-[var(--text)]";
    const muted = "text-[var(--text-muted)]";
    const dim = "text-[var(--text-disabled)]";

    // A reading's number and unit. The slot carries the number's type size, so
    // `ch` in its min-width is one tabular digit at whatever size the breakpoint
    // picked; the rem part covers the gap and the unit after it.
    const readingSlot = "inline-flex items-baseline gap-x-2 text-[3rem] sm:text-[3.75rem] md:text-[4.5rem] font-light leading-none tracking-[-0.035em] tabular-nums";
    const slotWidth = (intDigits: number, decimals: number) =>
        `calc(${intDigits + decimals + (decimals ? 0.35 : 0)}ch + 3.25rem)`;

    // The reading the page is about, with the band the chart shades for it.
    // Rail ends sit a decade either side of the band, which is where readings
    // actually land; anything past them pins to the end.
    const primary = isTransmasc
        ? { label: t('label.total_t'), value: currentT, decimals: 0, unit: 'ng/dl', band: { low: 300, high: 1000 }, domain: [30, 3000] as [number, number] }
        : { label: t('label.e2'), value: currentLevel, decimals: 1, unit: 'pg/ml', band: { low: 100, high: 200 }, domain: [10, 1000] as [number, number] };

    // The second reading, flush right at the same size as the first: for
    // transmasc, the same total T in nmol/L; for transfem, cyproterone. Only
    // shown once there is something to show: a permanent "CPA --" for anyone
    // not taking it was just noise. An estimate under CPA_MIN_NGML goes in as
    // 0, which reads "--", rather than a washed-out tail that never hits zero.
    const hasCPA = !isTransmasc && events.some(e => e.ester === Ester.CPA);
    const companion = isTransmasc
        ? (currentT > 0 ? { label: '', value: currentT / 28.842, decimals: 1, unit: 'nmol/l' } : null)
        : hasCPA
            ? { label: t('label.cpa_chart'), value: currentCPA >= CPA_MIN_NGML ? currentCPA : 0, decimals: 1, unit: 'ng/ml' }
            : null;

    return (
        <>
            <EstimateInfoModal isOpen={isEstimateInfoOpen} onClose={() => setIsEstimateInfoOpen(false)} />

            {/* Header and body share one column, centred in the pane. Pinned
                to the left, the readings and chart filled a phone's width of a
                desktop window while the header rule ran the full width under
                them, and the page leaned left. Once the heatmap sits beside the
                chart the column widens with the body, but what the header holds
                keeps to the chart's own width above it: stretched across both,
                the second reading sat over the heatmap, a full desktop away from
                the first, and each plan row's button from its sentence. */}
            {showHeader && (
            <header className="pt-6 pb-5 border-b border-[var(--border)]">
                <div className={`mx-auto px-6 md:px-8 max-w-2xl ${events.length ? '2xl:max-w-[74rem]' : ''}`}>
                <div className="2xl:flex 2xl:gap-10">
                <div className="min-w-0 max-w-2xl 2xl:flex-1">
                {hasReading && (
                <>
                {/* Title row. The whole title opens the explainer, not just
                    the 13px icon after it. */}
                <div className="flex items-center justify-between gap-3 mb-4">
                    <button
                        type="button"
                        onClick={() => setIsEstimateInfoOpen(true)}
                        className={`tap-target group inline-flex min-w-0 items-center gap-1.5 text-left text-sm ${muted} hover:text-[var(--text)]`}
                        title={t('status.read_me')}
                    >
                        <span className="truncate">{t('status.estimate')}</span>
                        <Info size={13} className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (!authToken) {
                                onAuthRequired();
                                return;
                            }
                            onNavigateToShare();
                        }}
                        className={`${muted} tap-target inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 -mr-2 text-xs font-medium hover:text-[var(--text)] hover:bg-[var(--surface-hover)]`}
                        title={shareCopy.modalDescription}
                    >
                        <Share2 size={14} strokeWidth={1.75} />
                        {shareCopy.action}
                    </button>
                </div>

                {/* Readings. A grid rather than two flex columns so each row
                    lines up on its own: the labels share a baseline, and so do
                    the two numbers. On a 375px screen the first column is the
                    one that gives — minmax(0,…) lets it shrink and its number
                    line wraps, so the cats drop under the reading instead of
                    shoving the second reading off the edge. */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1.5">
                    <p className={`text-[0.8125rem] font-medium ${muted}`}>{primary.label}</p>
                    <p className={`text-right text-[0.8125rem] font-medium ${muted}`}>{companion?.label}</p>

                    {/* Number and unit sit in a slot wide enough for a
                        four-digit reading (two for the second column), so a
                        reading gaining a digit, or counting up from zero on
                        load, doesn't shove the cats or the other column about.
                        The status rides on the tick scale, which a screen
                        reader skips, so it is said here, after the unit. */}
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className={readingSlot} style={{ minWidth: slotWidth(4, primary.decimals) }}>
                            {primary.value > 0 ? (
                                <>
                                    <span className={on}><AnimatedNumber value={primary.value} decimals={primary.decimals} /></span>
                                    <span className={`text-sm font-normal tracking-normal ${muted}`}>{primary.unit}</span>
                                    {currentStatus && <span className="sr-only">{t(currentStatus.label)}</span>}
                                </>
                            ) : (
                                <span className={dim}>--</span>
                            )}
                        </span>
                        {cats}
                    </div>

                    {companion ? (
                        <span className={`${readingSlot} justify-end whitespace-nowrap`} style={{ minWidth: slotWidth(2, companion.decimals) }}>
                            {companion.value > 0 ? (
                                <>
                                    <span className={on}><AnimatedNumber value={companion.value} decimals={companion.decimals} /></span>
                                    <span className={`text-sm font-normal tracking-normal ${muted}`}>{companion.unit}</span>
                                </>
                            ) : (
                                <span className={dim}>--</span>
                            )}
                        </span>
                    ) : <span />}

                    {/* The scale runs the full width under both readings. Kept
                        to the first one's column beside a second reading, it
                        came out too short to read. */}
                    {primary.value > 0 && (
                        <div className="col-span-2 mt-0.5">
                            <LevelRail
                                value={primary.value}
                                band={primary.band}
                                domain={primary.domain}
                                label={currentStatus ? t(currentStatus.label) : undefined}
                                tone={currentStatus?.color}
                            />
                        </div>
                    )}
                </div>
                </>
                )}

                {hasAdvisory && (
                    <div className={hasReading ? 'mt-3' : ''}>
                        <DoseAdvisoryNotice advisory={doseAdvisory} hormoneAdvisory={hormoneAdvisory} showCalibrate={showCalibrate} onCalibrate={onNavigateToLab} t={t} />
                    </div>
                )}

                {/* Where today stands for each item of the plan, and any medicine
                    about to run out. By calendar day: no clock times, and a dose
                    that is late is simply still due. Each item is a list row:
                    the drug, where today stands under it, its button beside
                    both. Written as one sentence ("Today's Estradiol Valerate:
                    1 of 2 done") every row wrapped to two ragged lines on a
                    phone and ran into the next. Rows are 52px, so the buttons'
                    44px touch areas (.tap-target) never reach a neighbour's.
                    The way into the plan closes the list it governs; it used to
                    wait at the foot of the page, under the chart and the heatmap. */}
                {showPlanBlock && (
                    <div className={hasReading || hasAdvisory ? 'mt-2' : ''}>
                        {plan.map(item => {
                            // The real moment, not the minute clock: a dose tapped just now must count at once.
                            const st = planStatus(item, events, Date.now() / 3600000);
                            const sentence = st.kind === 'taken' ? 'plan.taken'
                                : st.kind === 'rest' ? (st.yesterday && item.everyDays === 2 ? 'plan.rest_yesterday' : 'plan.rest')
                                : item.everyDays > 1 ? 'plan.due_interval'
                                : st.done > 0 ? 'plan.due_partial' : 'plan.due';
                            return (
                                <div key={item.id} className="flex items-center justify-between gap-3 py-1.5">
                                    <div className="min-w-0">
                                        <p className={`break-words text-sm ${st.kind === 'due' ? on : muted}`}>{planItemLabel(item, plan, t)}</p>
                                        <p className={`text-xs ${muted}`}>
                                            {fillNodes(t(sentence), {
                                                verb: t(`plan.verb.${item.route}`),
                                                done: st.kind === 'due' ? st.done : 0,
                                                total: st.kind === 'due' ? st.total : 0,
                                                left: st.kind === 'due' ? st.total - st.done : 0,
                                                day: st.kind === 'rest' ? <span className="whitespace-nowrap">{dueLabel(st.nextH, lang, false, nowH)}</span> : null,
                                            })}
                                        </p>
                                    </div>
                                    {/* Undo stays as long as a tap is on record, beside the next tap
                                        while more doses are due today and alone once they are all in. */}
                                    <div className="-mr-2 flex shrink-0 items-center">
                                        {undoableIds.includes(item.id) && (
                                            <button type="button" onClick={() => onUndoPlanLog(item.id)} className={`${headerAction} ${muted} tap-target`}>
                                                {t('plan.undo')}
                                            </button>
                                        )}
                                        {st.kind !== 'taken' && (
                                            <button
                                                type="button"
                                                onClick={() => onLogPlanItem(item)}
                                                className={`${st.kind === 'due' ? headerActionAccent : `${headerAction} ${muted}`} tap-target`}
                                            >
                                                {t(`plan.done.${item.route}`)}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {lowSupplies.map(({ supply, remaining, runOutH }) => {
                            const name = supplyLabel(supply, t);
                            return (
                                <p key={supply.id} className="py-1.5 text-sm leading-relaxed text-[var(--warning)]">
                                    {remaining <= 0 || runOutH === null
                                        ? fill(t('supplies.used_up'), { name })
                                        : fillNodes(t('supplies.running_low'), { name, n: Math.max(0, Math.round((runOutH - nowH) / 24)), date: <span className="whitespace-nowrap">{dueLabel(runOutH, lang, false, nowH)}</span> })}
                                </p>
                            );
                        })}
                        <div className="pt-1.5">
                            <button
                                type="button"
                                onClick={onNavigateToPlan}
                                className={`${headerActionAccent} tap-target -ml-2.5`}
                            >
                                {t('plan.title')}
                                <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>
                )}
                </div>
                {/* Holds the heatmap's place, sized as it is in <main>, so the
                    column above keeps the chart's exact width at every size. */}
                {events.length > 0 && <div aria-hidden="true" className="hidden 2xl:block 2xl:flex-1 2xl:min-w-[16rem] 2xl:max-w-[26rem]" />}
                </div>
                </div>
            </header>
            )}

            {/* The chart column keeps its reading width; on a wide desktop the
                dose heatmap takes the space left over beside it rather than
                letting it sit empty, and drops underneath when there isn't any.
                Only widened once there's data — the empty state centres itself
                on this container and should stay in the narrow column. */}
            <main className={`w-full mx-auto max-w-2xl px-6 pt-5 pb-32 md:px-8 ${events.length ? '2xl:max-w-[74rem]' : ''}`}>
                {events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                        <DoseDoodle className="w-24 h-auto mb-6" />
                        <p className={`text-base font-semibold ${on} mb-1`}>{t('home.empty_title')}</p>
                        <p className={`text-sm ${muted} mb-6 max-w-xs`}>{t('home.empty_subtitle')}</p>
                        {/* Logging a dose is the one thing this page is waiting
                            for, so it is the one terracotta button on it. */}
                        <button
                            onClick={onNavigateToHistory}
                            className="btn-primary"
                        >
                            {t('home.empty_cta')}
                        </button>
                        {!showPlanBlock && (
                            <button
                                type="button"
                                onClick={onNavigateToPlan}
                                className={`${headerAction} ${muted} tap-target mt-3`}
                            >
                                {t('plan.title')}
                                <ChevronRight size={15} />
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-8 2xl:flex-row 2xl:items-start 2xl:gap-10">
                        <div className="min-w-0 2xl:flex-1 2xl:max-w-2xl">
                            <ResultChart
                                sim={simulation}
                                showAhead={showPrediction}
                                ahead={simulationAhead}
                                aheadBasis={simulationAhead ? (plan.length ? 'plan' : 'rhythm') : 'none'}
                                events={events}
                                onPointClick={onEditEvent}
                                labResults={labResults}
                                calibrationFn={calibrationFn}
                                isDarkMode={isDarkMode}
                                isMono={isMono}
                            />
                        </div>
                        <DoseHeatmap
                            events={events}
                            isDarkMode={isDarkMode}
                            className="min-w-0 2xl:flex-1 2xl:min-w-[16rem] 2xl:max-w-[26rem]"
                        />
                    </div>
                )}
                {events.length > 0 && (
                    <div className="mt-6 -mr-2 flex justify-end">
                        <button
                            type="button"
                            onClick={onNavigateToForecast}
                            className={`${headerActionAccent} tap-target`}
                        >
                            {t('forecast.entry')}
                            <ChevronRight size={15} />
                        </button>
                    </div>
                )}
            </main>
        </>
    );
};

export default Home;
