import React from 'react';
import { FlaskConical, Plus } from 'lucide-react';
import { LabResult } from '../../logic';
import { formatDate, formatTime } from '../utils/helpers';
import LabResultForm from '../components/LabResultForm';

interface LabProps {
    t: (key: string) => string;
    isQuickAddLabOpen: boolean;
    setIsQuickAddLabOpen: (isOpen: boolean) => void;
    labResults: LabResult[];
    onSaveLabResult: (res: LabResult) => void;
    onDeleteLabResult: (id: string) => void;
    onEditLabResult: (res: LabResult) => void;
    onClearLabResults: () => void;
    calibrationFn: (timeH: number) => number;
    currentTime: Date;
    lang: string;
}

const Lab: React.FC<LabProps> = ({
    t,
    isQuickAddLabOpen,
    setIsQuickAddLabOpen,
    labResults,
    onSaveLabResult,
    onDeleteLabResult,
    onEditLabResult,
    onClearLabResults,
    calibrationFn,
    currentTime,
    lang
}) => {
    return (
        <div className="relative space-y-6 pt-6 pb-24">
            <div className="px-6 md:px-10">
                <div className="w-full p-3.5 rounded-[var(--radius-xl)] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] flex items-center justify-between border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] shadow-[var(--shadow-m3-1)] transition-all duration-300 m3-surface-tint">
                    <h2 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tight flex items-center gap-2.5">
                        <div className="p-1.5 bg-[var(--color-m3-primary-container)] dark:bg-teal-900/20 rounded-[var(--radius-md)]">
                            <FlaskConical size={18} className="text-[var(--color-m3-primary)] dark:text-teal-400" />
                        </div>
                        {t('lab.title')}
                    </h2>
                    <button
                        onClick={() => setIsQuickAddLabOpen(!isQuickAddLabOpen)}
                        className={`inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius-lg)] shadow-[var(--shadow-m3-1)] transition-all duration-500 m3-state-layer ${isQuickAddLabOpen
                            ? 'bg-[var(--color-m3-surface-container-highest)] dark:bg-[var(--color-m3-dark-surface-container-highest)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] rotate-45'
                            : 'bg-[var(--color-m3-primary-container)] dark:bg-teal-900/40 text-[var(--color-m3-primary)] dark:text-teal-400 hover:shadow-[var(--shadow-m3-2)]'
                            }`}
                    >
                        <Plus size={18} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {isQuickAddLabOpen && (
                <div className="mx-6 md:mx-10 mb-6 animate-m3-container">
                    <LabResultForm
                        resultToEdit={null}
                        onSave={(res) => {
                            onSaveLabResult(res);
                            setIsQuickAddLabOpen(false);
                        }}
                        onCancel={() => setIsQuickAddLabOpen(false)}
                        onDelete={() => { }}
                        isInline={true}
                    />
                </div>
            )}

            {labResults.length === 0 ? (
                <div className="mx-6 md:mx-10 text-center py-20 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] border border-dashed border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] transition-colors">
                    <p className="font-semibold">{t('lab.empty')}</p>
                </div>
            ) : (
                <div className="mx-6 md:mx-10 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] divide-y divide-[var(--color-m3-surface-container)] dark:divide-[var(--color-m3-dark-surface-container-high)]/50 overflow-hidden transition-colors duration-300">
                    {labResults
                        .slice()
                        .sort((a, b) => b.timeH - a.timeH)
                        .map(res => {
                            const d = new Date(res.timeH * 3600000);
                            return (
                                <div
                                    key={res.id}
                                    className="p-5 flex items-center gap-5 hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]/40 transition-all cursor-pointer group relative"
                                    onClick={() => onEditLabResult(res)}
                                >
                                    <div className="w-12 h-12 rounded-[var(--radius-lg)] flex items-center justify-center shrink-0 bg-[var(--color-m3-primary-container)] dark:bg-teal-900/10 border border-[var(--color-m3-outline-variant)] dark:border-teal-900/20 group-hover:scale-105 transition-transform duration-300">
                                        <FlaskConical className="text-[var(--color-m3-primary)] dark:text-teal-400" size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm truncate">
                                                {res.concValue} {res.unit}
                                            </span>
                                            <span className="font-mono text-[10px] font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)]/50 px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                                                {formatTime(d)}
                                            </span>
                                        </div>
                                        <div className="text-[10px] font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">
                                            {formatDate(d, lang)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                </div>
            )}

            <div className="mx-6 md:mx-10 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] flex items-center justify-between px-6 py-4 transition-colors duration-300">
                <div className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] font-medium">
                    {t('lab.tip_scale')} <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] font-bold">×{calibrationFn(currentTime.getTime() / 3600000).toFixed(2)}</span>
                </div>
                <button
                    onClick={onClearLabResults}
                    disabled={!labResults.length}
                    className={`px-4 py-2 rounded-[var(--radius-full)] text-xs font-bold transition-all ${labResults.length
                        ? 'text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40'
                        : 'text-[var(--color-m3-outline)] dark:text-[var(--color-m3-dark-outline)] bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] cursor-not-allowed'
                        }`}
                >
                    {t('lab.clear_all')}
                </button>
            </div>
        </div>
    );
};

export default Lab;
