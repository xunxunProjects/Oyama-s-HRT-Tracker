import React, { useState, useMemo, useRef, useEffect } from 'react';
import PageHeader, { PAGE_COLUMN, headerActionAccent } from '../components/PageHeader';
import { ChevronRight } from '../components/icons';
import {
    LabResult,
    CalibrationMethod,
    CalibrationResult,
    CalibrationPoint,
    DoseEvent,
    SimulationResult,
    getHormoneLevelAdvisory,
    isT_LabUnit,
    labDoseContext,
    labInModelUnit,
    rawModelAtLab,
} from '../../logic';
import { Lang } from '../i18n/translations';
import { formatDate, formatTime } from '../utils/helpers';
import LabResultForm from '../components/LabResultForm';
import VialDoodle from '../components/VialDoodle';
import CalibrationPlot from '../components/CalibrationPlot';
import { HormoneLevelAdvisoryLine } from '../components/DoseAdvisory';
import { fill } from '../utils/regimenText';
import { labDetailsText, labVsModelPct, sinceDoseLabel } from '../utils/labReport';
import { useHRTMode } from '../contexts/HRTModeContext';
import { copyText } from '../utils/clipboard';
import { clinicalUnit } from '../utils/clinicalUnit';
import { AddCancelLabel, SwapLabel } from '../components/StableLabel';
import { CopyTick } from '../components/Tick';
import { scrollParent } from '../utils/scrollParent';
import { inertWhen } from '../utils/inert';

