import React from 'react';
import { Info, Share2 } from 'lucide-react';
import { DoseEvent, Ester, SimulationResult, LabResult, getDoseAdvisory, getHormoneLevelAdvisory, isT_LabUnit } from '../../logic';
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

interface HomeProps {
    t: (key: string) => string;
    currentLevel: number;
    currentCPA: number;
    currentT: number;
    currentStatus: { label: string, color: string, bg: string, border: string } | null;
    events: DoseEvent[];
    simulation: SimulationResult | null;
    labResults: LabResult[];
    onEditEvent: (e: DoseEvent) => void;
    calibrationFn: (timeH: number) => number;
    theme: AppTheme;
    onNavigateToHistory: () => void;
    onNavigateToLab: () => void;
    onNavigateToShare: () => void;
    authToken: string | null;
    onAuthRequired: () => void;
}

const Home: React.FC<HomeProps> = ({
    t,
    currentLevel,
    currentCPA,
    currentT,
    currentStatus,
    events,
    simulation,
    labResults,
    onEditEvent,
    calibrationFn,
    theme,
    onNavigateToHistory,
    onNavigateToLab,
    onNavigateToShare,
    authToken,
    onAuthRequired,
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
    const hormoneAdvisory = React.useMemo(() => getHormoneLevelAdvisory(labResults), [labResults]);
    const hasLabForMode = labResults.some(l => (isTransmasc ? isT_LabUnit(l.unit) : !isT_LabUnit(l.unit)));
    const showCalibrate = events.length > 0 && !hasLabForMode;

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

    const on = "text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]";
    const muted = "text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]";
    const dim = "text-[var(--color-m3-outline-variant)] dark:text-[var(--color-m3-dark-outline-variant)]";

    // A reading's number and unit. The slot carries the number's type size, so
    // `ch` in its min-width is one tabular digit at whatever size the breakpoint
    // picked; the rem part covers the gap and the unit after it.
    const readingSlot = "inline-flex items-baseline gap-x-2 text-4xl sm:text-5xl md:text-6xl font-light leading-none tracking-tight tabular-nums";
    const slotWidth = (intDigits: number, decimals: number) =>
        `calc(${intDigits + decimals + (decimals ? 0.35 : 0)}ch + 3.25rem)`;

    // The reading the page is about, with the band the chart shades for it.
    // Rail ends sit a decade either side of the band, which is where readings
    // actually land; anything past them pins to the end.
    const primary = isTransmasc
        ? { label: t('label.total_t'), value: currentT, decimals: 0, unit: 'ng/dl', band: { low: 300, high: 1000 }, domain: [30, 3000] as [number, number] }
        : { label: t('label.e2'), value: currentLevel, decimals: 1, unit: 'pg/ml', band: { low: 100, high: 200 }, domain: [10, 1000] as [number, number] };

    // The second reading, flush right at the same size as the first. Only shown
    // once there is something to show: a permanent "CPA --" for anyone not
    // taking it was just noise. For transmasc it's the same total T, in nmol/L.
    const hasCPA = !isTransmasc && events.some(e => e.ester === Ester.CPA);
    const companion = isTransmasc
        ? (currentT > 0 ? { label: '', value: currentT / 28.842, decimals: 1, unit: 'nmol/l' } : null)
        : (hasCPA ? { label: t('label.cpa_chart'), value: currentCPA, decimals: 1, unit: 'ng/ml' } : null);

    return (
        <>
            <EstimateInfoModal isOpen={isEstimateInfoOpen} onClose={() => setIsEstimateInfoOpen(false)} />

            {/* Header and body share one column, centred in the pane. Pinned
                to the left, the readings and chart filled a phone's width of a
                desktop window while the header rule ran the full width under
                them, and the page leaned left. The column widens with the body
                once the heatmap sits beside the chart, so the two readings
                stay over the content they describe. */}
            <header className="pt-6 pb-5 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                <div className={`mx-auto px-6 md:px-8 max-w-2xl ${events.length ? '2xl:max-w-[74rem]' : ''}`}>
                {/* Title row. The whole title opens the explainer, not just
                    the 13px icon after it. */}
                <div className="flex items-center justify-between gap-3 mb-4">
                    <button
                        type="button"
                        onClick={() => setIsEstimateInfoOpen(true)}
                        className={`group inline-flex min-w-0 items-center gap-1.5 text-left text-sm ${muted} hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)]`}
                        title={t('status.read_me')}
                    >
                        <span className="truncate">{t('status.estimate')}</span>
                        <Info size={13} className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
                    </button>
                    <button
                        type="button"
                        disabled={!events.length}
                        onClick={() => {
                            if (!authToken) {
                                onAuthRequired();
                                return;
                            }
                            onNavigateToShare();
                        }}
                        className={`${muted} inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 -mr-2 text-xs font-medium hover:text-[var(--color-m3-on-surface)] hover:bg-[var(--color-m3-surface-container)] dark:hover:text-[var(--color-m3-dark-on-surface)] dark:hover:bg-[var(--color-m3-dark-surface-container)] disabled:cursor-not-allowed disabled:opacity-40`}
                        title={events.length ? shareCopy.modalDescription : shareCopy.noData}
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
                        load, doesn't shove the cats or the other column about. */}
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className={readingSlot} style={{ minWidth: slotWidth(4, primary.decimals) }}>
                            {primary.value > 0 ? (
                                <>
                                    <span className={on}><AnimatedNumber value={primary.value} decimals={primary.decimals} /></span>
                                    <span className={`text-sm font-normal tracking-normal ${muted}`}>{primary.unit}</span>
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
                </div>

                {primary.value > 0 && (
                    <div className="mt-2">
                        <LevelRail
                            value={primary.value}
                            band={primary.band}
                            domain={primary.domain}
                            label={currentStatus ? t(currentStatus.label) : undefined}
                            tone={currentStatus?.color}
                        />
                    </div>
                )}

                <div className="mt-3 empty:hidden">
                    <DoseAdvisoryNotice advisory={doseAdvisory} hormoneAdvisory={hormoneAdvisory} showCalibrate={showCalibrate} onCalibrate={onNavigateToLab} t={t} />
                </div>
                </div>
            </header>

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
                        <button
                            onClick={onNavigateToHistory}
                            className="btn-secondary"
                        >
                            {t('home.empty_cta')}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-8 2xl:flex-row 2xl:items-start 2xl:gap-10">
                        <div className="min-w-0 2xl:flex-1 2xl:max-w-2xl">
                            <ResultChart
                                sim={simulation}
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
            </main>
        </>
    );
};

export default Home;
