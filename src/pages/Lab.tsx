import React, { useState, useMemo } from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import { LabResult, CalibrationMethod, CalibrationResult, CalibrationPoint } from '../../logic';
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
    calibrationMethod: CalibrationMethod;
    calibration: CalibrationResult;
    onOpenCalibrationSettings: () => void;
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
    calibrationMethod,
    calibration,
    onOpenCalibrationSettings,
    currentTime,
    lang
}) => {
    const [editingLabId, setEditingLabId] = useState<string | null>(null);

    const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';
    const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';

    const pointById = useMemo(() => {
        const m = new Map<string, CalibrationPoint>();
        for (const p of calibration.points) m.set(p.id, p);
        return m;
    }, [calibration.points]);

    const hasCal = calibration.points.length > 0;

    // One-line summary of the active calibration for the settings entry row.
    // Before any usable labs exist there's no fit to show, so we fall back to
    // just the method name (a bare "×1.00" would be misleading).
    const calSummary = calibrationMethod === 'off'
        ? t('cal.off')
        : !hasCal
            ? t(`cal.${calibrationMethod}`)
            : [
                t(`cal.${calibrationMethod}`),
                `×${calibration.scale.toFixed(2)}`,
                calibration.fitErrPct !== null ? `±${calibration.fitErrPct.toFixed(0)}%` : null,
            ].filter(Boolean).join(' · ');

    return (
        <div className="relative pb-32">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-8 pt-8 pb-4 flex items-center justify-between">
                <h1 className={`text-xl font-semibold ${on}`}>
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

            <div className="px-6 md:px-8 max-w-2xl">
                {/* Calibration settings entry — always available; how labs feed the estimate */}
                <button
                    onClick={onOpenCalibrationSettings}
                    className="w-full flex items-center justify-between gap-3 py-4 text-start outline-none focus:outline-none focus-visible:outline-none hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]"
                >
                    <div className="min-w-0">
                        <p className={`text-[15px] ${on}`}>{t('cal.settings')}</p>
                        <p className={`text-xs ${muted} mt-0.5 tabular-nums`}>{calSummary}</p>
                    </div>
                    <ChevronRight size={16} className={`${muted} shrink-0`} />
                </button>

                {/* Lab results list */}
                {labResults.length === 0 ? (
                    <div className={`py-20 text-center ${muted}`}>
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
                                const pt = pointById.get(res.id);
                                return (
                                    <div key={res.id} className="border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] last:border-b-0">
                                        <div
                                            className={`py-3.5 flex items-start gap-3 cursor-pointer -mx-2 px-2 rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] ${isEditing ? 'bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]' : ''}`}
                                            onClick={() => setEditingLabId(isEditing ? null : res.id)}
                                        >
                                            <div className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--color-m3-primary)]" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`font-medium ${on} text-sm`}>
                                                        {res.concValue} {res.unit}
                                                    </span>
                                                    <span className={`text-xs tabular-nums ${muted} shrink-0`}>
                                                        {formatTime(d)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-xs ${muted}`}>{formatDate(d, lang)}</span>
                                                    {pt && (
                                                        <span className="flex items-center gap-1.5 text-xs tabular-nums shrink-0">
                                                            <span className={muted}>{t('cal.model')} {Math.round(pt.pred)}</span>
                                                            <span
                                                                className="px-1.5 py-0.5 rounded font-medium"
                                                                style={{
                                                                    color: 'var(--color-m3-primary)',
                                                                    background: 'var(--color-m3-primary-container)',
                                                                }}
                                                            >
                                                                ×{pt.ratio.toFixed(2)}
                                                            </span>
                                                        </span>
                                                    )}
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

                        {/* Clear all — the last result row's border-b is the divider above this */}
                        <div className="flex items-center justify-end py-4">
                            <button
                                onClick={onClearLabResults}
                                className="text-sm font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                            >
                                {t('lab.clear_all')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Lab;
