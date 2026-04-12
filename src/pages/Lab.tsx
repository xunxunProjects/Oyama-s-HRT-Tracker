import React from 'react';
import { FlaskConical, Plus } from 'lucide-react';
import { LabResult } from '../../logic';
import { Lang } from '../i18n/translations';
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
    lang: Lang;
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
            <div className="px-6 md:px-8">
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg flex items-center justify-between p-4 mb-6">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg">
                            <FlaskConical size={20} />
                        </div>
                        {t('lab.title')}
                    </h2>
                    <button
                        onClick={() => setIsQuickAddLabOpen(!isQuickAddLabOpen)}
                        className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${isQuickAddLabOpen
                            ? 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300 rotate-45'
                            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                            }`}
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </div>

            {isQuickAddLabOpen && (
                <div className="mx-6 md:mx-8 mb-6">
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
                <div className="mx-6 md:mx-8 text-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-neutral-900 rounded-lg border border-dashed border-gray-300 dark:border-neutral-700">
                    <p className="text-sm font-medium">{t('lab.empty')}</p>
                </div>
            ) : (
                <div className="mx-6 md:mx-8 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800 overflow-hidden text-sm">
                    {labResults
                        .slice()
                        .sort((a, b) => b.timeH - a.timeH)
                        .map(res => {
                            const d = new Date(res.timeH * 3600000);
                            return (
                                <div
                                    key={res.id}
                                    className="p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer group"
                                    onClick={() => onEditLabResult(res)}
                                >
                                    <div className="w-10 h-10 rounded flex items-center justify-center shrink-0 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400">
                                        <FlaskConical size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                                {res.concValue} {res.unit}
                                            </span>
                                            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                                                {formatTime(d)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                            {formatDate(d, lang)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                </div>
            )}

            <div className="mx-6 md:mx-8 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 flex items-center justify-between px-5 py-4">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    {t('lab.tip_scale')} <span className="text-gray-900 dark:text-gray-100 font-semibold">×{calibrationFn(currentTime.getTime() / 3600000).toFixed(2)}</span>
                </div>
                <button
                    onClick={onClearLabResults}
                    disabled={!labResults.length}
                    className={`px-3 py-1.5 rounded text-xs transition-colors ${labResults.length
                        ? 'text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40'
                        : 'text-gray-400 bg-gray-100 dark:bg-neutral-800 cursor-not-allowed'
                        }`}
                >
                    {t('lab.clear_all')}
                </button>
            </div>
        </div>
    );
};

export default Lab;
