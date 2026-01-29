import React from 'react';
import { Activity, Settings, Plus } from 'lucide-react';
import { DoseEvent, SimulationResult, LabResult } from '../../logic';
import ResultChart from '../components/ResultChart';

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

    return (
        <>
            <header className="relative px-6 md:px-10 pt-8 pb-6">
                <div className="flex flex-col gap-6">


                    <div className="grid md:grid-cols-3 gap-4 md:gap-6">
                        {/* Main Estimate Card */}
                        <div className="md:col-span-2 bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 p-6 relative overflow-hidden flex flex-col justify-center h-full">
                            <div className="mb-8">
                                <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                                    {t('status.estimate')}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-10">
                                {/* E2 Display */}
                                <div className="space-y-1">
                                    <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                                        {t('label.e2')}
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        {currentLevel > 0 ? (
                                            <>
                                                <span className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-white tracking-tight">
                                                    {currentLevel.toFixed(0)}
                                                </span>
                                                <span className="text-sm font-bold text-zinc-400 mb-1">pg/mL</span>
                                            </>
                                        ) : (
                                            <span className="text-4xl md:text-5xl font-bold text-zinc-200 dark:text-zinc-800 tracking-tight">0</span>
                                        )}
                                    </div>
                                    {currentStatus && (
                                        <div className="flex items-center gap-2 mt-3">
                                            <div className={`w-1.5 h-1.5 rounded-full ${currentStatus.color.replace('text-', 'bg-')}`}></div>
                                            <span className={`text-xs font-semibold ${currentStatus.color}`}>
                                                {t(currentStatus.label)}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* CPA Display */}
                                <div className="space-y-1">
                                    <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                                        {t('label.cpa')}
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        {currentCPA > 0 ? (
                                            <>
                                                <span className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-white tracking-tight">
                                                    {currentCPA.toFixed(0)}
                                                </span>
                                                <span className="text-sm font-bold text-zinc-400 mb-1">ng/mL</span>
                                            </>
                                        ) : (
                                            <span className="text-4xl md:text-5xl font-bold text-zinc-200 dark:text-zinc-800 tracking-tight">--</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Side Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-1 gap-4 md:gap-6">
                            <div className="flex flex-col justify-center p-6 rounded-[24px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors h-full">
                                <div className="flex items-center gap-2 mb-2">
                                    <Activity size={14} className="text-zinc-400" />
                                    <p className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{t('timeline.title')}</p>
                                </div>
                                <p className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{events.length || 0}</p>
                            </div>

                            <button
                                onClick={() => setIsWeightModalOpen(true)}
                                className="flex flex-col justify-center p-6 rounded-[24px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors text-left group h-full"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <Settings size={14} className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
                                    <p className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{t('status.weight')}</p>
                                </div>
                                <p className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{weight} <span className="text-sm font-bold text-zinc-400">kg</span></p>
                            </button>
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
