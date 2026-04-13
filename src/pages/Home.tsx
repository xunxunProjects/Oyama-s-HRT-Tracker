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
            <header className="relative px-4 md:px-8 pt-4 md:pt-6 pb-2">
                <div className="flex flex-col gap-4">

                    {/* Main Estimate Card - Flat Design */}
                    <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg p-4 md:p-5 flex flex-col justify-between">

                        {/* Status Header */}
                        <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400 leading-tight">
                                    {t('status.estimate')}
                                </span>
                                <button
                                    onClick={() => setIsEstimateInfoOpen(true)}
                                    className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs transition-colors shrink-0"
                                    title={t('status.read_me')}
                                >
                                    <Info size={13} />
                                    <span className="hidden sm:inline">{t('status.read_me')}</span>
                                </button>
                            </div>
                            {currentStatus && (
                                <div className={`text-[11px] leading-tight text-left sm:text-right font-medium sm:max-w-[8.5rem] ${currentStatus.color}`}>
                                    {t(currentStatus.label)}
                                </div>
                            )}
                        </div>

                        {/* Blood Levels Grid */}
                        <div className="grid grid-cols-2 gap-4 uppercase tracking-wide">
                            {/* E2 Display */}
                            <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-500 mb-1.5">
                                    {t('label.e2')}
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                    {currentLevel > 0 ? (
                                        <>
                                            <span className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-100">
                                                {currentLevel.toFixed(0)}
                                            </span>
                                            <span className="text-xs text-gray-400 dark:text-gray-500 lowercase">pg/ml</span>
                                        </>
                                    ) : (
                                        <span className="text-4xl md:text-5xl font-light text-gray-300 dark:text-gray-700">0</span>
                                    )}
                                </div>
                            </div>

                            {/* CPA Display */}
                            <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-500 mb-1.5">
                                    {t('label.cpa')}
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                    {currentCPA > 0 ? (
                                        <>
                                            <span className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-100">
                                                {currentCPA.toFixed(0)}
                                            </span>
                                            <span className="text-xs text-gray-400 dark:text-gray-500 lowercase">ng/ml</span>
                                        </>
                                    ) : (
                                        <span className="text-4xl md:text-5xl font-light text-gray-300 dark:text-gray-700">--</span>
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
