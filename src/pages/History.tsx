import React, { useState } from 'react';
import { Plus, Check, Trash2, ListChecks } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DoseEvent, Route, Ester, ExtraKey, getToE2Factor, isTestosteroneEster } from '../../logic';
import { formatTime } from '../utils/helpers';
import { useDialog } from '../contexts/DialogContext';
import DoseForm from '../components/DoseForm';
import { DoseTemplate } from '../components/DoseFormModal';
import { QuickDose } from '../components/dose_form/QuickDoseButtons';

// Trim trailing zeros so wear durations read "3.5" / "7" rather than "3.50".
const formatWearDays = (days: number): string =>
    (Math.round(days * 100) / 100).toString();

const MAX_BATCH_COUNT = 365;

const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';
const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
const headerBtn = 'flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]';
const numInput = 'w-16 h-8 px-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md text-center text-sm font-medium focus:ring-1 focus:ring-[var(--color-m3-primary)]/30 focus:border-[var(--color-m3-primary)] outline-none text-gray-900 dark:text-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

interface HistoryProps {
    t: (key: string) => string;
    isQuickAddOpen: boolean;
    setIsQuickAddOpen: (isOpen: boolean) => void;
    doseTemplates: DoseTemplate[];
    onSaveEvent: (e: DoseEvent) => void;
    onDeleteEvent: (id: string) => void;
    onAddEvents: (events: DoseEvent[]) => void;
    onDeleteEvents: (ids: string[]) => void;
    onSaveTemplate: (t: DoseTemplate) => void;
    onDeleteTemplate: (id: string) => void;
    quickDoses?: QuickDose[];
    onAddQuickDose?: (dose: QuickDose) => void;
    onDeleteQuickDose?: (id: string) => void;
    groupedEvents: Record<string, DoseEvent[]>;
    onEditEvent: (e: DoseEvent) => void;
}

