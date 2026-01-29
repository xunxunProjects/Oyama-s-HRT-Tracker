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
                <div className="w-full p-5 rounded-[24px] bg-white dark:bg-zinc-900 flex items-center justify-between border border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
                        <FlaskConical size={24} className="text-teal-500" /> {t('lab.title')}
                    </h2>
                    <button
                        onClick={() => setIsQuickAddLabOpen(!isQuickAddLabOpen)}
                        className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-white dark:text-zinc-900 shadow-md transition-all ${isQuickAddLabOpen ? 'bg-zinc-500 dark:bg-zinc-400 rotate-45' : 'bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white'}`}
                    >
                        <Plus size={20} />
                    </button>
                </div>
            </div>

            {isQuickAddLabOpen && (
                <div className="mx-6 md:mx-10 mb-6 animate-in slide-in-from-top-4 fade-in duration-300">
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
                <div className="mx-6 md:mx-10 text-center py-20 text-zinc-400 dark:text-zinc-600 bg-white dark:bg-zinc-900 rounded-[24px] border border-dashed border-zinc-200 dark:border-zinc-800 transition-colors">
                    <p className="font-medium">{t('lab.empty')}</p>
                </div>
            ) : (
                <div className="mx-6 md:mx-10 bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50 overflow-hidden transition-colors duration-300">
                    {labResults
                        .slice()
                        .sort((a, b) => b.timeH - a.timeH)
                        .map(res => {
                            const d = new Date(res.timeH * 3600000);
                            return (
                                <div
                                    key={res.id}
                                    className="p-5 flex items-center gap-5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-all cursor-pointer group relative"
                                    onClick={() => onEditLabResult(res)}
                                >
                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-teal-50 dark:bg-teal-900/10 border border-teal-100 dark:border-teal-900/20 group-hover:scale-105 transition-transform duration-300">
                                        <FlaskConical className="text-teal-500 dark:text-teal-400" size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-zinc-900 dark:text-white text-sm truncate">
                                                {res.concValue} {res.unit}
                                            </span>
                                            <span className="font-mono text-[10px] font-bold text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 px-2 py-1 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                                {formatTime(d)}
                                            </span>
                                        </div>
                                        <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                                            {formatDate(d, lang)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                </div>
            )}

            <div className="mx-6 md:mx-10 bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-6 py-4 transition-colors duration-300">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    {t('lab.tip_scale')} <span className="text-zinc-900 dark:text-white font-bold">×{calibrationFn(currentTime.getTime() / 3600000).toFixed(2)}</span>
                </div>
                <button
                    onClick={onClearLabResults}
                    disabled={!labResults.length}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition ${labResults.length ? 'text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40' : 'text-zinc-300 dark:text-zinc-600 bg-zinc-50 dark:bg-zinc-800 cursor-not-allowed'
                        }`}
                >
                    {t('lab.clear_all')}
                </button>
            </div>
        </div>
    );
};

export default Lab;
