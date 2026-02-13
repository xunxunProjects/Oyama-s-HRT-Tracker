import React from 'react';
import { Info } from 'lucide-react';
import { DoseEvent, SimulationResult, LabResult } from '../../logic';
import ResultChart from '../components/ResultChart';
import EstimateInfoModal from '../components/EstimateInfoModal';

interface HomeProps {
    t: (key: string) => string;
    currentLevel: number;
    currentCPA: number;
    currentStatus: { label: string, color: string, bg: string, border: string } | null;
    events: DoseEvent[];
    weight: number;
    setIsWeightModalOpen: (isOpen: boolean) => void;
    simulation: SimulationResult | null;
    labResults: LabResult[];
    onEditEvent: (e: DoseEvent) => void;
    calibrationFn: (timeH: number) => number;
    theme: 'light' | 'dark' | 'system';
}

const Home: React.FC<HomeProps> = ({
    t,
    currentLevel,
    currentCPA,
    currentStatus,
    events,
    weight,
    setIsWeightModalOpen,
    simulation,
    labResults,
    onEditEvent,
    calibrationFn,
    theme
}) => {
    const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const [isEstimateInfoOpen, setIsEstimateInfoOpen] = React.useState(false);

    return (
        <>
            <EstimateInfoModal isOpen={isEstimateInfoOpen} onClose={() => setIsEstimateInfoOpen(false)} />
            <header className="relative px-4 md:px-10 pt-4 md:pt-6 pb-2">
                <div className="flex flex-col gap-4">

                    {/* Main Estimate Card — M3 Elevated Card */}
                    <div className="bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] p-5 md:p-6 flex flex-col justify-between h-full transition-all duration-500 overflow-hidden m3-surface-tint">

                        {/* Status Header */}
                        <div className="mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="font-display text-sm font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                    {t('status.estimate')}
                                </span>
                                <button
                                    onClick={() => setIsEstimateInfoOpen(true)}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-full)] bg-[var(--color-m3-accent-container)] dark:bg-rose-900/20 text-[var(--color-m3-on-accent-container)] dark:text-rose-400 text-xs font-bold transition-all m3-state-layer"
                                >
                                    <Info size={12} strokeWidth={2.5} />
                                    {t('status.read_me')}
                                </button>
                            </div>
                            {currentStatus && (
                                <div className={`px-3 py-1.5 rounded-[var(--radius-full)] text-[10px] md:text-xs font-bold flex items-center gap-1.5 ${currentStatus.bg} ${currentStatus.color}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${currentStatus.color.replace('text-', 'bg-')}`} />
                                    {t(currentStatus.label)}
                                </div>
                            )}
                        </div>

                        {/* Blood Levels Grid */}
                        <div className="grid grid-cols-2 gap-6 md:gap-8 relative">
                            {/* Vertical Divider */}
                            <div className="absolute top-1 bottom-1 left-1/2 w-px bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)] -translate-x-1/2 hidden md:block" />

                            {/* E2 Display */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                    <div className="w-3 h-3 rounded-full bg-[#f472b6] shadow-sm" />
                                    <span className="font-display font-bold text-xs md:text-sm tracking-tight">{t('label.e2')}</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    {currentLevel > 0 ? (
                                        <>
                                            <span className="font-display text-3xl md:text-5xl font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tighter">
                                                {currentLevel.toFixed(0)}
                                            </span>
                                            <span className="text-xs md:text-sm font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-0.5">pg/mL</span>
                                        </>
                                    ) : (
                                        <span className="font-display text-3xl md:text-5xl font-bold text-[var(--color-m3-outline-variant)] dark:text-[var(--color-m3-dark-outline-variant)] tracking-tighter">0</span>
                                    )}
                                </div>
                            </div>

                            {/* CPA Display */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                    <div className="w-3 h-3 rounded-full bg-[#8b5cf6] shadow-sm" />
                                    <span className="font-display font-bold text-xs md:text-sm tracking-tight">{t('label.cpa')}</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    {currentCPA > 0 ? (
                                        <>
                                            <span className="font-display text-3xl md:text-5xl font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tighter">
                                                {currentCPA.toFixed(0)}
                                            </span>
                                            <span className="text-xs md:text-sm font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-0.5">ng/mL</span>
                                        </>
                                    ) : (
                                        <span className="font-display text-3xl md:text-5xl font-bold text-[var(--color-m3-outline-variant)] dark:text-[var(--color-m3-dark-outline-variant)] tracking-tighter">--</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="w-full px-4 py-6 md:px-8 md:py-8 pb-32 md:pb-8">
                <ResultChart
                    sim={simulation}
                    events={events}
                    onPointClick={onEditEvent}
                    labResults={labResults}
                    calibrationFn={calibrationFn}
                    isDarkMode={isDarkMode}
                />
            </main>
        </>
    );
};

export default Home;
