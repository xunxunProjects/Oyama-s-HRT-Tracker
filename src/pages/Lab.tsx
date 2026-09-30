import React, { useState, useMemo } from 'react';
import PageHeader, { PAGE_COLUMN, headerAction } from '../components/PageHeader';
import { Plus, ChevronRight } from 'lucide-react';
import { LabResult, CalibrationMethod, CalibrationResult, CalibrationPoint, getHormoneLevelAdvisory } from '../../logic';
import { Lang } from '../i18n/translations';
import { formatDate, formatTime } from '../utils/helpers';
import LabResultForm from '../components/LabResultForm';
import VialDoodle from '../components/VialDoodle';
import CalibrationPlot from '../components/CalibrationPlot';
import { HormoneLevelAdvisoryLine } from '../components/DoseAdvisory';

interface LabProps {
    t: (key: string) => string;
    isQuickAddLabOpen: boolean;
    setIsQuickAddLabOpen: (isOpen: boolean) => void;
    labResults: LabResult[];
    onSaveLabResult: (res: LabResult) => void;
    onDeleteLabResult: (id: string) => void;
    onClearLabResults: () => void;
    calibrationMethod: CalibrationMethod;
    calibration: CalibrationResult;
    onOpenCalibrationSettings: () => void;
    lang: Lang;
}

const Lab: React.FC<LabProps> = ({
    t,
    isQuickAddLabOpen,
    setIsQuickAddLabOpen,
    labResults,
    onSaveLabResult,
    onDeleteLabResult,
    onClearLabResults,
    calibrationMethod,
    calibration,
    onOpenCalibrationSettings,
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
    const hormoneAdvisory = useMemo(() => getHormoneLevelAdvisory(labResults), [labResults]);

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
            <PageHeader
                title={t('lab.title')}
                actions={
                    <button
                        onClick={() => setIsQuickAddLabOpen(!isQuickAddLabOpen)}
                        className={`${headerAction} text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]`}
                    >
                        <Plus size={15} className={isQuickAddLabOpen ? 'rotate-45' : ''} />
                        <span>{isQuickAddLabOpen ? t('btn.cancel') : t('lab.add_title')}</span>
                    </button>
                }
            />

            {/* Expandable add form */}
            <div className={`grid ${isQuickAddLabOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className={`${PAGE_COLUMN} mb-6`}>
                        <LabResultForm
                            resultToEdit={null}
                            onSave={(res) => {
                                onSaveLabResult(res);
                                setIsQuickAddLabOpen(false);
                            }}
                            onCancel={() => setIsQuickAddLabOpen(false)}
                            onDelete={() => {}}
                        />
                    </div>
                </div>
            </div>

            <div className={PAGE_COLUMN}>
                {hormoneAdvisory && (
                    <div className="pb-4">
                        <HormoneLevelAdvisoryLine advisory={hormoneAdvisory} t={t} />
                    </div>
                )}

                {/* Calibration settings entry — always available; how labs feed the estimate */}
                <button
                    onClick={onOpenCalibrationSettings}
                    className="w-full flex items-center justify-between gap-3 py-4 text-start outline-none focus:outline-none focus-visible:outline-none hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]"
                >
                    <div className="min-w-0">
                        <p className={`text-[0.9375rem] ${on}`}>{t('cal.settings')}</p>
                        <p className={`text-xs ${muted} mt-0.5 tabular-nums`}>{calSummary}</p>
                    </div>
                    <ChevronRight size={16} className={`${muted} shrink-0`} />
                </button>

                {/* How the labs sit against the model, before and after calibration */}
                {hasCal && <CalibrationPlot calibration={calibration} t={t} lang={lang} />}

                {/* Lab results list */}
                {labResults.length === 0 ? (
                    <div className={`flex flex-col items-center py-20 text-center ${muted}`}>
                        <VialDoodle className="w-24 h-auto mb-6" />
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
