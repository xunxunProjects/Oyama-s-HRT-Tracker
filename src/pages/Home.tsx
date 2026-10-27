import React from 'react';
import { Info, Share, ChevronRight } from '../components/icons';
import {
    DoseEvent,
    Ester,
    SimulationResult,
    LabResult,
    getDoseAdvisory,
    getHormoneLevelAdvisory,
    isT_LabUnit,
    CPA_MIN_NGML,
} from '../../logic';
import ResultChart from '../components/ResultChart';
import DoseHeatmap from '../components/DoseHeatmap';
import DoseAdvisoryNotice from '../components/DoseAdvisory';
import AnimatedNumber from '../components/AnimatedNumber';
import LevelRail from '../components/LevelRail';
import PixelCat from '../components/PixelCat';
import DoseDoodle from '../components/DoseDoodle';
import Doodle from '../components/Doodle';
import Tick from '../components/Tick';
import { useHRTMode } from '../contexts/HRTModeContext';
import { usePixelCats } from '../contexts/PixelCatContext';
import { useDialog } from '../contexts/DialogContext';
import { AppTheme } from '../constants';
import { useTranslation } from '../contexts/LanguageContext';
import { getShareCopy } from '../i18n/share';
import { Regimen, Supply, supplyStatus } from '../utils/regimen';
import { PlanItem, planStatus, matchesItem } from '../utils/plan';
import { planItemLabel, supplyLabel, dueLabel, fill, fillNodes } from '../utils/regimenText';
import { headerAction, headerActionAccent } from '../components/PageHeader';

