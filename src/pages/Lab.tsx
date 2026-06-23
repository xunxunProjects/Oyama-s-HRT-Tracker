import React, { useState } from 'react';
import { Plus } from 'lucide-react';
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
    const [editingLabId, setEditingLabId] = useState<string | null>(null);

    return (
        <div className="relative pb-32">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-8 pt-8 pb-4 flex items-center justify-between">
                <h1 className="text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                    {t('lab.title')}
                </h1>
                <button
                    onClick={() => setIsQuickAddLabOpen(!isQuickAddLabOpen)}
                    className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] px-2 py-1 -mr-2 rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                >
                    <Plus size={15} className={`transition-transform ${isQuickAddLabOpen ? 'rotate-45' : ''}`} />
                    <span>{isQuickAddLabOpen ? t('btn.cancel') : t('lab.add_title')}</span>
                </button>
            </div>

            {/* Expandable add form */}
            <div className={`grid ${isQuickAddLabOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="px-6 md:px-8 mb-6">
                        <LabResultForm
                            resultToEdit={null}
                            onSave={(res) => {
                                onSaveLabResult(res);
                                setIsQuickAddLabOpen(false);
                            }}
                            onCancel={() => setIsQuickAddLabOpen(false)}
                            onDelete={() => {}}
                            isInline={true}
                        />
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="px-6 md:px-8">
                {labResults.length === 0 ? (
                    <div className="py-20 text-center text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                        <p className="text-sm">{t('lab.empty')}</p>
                    </div>
                ) : (
                    <div>
                        {labResults
                            .slice()
                            .sort((a, b) => b.timeH - a.timeH)
                            .map(res => {
                                const d = new Date(res.timeH * 3600000);
                                const isEditing = editingLabId === res.id;
                                return (
                                    <div key={res.id} className="border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] last:border-b-0">
                                        <div
                                            className={`py-3.5 flex items-start gap-3 cursor-pointer -mx-2 px-2 rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] ${isEditing ? 'bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]' : ''}`}
                                            onClick={() => setEditingLabId(isEditing ? null : res.id)}
                                        >
                                            <div className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--color-m3-primary)]" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-medium text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">
                                                        {res.concValue} {res.unit}
                                                    </span>
                                                    <span className="text-xs tabular-nums text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0">
                                                        {formatTime(d)}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                                    {formatDate(d, lang)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`grid ${isEditing ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                            <div className="overflow-hidden">
                                                <div className="pb-4 pt-1">
                                                    <LabResultForm
                                                        resultToEdit={res}
                                                        onSave={(updated) => {
                                                            onSaveLabResult(updated);
                                                            setEditingLabId(null);
                                                        }}
                                                        onCancel={() => setEditingLabId(null)}
                                                        onDelete={(id) => {
                                                            onDeleteLabResult(id);
                                                            setEditingLabId(null);
                                                        }}
                                                        isInline={true}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                )}

                {/* Calibration factor + clear */}
                <div className="flex items-center justify-between py-4 mt-2 border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                    <p className="text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                        {t('lab.tip_scale')} <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] font-semibold">×{calibrationFn(currentTime.getTime() / 3600000).toFixed(2)}</span>
                    </p>
                    <button
                        onClick={onClearLabResults}
                        disabled={!labResults.length}
                        className={`text-sm font-medium ${labResults.length
                            ? 'text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300'
                            : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] opacity-40 cursor-not-allowed'
                        }`}
                    >
                        {t('lab.clear_all')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Lab;
