import React from 'react';
import { Droplet, Pill, Info } from 'lucide-react';
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

                    {/* Main Estimate Card */}
                    <div className="bg-white dark:bg-zinc-900 rounded-[24px] md:rounded-[32px] border border-zinc-100 dark:border-zinc-800 p-5 md:p-6 flex flex-col justify-between h-full hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors duration-500 overflow-hidden">

                        {/* Status Header */}
                        <div className="mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-zinc-400 dark:text-zinc-500">
                                    {t('status.estimate')}
                                </span>
                                <button
                                    onClick={() => setIsEstimateInfoOpen(true)}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                >
                                    <Info size={12} strokeWidth={2.5} />
                                    {t('status.read_me')}
                                </button>
                            </div>
                            {currentStatus && (
                                <div className={`px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1.5 ${currentStatus.bg} ${currentStatus.color}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${currentStatus.color.replace('text-', 'bg-')}`} />
                                    {t(currentStatus.label)}
                                </div>
                            )}
                        </div>

                        {/* Top Row: Blood Levels */}
                        <div className="grid grid-cols-2 gap-6 md:gap-8 relative">
                            {/* Vertical Divider */}
                            <div className="absolute top-1 bottom-1 left-1/2 w-px bg-zinc-100 dark:bg-zinc-800 -translate-x-1/2 hidden md:block" />

                            {/* E2 Display */}
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                                    <div className="p-1 bg-pink-50 dark:bg-pink-900/20 rounded-md text-pink-500 dark:text-pink-400">
                                        <Droplet size={14} fill="currentColor" className="opacity-20 translate-y-[1px]" />
                                        <Droplet size={14} className="absolute top-1 left-1" />
                                    </div>
                                    <span className="font-bold text-xs md:text-sm tracking-tight">{t('label.e2')}</span>
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                    {currentLevel > 0 ? (
                                        <>
                                            <span className="text-3xl md:text-5xl font-bold text-zinc-900 dark:text-white tracking-tighter">
                                                {currentLevel.toFixed(0)}
                                            </span>
                                            <span className="text-xs md:text-sm font-medium text-zinc-400 mb-0.5">pg/mL</span>
                                        </>
                                    ) : (
                                        <span className="text-3xl md:text-5xl font-bold text-zinc-200 dark:text-zinc-800 tracking-tighter">0</span>
                                    )}
                                </div>
                            </div>

                            {/* CPA Display */}
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                                    <div className="p-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-md text-indigo-500 dark:text-indigo-400">
                                        <Pill size={14} />
                                    </div>
                                    <span className="font-bold text-xs md:text-sm tracking-tight">{t('label.cpa')}</span>
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                    {currentCPA > 0 ? (
                                        <>
                                            <span className="text-3xl md:text-5xl font-bold text-zinc-900 dark:text-white tracking-tighter">
                                                {currentCPA.toFixed(0)}
                                            </span>
                                            <span className="text-xs md:text-sm font-medium text-zinc-400 mb-0.5">ng/mL</span>
                                        </>
                                    ) : (
                                        <span className="text-3xl md:text-5xl font-bold text-zinc-200 dark:text-zinc-800 tracking-tighter">--</span>
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