interface HomeProps {
    t: (key: string) => string;
    currentLevel: number;
    currentCPA: number;
    currentT: number;
    currentStatus: { label: string; color: string; bg: string; border: string } | null;
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
    /** Plan items with a dose tapped in from here that can still be taken back. */
    undoableIds: string[];
    onUndoPlanLog: (itemId: string) => void;
    onNavigateToPlan: () => void;
    /** Where a running-low line leads: the stock it is about, to recount or restock. */
    onNavigateToSupplies: () => void;
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
    onNavigateToSupplies,
}) => {
    const isDarkMode =
        theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const isMono = theme === 'mono';
    const [isEstimateInfoOpen, setIsEstimateInfoOpen] = React.useState(false);
    const { isTransmasc } = useHRTMode();
    const { showCats } = usePixelCats();
    const { lang } = useTranslation();
    const { showDialog } = useDialog();
    const shareCopy = getShareCopy(lang);
    // Ties each plan row's buttons to the drug they log (aria-describedby).
    const rowIdBase = React.useId();

    // Warn on how much medication was actually logged (a hard fact), and nudge
    // toward calibration when there's no lab yet to anchor the estimate.
    const doseAdvisory = React.useMemo(() => getDoseAdvisory(events), [events]);

    // A supply nothing current uses never runs low.
    const lowSupplies = React.useMemo(
        () =>
            supplies
                .map(s => supplyStatus(s, events, regimens, nowH))
                .filter(
                    st =>
                        st.dailyUse !== null &&
                        (st.remaining <= 0 || (st.runOutH !== null && st.runOutH - nowH < supplyLeadDays * 24)),
                ),
        [supplies, events, regimens, nowH, supplyLeadDays],
    );
    const hormoneAdvisory = React.useMemo(() => getHormoneLevelAdvisory(labResults), [labResults]);
    const hasLabForMode = labResults.some(l => (isTransmasc ? isT_LabUnit(l.unit) : !isT_LabUnit(l.unit)));
    const showCalibrate = events.length > 0 && !hasLabForMode;

    // What the header holds. With nothing logged there is no estimate to read,
    // and a "--" under "Current estimated level" only said again what the empty
    // state below says better; the plan rows still show, since tapping one is
    // the quickest way to log that first dose.
    const hasReading = events.length > 0;
    const hasAdvisory = !!doseAdvisory || !!hormoneAdvisory || showCalibrate;

    /** The latest dose of a plan item logged today (the device's calendar day), up to `atH`. */
    const latestToday = (item: PlanItem, atH: number): DoseEvent | null => {
        const d = new Date(atH * 3600000);
        const dayStartH = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 3600000;
        let latest: DoseEvent | null = null;
        for (const e of events) {
            if (!matchesItem(item, e) || e.timeH < dayStartH || e.timeH > atH) continue;
            if (!latest || e.timeH > latest.timeH) latest = e;
        }
        return latest;
    };
    const showPlanBlock = hasReading || plan.length > 0 || lowSupplies.length > 0;
    const showHeader = hasAdvisory || showPlanBlock;

    // A cat turns up for each kind of record that's been logged: the donut for
    // doses, the loaf for labs. Sits in the gap between the two readings, so it
    // has to be rendered inside whichever mode branch is active.
    // Sits inline right after the reading so it costs a bit of the number's own
    // line rather than a block of its own. On a narrow screen two cats and two
    // long readings don't fit across; the line wraps and the cats drop under the
    // number rather than shoving the second reading off the edge.
    const cats =
        showCats && (events.length > 0 || labResults.length > 0) ? (
            <span className="flex shrink-0 items-end gap-1 self-end pb-1">
                {events.length > 0 && <PixelCat pose="donut" size={32} />}
                {labResults.length > 0 && <PixelCat pose="loaf" size={32} />}
            </span>
        ) : null;

    const on = 'text-[var(--text)]';
    const muted = 'text-[var(--text-muted)]';
    const dim = 'text-[var(--text-disabled)]';

    // A reading's number and unit. The slot carries the number's type size, so
    // `ch` in its min-width is one tabular digit at whatever size the breakpoint
    // picked; the rem part covers the gap and the unit after it.
    const readingSlot =
        'font-display inline-flex items-baseline gap-x-2 font-light leading-none tracking-[-0.035em] tabular-nums';
    const fullSize =
        'text-[length:var(--text-reading-sm-size)] sm:text-[length:var(--text-reading-md-size)] md:text-[length:var(--text-reading-size)]';
    // Side by side in a column narrower than 32rem (every phone), the second
    // reading stays at 2rem and the first shrinks with the column below about
    // 18.5rem, so a four-digit estradiol peak still clears the cyproterone
    // figure on a 320px screen. From 32rem both take the reading scale again:
    // 40px, then 52px, then 64px.
    const companionSize =
        'text-[2rem] @min-[32rem]:text-[length:var(--text-reading-sm-size)] @min-[32rem]:sm:text-[length:var(--text-reading-md-size)] @min-[32rem]:md:text-[length:var(--text-reading-size)]';
    const pairedPrimarySize =
        'text-[min(var(--text-reading-sm-size),13.5cqw)] @min-[32rem]:text-[length:var(--text-reading-sm-size)] @min-[32rem]:sm:text-[length:var(--text-reading-md-size)] @min-[32rem]:md:text-[length:var(--text-reading-size)]';
    const slotWidth = (intDigits: number, decimals: number) =>
        `calc(${intDigits + decimals + (decimals ? 0.35 : 0)}ch + 3.25rem)`;

    // The reading the page is about, with the band the chart shades for it.
    // Rail ends sit a decade either side of the band, which is where readings
    // actually land; anything past them pins to the end.
    const primary = isTransmasc
        ? {
              label: t('label.total_t'),
              value: currentT,
              decimals: 0,
              unit: 'ng/dL',
              band: { low: 300, high: 1000 },
              domain: [30, 3000] as [number, number],
          }
        : {
              label: t('label.e2'),
              value: currentLevel,
              decimals: 1,
              unit: 'pg/mL',
              band: { low: 100, high: 200 },
              domain: [10, 1000] as [number, number],
          };

    // The second reading, flush right at the same size as the first: for
    // transmasc, the same total T in nmol/L; for transfem, cyproterone. Only
    // shown once there is something to show: a permanent "CPA --" for anyone
    // not taking it was just noise. An estimate under CPA_MIN_NGML goes in as
    // 0, which reads "--", rather than a washed-out tail that never hits zero.
    const hasCPA = !isTransmasc && events.some(e => e.ester === Ester.CPA);
    const companion = isTransmasc
        ? currentT > 0
            ? { label: '', value: currentT / 28.842, decimals: 1, unit: 'nmol/L' }
            : null
        : hasCPA
          ? {
                label: t('label.cpa_chart'),
                value: currentCPA >= CPA_MIN_NGML ? currentCPA : 0,
                decimals: 1,
                unit: 'ng/mL',
            }
          : null;

    return (
        <>
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
                                        {/* Title row. The whole title unfolds the explainer under
                    it, not just the 13px icon after it. */}
                                        <div className="flex items-center justify-between gap-3 mb-4">
                                            <button
                                                type="button"
                                                onClick={() => setIsEstimateInfoOpen(open => !open)}
                                                aria-expanded={isEstimateInfoOpen}
                                                aria-controls="estimate-explainer"
                                                className={`tap-target group inline-flex min-w-0 items-center gap-1.5 text-left text-sm ${isEstimateInfoOpen ? 'text-[var(--text)]' : muted} hover:text-[var(--text)]`}
                                                title={t('status.read_me')}
                                            >
                                                <span className="truncate">{t('status.estimate')}</span>
                                                <Info
                                                    size={13}
                                                    className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                                                />
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
                                                <Share size={14} strokeWidth={1.75} />
                                                {shareCopy.action}
                                            </button>
                                        </div>

                                        {/* What the number is, unfolded in place under the
                    title that asked. It used to open as a dialog. */}
                                        <div
                                            id="estimate-explainer"
                                            className="disclosure"
                                            data-open={isEstimateInfoOpen}
                                            {...(isEstimateInfoOpen ? {} : { inert: '' })}
                                        >
                                            <div className="disclosure-inner">
                                                <div className="pb-5 space-y-3 text-sm leading-relaxed text-[var(--text-muted)] max-w-prose">
                                                    <p>{t('modal.estimate.p1')}</p>
                                                    <p className="callout text-[var(--text)] font-medium">
                                                        {t('modal.estimate.p2')}
                                                    </p>
                                                    <p>{t('modal.estimate.p3')}</p>
                                                    <p className="text-xs">
                                                        {t('modal.estimate.source')}{' '}
                                                        <a
                                                            href="https://transfemscience.org"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[var(--accent-ink)] underline underline-offset-2"
                                                        >
                                                            transfemscience.org
                                                        </a>
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Readings. A grid rather than two flex columns so each row
                    lines up on its own: the labels share a baseline, and so do
                    the two numbers. The second reading always sits top right,
                    beside the first, rather than stacked under its scale, where
                    it took a whole block of the phone's first screen. At the
                    reading scale the pair needs about 320px at 40px and 450px
                    at 64px, so until the column (not the screen: from md the
                    sidebar takes its share) holds 32rem, which is every phone,
                    the second number is set smaller, and the first gives up a
                    little size too where the column is narrower than an
                    ordinary phone's. */}
                                        <div className="@container">
                                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1.5 @min-[32rem]:gap-x-6">
                                                {/* Beside a second reading in a phone's column the
                            number's line has no room left for the cats, and on
                            a line of their own under it they cost the height
                            the move freed. So there they sit up by the label. */}
                                                <div className="col-start-1 row-start-1 flex min-w-0 items-end gap-3">
                                                    <p className={`text-[0.8125rem] font-medium ${muted}`}>
                                                        {primary.label}
                                                    </p>
                                                    {companion && cats && (
                                                        <span className="-mb-1 flex @min-[32rem]:hidden">{cats}</span>
                                                    )}
                                                </div>

                                                {/* Number and unit sit in a slot wide enough for a
                            four-digit reading (two for the second column), so a
                            reading gaining a digit, or counting up from zero on
                            load, doesn't shove the cats or the other column about.
                            The status rides on the tick scale, which a screen
                            reader skips, so it is said here, after the unit. */}
                                                <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                                                    <span
                                                        className={`${readingSlot} ${companion ? pairedPrimarySize : fullSize}`}
                                                        style={{
                                                            minWidth: companion
                                                                ? undefined
                                                                : slotWidth(4, primary.decimals),
                                                        }}
                                                    >
                                                        {primary.value > 0 ? (
                                                            <>
                                                                <span className={on}>
                                                                    <AnimatedNumber
                                                                        value={primary.value}
                                                                        decimals={primary.decimals}
                                                                    />
                                                                </span>
                                                                <span
                                                                    className={`text-sm font-normal tracking-normal ${muted}`}
                                                                >
                                                                    {primary.unit}
                                                                </span>
                                                                {currentStatus && (
                                                                    <span className="sr-only">
                                                                        {t(currentStatus.label)}
                                                                    </span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className={dim}>--</span>
                                                        )}
                                                    </span>
                                                    {companion && cats ? (
                                                        <span className="hidden self-end @min-[32rem]:flex">
                                                            {cats}
                                                        </span>
                                                    ) : (
                                                        cats
                                                    )}
                                                </div>

                                                {/* The scale belongs to the first reading and runs the
                            full width under both. */}
                                                {primary.value > 0 && (
                                                    <div className="col-span-2 col-start-1 row-start-3 mt-0.5">
                                                        <LevelRail
                                                            value={primary.value}
                                                            band={primary.band}
                                                            domain={primary.domain}
                                                            label={currentStatus ? t(currentStatus.label) : undefined}
                                                            tone={currentStatus?.color}
                                                        />
                                                    </div>
                                                )}

                                                {companion && (
                                                    <>
                                                        {companion.label && (
                                                            <p
                                                                className={`col-start-2 row-start-1 text-right text-[0.8125rem] font-medium ${muted}`}
                                                            >
                                                                {companion.label}
                                                            </p>
                                                        )}
                                                        <span
                                                            className={`${readingSlot} ${companionSize} col-start-2 row-start-2 justify-end whitespace-nowrap`}
                                                            style={{ minWidth: slotWidth(2, companion.decimals) }}
                                                        >
                                                            {companion.value > 0 ? (
                                                                <>
                                                                    <span className={on}>
                                                                        <AnimatedNumber
                                                                            value={companion.value}
                                                                            decimals={companion.decimals}
                                                                        />
                                                                    </span>
                                                                    <span
                                                                        className={`text-sm font-normal tracking-normal ${muted}`}
                                                                    >
                                                                        {companion.unit}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <span className={dim}>--</span>
                                                            )}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}

                                {hasAdvisory && (
                                    <div className={hasReading ? 'mt-3' : ''}>
                                        <DoseAdvisoryNotice
                                            advisory={doseAdvisory}
                                            hormoneAdvisory={hormoneAdvisory}
                                            showCalibrate={showCalibrate}
                                            onCalibrate={onNavigateToLab}
                                            t={t}
                                        />
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
                                            const exactH = Date.now() / 3600000;
                                            const st = planStatus(item, events, exactH);
                                            const sentence =
                                                st.kind === 'taken'
                                                    ? 'plan.taken'
                                                    : st.kind === 'rest'
                                                      ? st.yesterday && item.everyDays === 2
                                                          ? 'plan.rest_yesterday'
                                                          : 'plan.rest'
                                                      : item.everyDays > 1
                                                        ? 'plan.due_interval'
                                                        : st.done > 0
                                                          ? 'plan.due_partial'
                                                          : 'plan.due';
                                            const label = planItemLabel(item, plan, t);
                                            const labelId = `${rowIdBase}-${item.id}`;
                                            const taken = st.kind === 'taken';
                                            // Once some of today's doses are in, the row opens the latest of
                                            // them in the dose form: a tap stamps "now", so a pill taken at
                                            // breakfast and tapped at night needs its time put right, and
                                            // after a reload the form is the way to take a tap back. Only
                                            // what the row opens changes; where today stands is still
                                            // worked out by calendar day, as above.
                                            const loggedToday =
                                                taken || (st.kind === 'due' && st.done > 0)
                                                    ? latestToday(item, exactH)
                                                    : null;
                                            // A rest day's button stays, since an injection day does
                                            // move, but it asks first: one stray tap there wrote a full
                                            // dose days early, and it shifts every estimate after it.
                                            const logDose = () => {
                                                if (st.kind !== 'rest') {
                                                    onLogPlanItem(item);
                                                    return;
                                                }
                                                showDialog(
                                                    'confirm',
                                                    fill(t('plan.early_confirm'), {
                                                        verb: t(`plan.verb.${item.route}`),
                                                        day: dueLabel(st.nextH, lang, false, nowH),
                                                    }),
                                                    () => onLogPlanItem(item),
                                                    { title: label, confirmLabel: t('home.empty_cta') },
                                                );
                                            };
                                            // The route's drawing heads the row, as it does on the Plan
                                            // page: an ampoule and a dissolving tablet tell estradiol
                                            // valerate from estradiol before either name is read. Asleep
                                            // on a rest day only; a row that is done is not "not yet",
                                            // and keeps its colour.
                                            const text = (
                                                <>
                                                    <Doodle name={item.route} size={1.75} asleep={st.kind === 'rest'} />
                                                    <span className="min-w-0">
                                                        <span
                                                            id={labelId}
                                                            className={`block break-words text-sm ${st.kind === 'due' ? on : muted}`}
                                                        >
                                                            {label}
                                                        </span>
                                                        <span
                                                            className={`block text-xs ${muted} ${loggedToday ? 'transition-colors group-hover:text-[var(--text)]' : ''}`}
                                                        >
                                                            {fillNodes(t(sentence), {
                                                                verb: t(`plan.verb.${item.route}`),
                                                                done: st.kind === 'due' ? st.done : 0,
                                                                total: st.kind === 'due' ? st.total : 0,
                                                                left: st.kind === 'due' ? st.total - st.done : 0,
                                                                day:
                                                                    st.kind === 'rest' ? (
                                                                        <span className="whitespace-nowrap">
                                                                            {dueLabel(st.nextH, lang, false, nowH)}
                                                                        </span>
                                                                    ) : null,
                                                            })}
                                                            {loggedToday && (
                                                                <span className="whitespace-nowrap">
                                                                    {'\u2060'}
                                                                    <ChevronRight
                                                                        size={13}
                                                                        aria-hidden="true"
                                                                        className="ms-0.5 inline-block align-[-2px] opacity-70 rtl:-scale-x-100"
                                                                    />
                                                                </span>
                                                            )}
                                                        </span>
                                                    </span>
                                                </>
                                            );
                                            return (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center justify-between gap-3 py-1.5"
                                                >
                                                    {loggedToday ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => onEditEvent(loggedToday)}
                                                            className="tap-target group flex min-w-0 items-center gap-3 text-start"
                                                        >
                                                            {text}
                                                            <span className="sr-only">
                                                                {t('modal.dose.edit_title')}
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        <div className="flex min-w-0 items-center gap-3">{text}</div>
                                                    )}
                                                    {/* Undo stays as long as a tap is on record, beside the next tap
                                        while more doses are due today and alone once they are all in.
                                        The tick shares the log button's place and is drawn on there
                                        when the last of today's doses goes in, so the slot answers
                                        the tap instead of going blank. Each button is described by
                                        the drug it logs: three rows read "Took it" three times. */}
                                                    <div className="-mr-2 flex shrink-0 items-center">
                                                        {undoableIds.includes(item.id) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => onUndoPlanLog(item.id)}
                                                                aria-describedby={labelId}
                                                                className={`${headerAction} ${muted} tap-target`}
                                                            >
                                                                {t('plan.undo')}
                                                            </button>
                                                        )}
                                                        <span className="grid items-center justify-items-end">
                                                            {!taken && (
                                                                <button
                                                                    type="button"
                                                                    onClick={logDose}
                                                                    aria-describedby={labelId}
                                                                    className={`${st.kind === 'due' ? headerActionAccent : `${headerAction} ${muted}`} tap-target col-start-1 row-start-1`}
                                                                >
                                                                    {t(`plan.done.${item.route}`)}
                                                                </button>
                                                            )}
                                                            <span className="pointer-events-none col-start-1 row-start-1 px-2.5">
                                                                <Tick on={taken} size={18} />
                                                            </span>
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {/* Each line leads to the stock it is about, so the medicine
                            running out can be recounted or restocked from where the
                            warning is read. It is the only sentence, so all of it keeps
                            the caution colour (see DoseAdvisory). Lines sit edge to edge,
                            so each is a full 44px tall itself rather than a .tap-target,
                            whose area would overlap the next. The chevron is held to the
                            last word (a word joiner, which Chrome ignores before an inline
                            SVG unless the two are kept from wrapping) so it never ends up
                            alone on a line. */}
                                        {lowSupplies.map(({ supply, remaining, runOutH }) => {
                                            const name = supplyLabel(supply, t);
                                            return (
                                                <button
                                                    key={supply.id}
                                                    type="button"
                                                    onClick={onNavigateToSupplies}
                                                    className="group block min-h-11 w-full py-2.5 text-start text-sm leading-relaxed text-[var(--warning)]"
                                                >
                                                    {remaining <= 0 || runOutH === null
                                                        ? fill(t('supplies.used_up'), { name })
                                                        : fillNodes(t('supplies.running_low'), {
                                                              name,
                                                              n: Math.max(0, Math.round((runOutH - nowH) / 24)),
                                                              date: (
                                                                  <span className="whitespace-nowrap">
                                                                      {dueLabel(runOutH, lang, false, nowH)}
                                                                  </span>
                                                              ),
                                                          })}
                                                    <span className="whitespace-nowrap">
                                                        {'\u2060'}
                                                        <ChevronRight
                                                            size={15}
                                                            aria-hidden="true"
                                                            className="ms-0.5 inline-block align-[-3px] opacity-60 transition-opacity group-hover:opacity-100 rtl:-scale-x-100"
                                                        />
                                                    </span>
                                                </button>
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
                            {events.length > 0 && (
                                <div
                                    aria-hidden="true"
                                    className="hidden 2xl:block 2xl:flex-1 2xl:min-w-[16rem] 2xl:max-w-[26rem]"
                                />
                            )}
                        </div>
                    </div>
                </header>
            )}

            {/* The chart column keeps its reading width; on a wide desktop the
                dose heatmap takes the space left over beside it rather than
                letting it sit empty, and drops underneath when there isn't any.
                Only widened once there's data — the empty state centres itself
                on this container and should stay in the narrow column. */}
            <main
                className={`w-full mx-auto max-w-2xl px-6 pt-5 pb-32 md:px-8 ${events.length ? '2xl:max-w-[74rem]' : ''}`}
            >
                {events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                        <DoseDoodle className="w-24 h-auto mb-6" />
                        <p className={`text-base font-semibold ${on} mb-1`}>{t('home.empty_title')}</p>
                        {/* Balanced, so short centred copy breaks evenly rather
                            than leaving one character alone on a second line. */}
                        <p className={`text-sm ${muted} mb-6 max-w-xs text-balance`}>{t('home.empty_subtitle')}</p>
                        {/* Logging a dose is the one thing this page is waiting
                            for, so it is the one terracotta button on it. */}
                        <button onClick={onNavigateToHistory} className="btn-primary">
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