const History: React.FC<HistoryProps> = ({
    t,
    isQuickAddOpen,
    setIsQuickAddOpen,
    doseTemplates,
    onSaveEvent,
    onDeleteEvent,
    onAddEvents,
    onDeleteEvents,
    onSaveTemplate,
    onDeleteTemplate,
    quickDoses = [],
    onAddQuickDose,
    onDeleteQuickDose,
    groupedEvents,
    onEditEvent
}) => {
    const { showDialog } = useDialog();
    const [editingId, setEditingId] = useState<string | null>(null);

    // Batch add: repeat the quick-add dose at a fixed interval.
    const [batchOn, setBatchOn] = useState(false);
    const [batchIntervalDays, setBatchIntervalDays] = useState('1');
    const [batchCount, setBatchCount] = useState('7');

    // Batch delete: selection mode over the list.
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const allEvents = Object.values(groupedEvents).flat() as DoseEvent[];
    const totalRecords = allEvents.length;
    const nowH = Date.now() / 3600000;

    const handleQuickSave = (e: DoseEvent) => {
        const interval = parseFloat(batchIntervalDays);
        const count = Math.min(MAX_BATCH_COUNT, Math.floor(parseFloat(batchCount)));
        if (batchOn && Number.isFinite(interval) && interval > 0 && Number.isFinite(count) && count > 1) {
            const list: DoseEvent[] = [];
            for (let k = 0; k < count; k++) {
                list.push({
                    ...e,
                    id: k === 0 ? e.id : uuidv4(),
                    timeH: e.timeH + k * interval * 24,
                    extras: { ...e.extras },
                });
            }
            onAddEvents(list);
        } else {
            onSaveEvent(e);
        }
        setIsQuickAddOpen(false);
    };

    const enterSelectMode = () => {
        setSelectMode(true);
        setSelectedIds(new Set());
        setEditingId(null);
        if (isQuickAddOpen) setIsQuickAddOpen(false);
    };

    const exitSelectMode = () => {
        setSelectMode(false);
        setSelectedIds(new Set());
    };

    const toggleSelected = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        setSelectedIds(prev =>
            prev.size === totalRecords ? new Set() : new Set(allEvents.map(e => e.id))
        );
    };

    const handleDeleteSelected = () => {
        if (!selectedIds.size) return;
        const msg = t('timeline.batch_delete_confirm').replace('{n}', String(selectedIds.size));
        showDialog('confirm', msg, () => {
            onDeleteEvents([...selectedIds]);
            exitSelectMode();
        });
    };

    const batchHint = t('timeline.batch_hint')
        .replace('{d}', batchIntervalDays || '?')
        .replace('{n}', batchCount || '?');

    return (
        <div className="relative pb-32">
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-8 pt-8 pb-3 flex items-center justify-between max-w-2xl">
                <div>
                    <h1 className={`text-xl font-semibold ${on}`}>
                        {t('timeline.title')}
                    </h1>
                    <p className={`text-sm ${muted} mt-0.5`}>
                        {totalRecords} {t('timeline.records')}
                    </p>
                </div>
                {selectMode ? (
                    <div className="flex items-center gap-1 -mr-2">
                        <button onClick={toggleSelectAll} className={`${headerBtn} ${muted}`}>
                            <ListChecks size={15} strokeWidth={1.5} />
                            <span>{t('timeline.select_all')}</span>
                        </button>
                        <button
                            onClick={handleDeleteSelected}
                            disabled={!selectedIds.size}
                            className={`${headerBtn} text-red-500 dark:text-red-400 disabled:opacity-40`}
                        >
                            <Trash2 size={15} strokeWidth={1.5} />
                            <span>{t('btn.delete')}{selectedIds.size ? ` (${selectedIds.size})` : ''}</span>
                        </button>
                        <button onClick={exitSelectMode} className={`${headerBtn} ${muted}`}>
                            <span>{t('btn.cancel')}</span>
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1 -mr-2">
                        {totalRecords > 0 && (
                            <button onClick={enterSelectMode} className={`${headerBtn} ${muted}`}>
                                <ListChecks size={15} strokeWidth={1.5} />
                                <span>{t('timeline.select')}</span>
                            </button>
                        )}
                        <button
                            onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                            className={`${headerBtn} text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]`}
                        >
                            <Plus size={15} className={isQuickAddOpen ? 'rotate-45' : ''} />
                            <span>{isQuickAddOpen ? t('btn.cancel') : t('btn.add') || '添加'}</span>
                        </button>
                    </div>
                )}
            </div>

            <div className={`mt-4 grid ${isQuickAddOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="px-4 md:px-8 mb-6 max-w-2xl">
                        <div className="flex items-center justify-between py-3">
                            <div>
                                <p className={`text-sm font-medium ${on}`}>{t('timeline.batch')}</p>
                                <p className={`text-xs ${muted} mt-0.5`}>{t('timeline.batch_desc')}</p>
                            </div>
                            <button
                                onClick={() => setBatchOn(!batchOn)}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${batchOn ? 'bg-[var(--color-m3-primary)]' : 'bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]'}`}
                                role="switch"
                                aria-checked={batchOn}
                            >
                                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow ${batchOn ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        {batchOn && (
                            <div className="pb-3">
                                <div className="flex items-center gap-5 flex-wrap">
                                    <label className={`flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400`}>
                                        {t('timeline.batch_interval')}
                                        <input
                                            type="number"
                                            min="0.25"
                                            step="0.25"
                                            value={batchIntervalDays}
                                            onChange={e => setBatchIntervalDays(e.target.value)}
                                            className={numInput}
                                        />
                                    </label>
                                    <label className={`flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400`}>
                                        {t('timeline.batch_count')}
                                        <input
                                            type="number"
                                            min="2"
                                            max={MAX_BATCH_COUNT}
                                            step="1"
                                            value={batchCount}
                                            onChange={e => setBatchCount(e.target.value)}
                                            className={numInput}
                                        />
                                    </label>
                                </div>
                                <p className={`text-xs ${muted} mt-2`}>{batchHint}</p>
                            </div>
                        )}
                        <DoseForm
                            eventToEdit={null}
                            onSave={handleQuickSave}
                            onCancel={() => setIsQuickAddOpen(false)}
                            onDelete={() => { }}
                            templates={doseTemplates}
                            onSaveTemplate={onSaveTemplate}
                            onDeleteTemplate={onDeleteTemplate}
                            isInline={true}
                        />
                    </div>
                </div>
            </div>

            {Object.keys(groupedEvents).length === 0 && (
                <div className="px-6 md:px-8 text-center py-20 max-w-2xl text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                    <p className="text-sm">{t('timeline.empty')}</p>
                </div>
            )}

            {Object.keys(groupedEvents).length > 0 && (
            <div className="px-6 md:px-8 max-w-2xl">
                {Object.entries(groupedEvents).map(([date, items]) => (
                    <div key={date} className="mb-6 last:mb-0">
                        <div className="sticky top-[94px] z-10 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] py-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{date}</span>
                        </div>
                        <div>
                            {(items as DoseEvent[]).map(ev => {
                                const isEditing = editingId === ev.id;
                                const isSelected = selectedIds.has(ev.id);
                                const isFuture = ev.timeH > nowH;
                                return (
                                <div key={ev.id} className="border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] last:border-b-0">
                                    <div
                                        onClick={() => selectMode ? toggleSelected(ev.id) : setEditingId(isEditing ? null : ev.id)}
                                        className={`py-3.5 flex items-start gap-3 cursor-pointer -mx-2 px-2 rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] ${(isEditing || (selectMode && isSelected)) ? 'bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]' : ''}`}
                                    >
                                        {selectMode ? (
                                            <span className={`mt-[3px] w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'bg-[var(--color-m3-primary)] border-[var(--color-m3-primary)]' : 'border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)]'}`}>
                                                {isSelected && <Check size={11} strokeWidth={2.5} className="text-white" />}
                                            </span>
                                        ) : (
                                            <div className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--color-m3-outline)] dark:bg-[var(--color-m3-dark-outline)]" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="font-medium text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] truncate text-sm">
                                                        {ev.route === Route.patchRemove ? t('route.patchRemove') : t(`ester.${ev.ester}`)}
                                                    </span>
                                                    {isFuture && (
                                                        <span className={`shrink-0 text-[11px] font-medium ${muted} px-1.5 py-0.5 rounded bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]`}>
                                                            {t('timeline.future')}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs tabular-nums text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0">
                                                    {formatTime(new Date(ev.timeH * 3600000))}
                                                </span>
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                                <span className="truncate">{t(`route.${ev.route}`)}</span>
                                                {ev.extras[ExtraKey.releaseRateUGPerDay] ? (
                                                    <>
                                                        <span className="opacity-40">·</span>
                                                        <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{`${ev.extras[ExtraKey.releaseRateUGPerDay]} µg/d`}</span>
                                                    </>
                                                ) : ev.route !== Route.patchRemove && (
                                                    <>
                                                        <span className="opacity-40">·</span>
                                                        <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] font-medium">{`${ev.doseMG.toFixed(2)} mg`}</span>
                                                        {ev.ester !== Ester.E2 && ev.ester !== Ester.CPA && !isTestosteroneEster(ev.ester) && (
                                                            <span className="opacity-70">
                                                                {`(${t('label.e2')} eq: ${(ev.doseMG * getToE2Factor(ev.ester)).toFixed(2)} mg)`}
                                                            </span>
                                                        )}
                                                        {isTestosteroneEster(ev.ester) && ev.ester !== Ester.T && (
                                                            <span className="opacity-70">
                                                                {`(${t('label.t')} eq: ${(ev.doseMG * getToE2Factor(ev.ester)).toFixed(2)} mg)`}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                                {ev.route === Route.patchApply && typeof ev.extras[ExtraKey.patchWearH] === 'number' && ev.extras[ExtraKey.patchWearH]! > 0 && (
                                                    <>
                                                        <span className="opacity-40">·</span>
                                                        <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{`${formatWearDays(ev.extras[ExtraKey.patchWearH]! / 24)} ${t('unit.day_short')}`}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`grid ${isEditing && !selectMode ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                        <div className="overflow-hidden">
                                            <div className="pb-4 pt-1">
                                                <DoseForm
                                                    eventToEdit={ev}
                                                    onSave={(e) => {
                                                        onSaveEvent(e);
                                                        setEditingId(null);
                                                    }}
                                                    onCancel={() => setEditingId(null)}
                                                    onDelete={(id) => {
                                                        onDeleteEvent(id);
                                                        setEditingId(null);
                                                    }}
                                                    templates={doseTemplates}
                                                    onSaveTemplate={onSaveTemplate}
                                                    onDeleteTemplate={onDeleteTemplate}
                                                    isInline={true}
                                                    hideHeader={true}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            )}

        </div>
    );
};

export default History;
