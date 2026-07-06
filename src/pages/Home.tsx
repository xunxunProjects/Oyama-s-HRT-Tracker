import React from 'react';
import { Info } from 'lucide-react';
import { DoseEvent, SimulationResult, LabResult, getDoseAdvisory, isT_LabUnit } from '../../logic';
import ResultChart from '../components/ResultChart';
import EstimateInfoModal from '../components/EstimateInfoModal';
import DoseAdvisoryNotice from '../components/DoseAdvisory';
import AnimatedNumber from '../components/AnimatedNumber';
import { useHRTMode } from '../contexts/HRTModeContext';
import { AppTheme } from '../constants';

interface HomeProps {
    t: (key: string) => string;
    currentLevel: number;
    currentCPA: number;
    currentT: number;
    currentStatus: { label: string, color: string, bg: string, border: string } | null;
    events: DoseEvent[];
    weight: number;
    setIsWeightModalOpen: (isOpen: boolean) => void;
    simulation: SimulationResult | null;
    labResults: LabResult[];
    onEditEvent: (e: DoseEvent) => void;
    calibrationFn: (timeH: number) => number;
    theme: AppTheme;
    onNavigateToHistory: () => void;
    onNavigateToLab: () => void;
}

const Home: React.FC<HomeProps> = ({
    t,
    currentLevel,
    currentCPA,
    currentT,
    currentStatus,
    events,
    weight,
    setIsWeightModalOpen,
    simulation,
    labResults,
    onEditEvent,
    calibrationFn,
    theme,
    onNavigateToHistory,
    onNavigateToLab,
}) => {
    const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const isMono = theme === 'mono';
    const [isEstimateInfoOpen, setIsEstimateInfoOpen] = React.useState(false);
    const { isTransmasc } = useHRTMode();

    // Warn on how much medication was actually logged (a hard fact), and nudge
    // toward calibration when there's no lab yet to anchor the estimate.
    const doseAdvisory = React.useMemo(() => getDoseAdvisory(events), [events]);
    const hasLabForMode = labResults.some(l => (isTransmasc ? isT_LabUnit(l.unit) : !isT_LabUnit(l.unit)));
    const showCalibrate = events.length > 0 && !hasLabForMode;

    const on = "text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]";
    const muted = "text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]";
    const dim = "text-[var(--color-m3-outline-variant)] dark:text-[var(--color-m3-dark-outline-variant)]";

    return (
        <>
            <EstimateInfoModal isOpen={isEstimateInfoOpen} onClose={() => setIsEstimateInfoOpen(false)} />

            <header className="pt-6 pb-4 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                <div className="px-6 md:px-8 max-w-2xl">
                {/* Title row */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-1.5">
                        <span className={`text-sm ${muted}`}>{t('status.estimate')}</span>
                        <button
                            onClick={() => setIsEstimateInfoOpen(true)}
                            className={`${muted} hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)]`}
                            title={t('status.read_me')}
                        >
                            <Info size={13} />
                        </button>
                    </div>
                    {currentStatus && (
                        <span className={`text-xs font-medium ${currentStatus.color}`}>
                            {t(currentStatus.label)}
                        </span>
                    )}
                </div>

                {/* Blood level grid — first reading left, second flush right */}
                <div className="flex items-start justify-between gap-12">
                    {isTransmasc ? (
                        <>
                            <div>
                                <p className={`text-xs font-semibold uppercase tracking-wide ${muted} mb-2`}>
                                    {t('label.total_t')} <span className="lowercase normal-case opacity-60">(ng/dL)</span>
                                </p>
                                <div className="flex items-baseline gap-1.5">
                                    {currentT > 0 ? (
                                        <>
                                            <span className={`text-4xl md:text-5xl font-light tabular-nums ${on}`}><AnimatedNumber value={currentT} decimals={0} /></span>
                                            <span className={`text-xs lowercase ${muted}`}>ng/dl</span>
                                        </>
                                    ) : (
                                        <span className={`text-4xl md:text-5xl font-light ${dim}`}>--</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`text-xs font-semibold uppercase tracking-wide ${muted} mb-2`}>
                                    {t('label.total_t')} <span className="lowercase normal-case opacity-60">(nmol/L)</span>
                                </p>
                                <div className="flex items-baseline gap-1.5 justify-end">
                                    {currentT > 0 ? (
                                        <>
                                            <span className={`text-4xl md:text-5xl font-light tabular-nums ${on}`}><AnimatedNumber value={currentT / 28.842} decimals={1} /></span>
                                            <span className={`text-xs lowercase ${muted}`}>nmol/l</span>
                                        </>
                                    ) : (
                                        <span className={`text-4xl md:text-5xl font-light ${dim}`}>--</span>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <p className={`text-xs font-semibold uppercase tracking-wide ${muted} mb-2`}>{t('label.e2')}</p>
                                <div className="flex items-baseline gap-1.5">
                                    {currentLevel > 0 ? (
                                        <>
                                            <span className={`text-4xl md:text-5xl font-light tabular-nums ${on}`}><AnimatedNumber value={currentLevel} decimals={1} /></span>
                                            <span className={`text-xs lowercase ${muted}`}>pg/ml</span>
                                        </>
                                    ) : (
                                        <span className={`text-4xl md:text-5xl font-light ${dim}`}>--</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`text-xs font-semibold uppercase tracking-wide ${muted} mb-2`}>{t('label.cpa_chart')}</p>
                                <div className="flex items-baseline gap-1.5 justify-end">
                                    {currentCPA > 0 ? (
                                        <>
                                            <span className={`text-4xl md:text-5xl font-light tabular-nums ${on}`}><AnimatedNumber value={currentCPA} decimals={1} /></span>
                                            <span className={`text-xs lowercase ${muted}`}>ng/ml</span>
                                        </>
                                    ) : (
                                        <span className={`text-4xl md:text-5xl font-light ${dim}`}>--</span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-2">
                    <DoseAdvisoryNotice advisory={doseAdvisory} showCalibrate={showCalibrate} onCalibrate={onNavigateToLab} t={t} />
                </div>
                </div>
            </header>

            <main className="w-full max-w-2xl px-6 pt-5 pb-32 md:px-8">
                {events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
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
                    <ResultChart
                        sim={simulation}
                        events={events}
                        onPointClick={onEditEvent}
                        labResults={labResults}
                        calibrationFn={calibrationFn}
                        isDarkMode={isDarkMode}
                        isMono={isMono}
                    />
                )}
            </main>
        </>
    );
};

export default Home;