interface LabProps {
    t: (key: string) => string;
    isQuickAddLabOpen: boolean;
    setIsQuickAddLabOpen: (isOpen: boolean) => void;
    labResults: LabResult[];
    /** The dose log and the model run, for each lab's timing and the copied details. */
    events: DoseEvent[];
    simulation: SimulationResult | null;
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
    events,
    simulation,
    onSaveLabResult,
    onDeleteLabResult,
    onClearLabResults,
    calibrationMethod,
    calibration,
    onOpenCalibrationSettings,
    lang,
}) => {
    const [editingLabId, setEditingLabId] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const { isTransmasc } = useHRTMode();

    // The add form always opens at the top of the page, so when Add is
    // tapped from further down (where the list is) the page goes back up to
    // it; otherwise the only visible change is the header pill turning into
    // Cancel. Nothing is focused, so a phone keyboard doesn't cover the date
    // row, which is often the first thing to change.
    useEffect(() => {
        if (!isQuickAddLabOpen) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        scrollParent(rootRef.current)?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    }, [isQuickAddLabOpen]);

    // A new entry starts in the units the last lab of each hormone used.
    const [lastE2Unit, lastTUnit] = useMemo(() => {
        const newestFirst = labResults.slice().sort((a, b) => b.timeH - a.timeH);
        return [newestFirst.find(r => !isT_LabUnit(r.unit))?.unit, newestFirst.find(r => isT_LabUnit(r.unit))?.unit];
    }, [labResults]);

    const lastAssay = useMemo(
        () =>
            labResults
                .slice()
                .sort((a, b) => b.timeH - a.timeH)
                .find(r => r.assay)?.assay,
        [labResults],
    );

    // Copying the details: a tick while it worked, nothing on failure but the
    // button staying as it was. Nothing leaves the device but the clipboard.
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const id = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(id);
    }, [copied]);
    const copyDetails = async () => {
        try {
            await copyText(labDetailsText(labResults, events, simulation));
            setCopied(true);
        } catch {
            /* the clipboard was refused; the button stays as it was */
        }
    };

    const muted = 'text-[var(--text-muted)]';
    const on = 'text-[var(--text)]';

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
    const calSummary =
        calibrationMethod === 'off'
            ? t('cal.off')
            : !hasCal
              ? t(`cal.${calibrationMethod}`)
              : [
                    t(`cal.${calibrationMethod}`),
                    `×${calibration.scale.toFixed(2)}`,
                    calibration.fitErrPct !== null ? `±${calibration.fitErrPct.toFixed(0)}%` : null,
                ]
                    .filter(Boolean)
                    .join(', ');

    return (
        <div ref={rootRef} className="relative md:pb-32">
            {/* Header */}
            <PageHeader
                title={t('lab.title')}
                actions={
                    <button
                        onClick={() => setIsQuickAddLabOpen(!isQuickAddLabOpen)}
                        className={`${headerActionAccent}`}
                    >
                        <AddCancelLabel open={isQuickAddLabOpen} add={t('lab.add_title')} cancel={t('btn.cancel')} />
                    </button>
                }
            />

            {/* Expandable add form */}
            <div className="disclosure" data-open={isQuickAddLabOpen} {...inertWhen(!isQuickAddLabOpen)}>
                <div className="disclosure-inner">
                    <div className={`${PAGE_COLUMN} mb-6`}>
                        <LabResultForm
                            // Force remount on open so the values clear and the date resets to "now" (this row never unmounts, only collapses via CSS).
                            key={isQuickAddLabOpen ? 'open' : 'closed'}
                            resultToEdit={null}
                            defaultE2Unit={lastE2Unit}
                            defaultTUnit={lastTUnit}
                            defaultAssay={lastAssay}
                            onSave={res => {
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
                    className="w-full flex items-center justify-between gap-3 py-4 text-start outline-none focus:outline-none focus-visible:outline-none hover:bg-[var(--surface-hover)] border-b-(length:--hairline) border-[var(--border)]"
                >
                    <div className="min-w-0">
                        <p className={`text-sm ${on}`}>{t('cal.settings')}</p>
                        <p className={`text-xs ${muted} mt-0.5 tabular-nums`}>{calSummary}</p>
                    </div>
                    <ChevronRight size={16} className={`${muted} shrink-0`} />
                </button>

                {/* Lab results list. It comes before the plot: it is what the page
                    is named for, and a result just saved lands where it can be seen. */}
                {labResults.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-center">
                        <VialDoodle className="w-24 h-auto mb-6" />
                        <p className={`text-sm font-semibold ${on} mb-1`}>{t('lab.empty')}</p>
                        {/* What a lab is for, in the words the intro uses. Only
                            estradiol labs calibrate the curve, so in transmasc
                            mode, where labs are testosterone, it isn't said. */}
                        {!isTransmasc && (
                            <p className={`text-sm ${muted} max-w-xs text-balance`}>
                                {t('onboarding.how_calibrate_desc')}
                            </p>
                        )}
                        {/* Adding a result is the one thing this page is waiting
                            for. Gone while the form is open above. */}
                        {!isQuickAddLabOpen && (
                            <button onClick={() => setIsQuickAddLabOpen(true)} className="btn-primary mt-6">
                                {t('lab.add_title')}
                            </button>
                        )}
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
                                const isT = isT_LabUnit(res.unit);
                                // An estradiol lab the model has no level for is left out
                                // of calibration, and the row says so. The reason names
                                // estradiol: in transmasc mode the doses logged are
                                // testosterone, so "no recent dose" would be untrue.
                                // Testosterone labs are not explained here: in transmasc
                                // mode nearly every lab is one, and a note on each would
                                // be noise.
                                const unused = !pt && !isT;
                                // Estradiol compares through calibration's own points;
                                // testosterone, which nothing calibrates, against the
                                // model directly, so a transmasc lab reads the same way.
                                const tModel = isT ? rawModelAtLab(simulation, res) : null;
                                const cmp = pt
                                    ? { pred: pt.pred, pct: Math.round((pt.ratio - 1) * 100) }
                                    : tModel != null
                                      ? { pred: tModel, pct: labVsModelPct(labInModelUnit(res), tModel) }
                                      : null;
                                const pct = cmp?.pct ?? 0;
                                const timing = labDoseContext(res, events);
                                return (
                                    <div
                                        key={res.id}
                                        className="border-b-(length:--hairline) border-[var(--border)] last:border-b-0"
                                    >
                                        {/* A button, so the row opens its edit form (and
                                            with it Delete) from the keyboard too. Its parts
                                            are spans, the only kind a button may hold. */}
                                        <button
                                            type="button"
                                            aria-expanded={isEditing}
                                            className={`w-[calc(100%+1rem)] py-3.5 flex items-start gap-3 text-start cursor-pointer -mx-2 px-2 rounded-md hover:bg-[var(--surface-hover)] ${isEditing ? 'bg-[var(--surface-hover)]' : ''}`}
                                            onClick={() => setEditingLabId(isEditing ? null : res.id)}
                                        >
                                            <span
                                                className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 ${unused ? 'bg-[var(--border-strong)]' : 'bg-[var(--accent)]'}`}
                                            />
                                            <span className="flex-1 min-w-0">
                                                <span className="flex items-center justify-between mb-1">
                                                    <span className="text-sm">
                                                        <span className={`font-medium tabular-nums ${on}`}>
                                                            {res.concValue} {clinicalUnit(res.unit)}
                                                        </span>
                                                        <span className={muted}>
                                                            {', '}
                                                            {t(isT ? 'label.t' : 'label.e2')}
                                                        </span>
                                                    </span>
                                                    <span className={`text-xs tabular-nums ${muted} shrink-0`}>
                                                        {formatTime(d)}
                                                    </span>
                                                </span>
                                                <span className="flex items-center justify-between gap-2">
                                                    {/* How long after the dose it was drawn rides on the
                                                        date: what makes a lab comparable with the curve. */}
                                                    <span className={`text-xs tabular-nums ${muted}`}>
                                                        {formatDate(d, lang)}
                                                        {timing &&
                                                            `, ${fill(t('lab.after_dose'), { when: sinceDoseLabel(timing.hoursBefore, t) })}`}
                                                    </span>
                                                    {/* Against the raw model, named as the plot names it, and
                                                        in words: "13% above" rather than a bare ×1.13. */}
                                                    {cmp && (
                                                        <span className="flex items-center gap-1.5 text-xs tabular-nums shrink-0">
                                                            <span className={muted}>
                                                                {t('cal.plot.before')} {Math.round(cmp.pred)}
                                                            </span>
                                                            <span
                                                                className="px-1.5 py-0.5 rounded font-medium"
                                                                style={{
                                                                    color: 'var(--accent-ink)',
                                                                    background: 'var(--accent-subtle)',
                                                                }}
                                                            >
                                                                {pct === 0
                                                                    ? '±0%'
                                                                    : fill(
                                                                          t(
                                                                              pct > 0
                                                                                  ? 'lab.ratio_above'
                                                                                  : 'lab.ratio_below',
                                                                          ),
                                                                          { pct: Math.abs(pct) },
                                                                      )}
                                                            </span>
                                                        </span>
                                                    )}
                                                </span>
                                                {unused && (
                                                    <span className={`block text-xs ${muted} mt-1`}>
                                                        {t('lab.not_used')}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                        <div
                                            className={`grid ${isEditing ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                                            {...inertWhen(!isEditing)}
                                        >
                                            <div className="overflow-hidden">
                                                <div className="pb-4 pt-1">
                                                    <LabResultForm
                                                        resultToEdit={res}
                                                        onSave={updated => {
                                                            onSaveLabResult(updated);
                                                            setEditingLabId(null);
                                                        }}
                                                        onCancel={() => setEditingLabId(null)}
                                                        onDelete={id => {
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
                        <div className="flex items-center justify-between gap-4 py-4">
                            <button
                                onClick={copyDetails}
                                className="tap-target inline-flex items-center gap-1 text-sm font-medium text-[var(--accent-ink)]"
                            >
                                <CopyTick copied={copied} size={14} />
                                <SwapLabel show={copied} off={t('lab.copy_details')} on={t('lab.copied')} />
                            </button>
                            <button
                                onClick={onClearLabResults}
                                className="tap-target text-sm font-medium text-[var(--danger)] hover:text-[var(--danger)]"
                            >
                                {t('lab.clear_all')}
                            </button>
                        </div>
                    </div>
                )}

                {/* How the labs sit against the model, before and after calibration */}
                {hasCal && <CalibrationPlot calibration={calibration} t={t} lang={lang} />}
            </div>
        </div>
    );
};

export default Lab;
