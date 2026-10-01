import React, { useState } from 'react';
import PageHeader, { PAGE_COLUMN, headerAction } from '../components/PageHeader';
import { Plus, Trash2, ListChecks } from 'lucide-react';
import Tick from '../components/Tick';
import Switch from '../components/Switch';
import { v4 as uuidv4 } from 'uuid';
import { DoseEvent, Route, Ester, ExtraKey, getToE2Factor, isTestosteroneEster } from '../../logic';
import { formatTime } from '../utils/helpers';
import { useDialog } from '../contexts/DialogContext';
import DoseForm from '../components/DoseForm';
import LogDoodle from '../components/LogDoodle';
import { DoseTemplate } from '../components/DoseFormModal';
import { DoseDayGroup } from '../hooks/useAppData';

// Trim trailing zeros so wear durations read "3.5" / "7" rather than "3.50".
const formatWearDays = (days: number): string =>
    (Math.round(days * 100) / 100).toString();

const MAX_BATCH_COUNT = 365;

const muted = 'text-[var(--text-muted)]';
const on = 'text-[var(--text)]';
const headerBtn = headerAction;
const numInput = 'w-16 h-8 px-2 bg-[var(--field)] border border-[var(--border-strong)] rounded-md text-center text-sm font-medium focus:ring-[3px] focus:ring-[var(--accent)]/20 focus:border-[var(--accent-ink)] outline-none text-[var(--text)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

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
    groupedEvents: DoseDayGroup[];
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
    groupedEvents
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

    const allEvents = groupedEvents.flatMap(g => g.events);
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
        }, { danger: true });
    };

    const batchHint = t('timeline.batch_hint')
        .replace('{d}', batchIntervalDays || '?')
        .replace('{n}', batchCount || '?');

    return (
        <div className="relative pb-32">
            <PageHeader
                title={t('timeline.title')}
                subtitle={`${totalRecords} ${t('timeline.records')}`}
                actions={selectMode ? (
                    <>
                        <button onClick={toggleSelectAll} className={`${headerBtn} ${muted}`}>
                            <ListChecks size={15} strokeWidth={1.5} />
                            <span>{t('timeline.select_all')}</span>
                        </button>
                        <button
                            onClick={handleDeleteSelected}
                            disabled={!selectedIds.size}
                            className={`${headerBtn} text-[var(--danger)] disabled:opacity-40`}
                        >
                            <Trash2 size={15} strokeWidth={1.5} />
                            <span>{t('btn.delete')}{selectedIds.size ? ` (${selectedIds.size})` : ''}</span>
                        </button>
                        <button onClick={exitSelectMode} className={`${headerBtn} ${muted}`}>
                            <span>{t('btn.cancel')}</span>
                        </button>
                    </>
                ) : (
                    <>
                        {totalRecords > 0 && (
                            <button onClick={enterSelectMode} className={`${headerBtn} ${muted}`}>
                                <ListChecks size={15} strokeWidth={1.5} />
                                <span>{t('timeline.select')}</span>
                            </button>
                        )}
                        <button
                            onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                            className={`${headerBtn} text-[var(--accent-ink)]`}
                        >
                            <Plus size={15} className={isQuickAddOpen ? 'rotate-45' : ''} />
                            <span>{isQuickAddOpen ? t('btn.cancel') : t('btn.add') || '添加'}</span>
                        </button>
                    </>
                )}
            />

            <div className={`mt-4 grid ${isQuickAddOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className={`${PAGE_COLUMN} mb-6`}>
                        <div className="flex items-center justify-between py-3">
                            <div>
                                <p className={`text-sm font-medium ${on}`}>{t('timeline.batch')}</p>
                                <p className={`text-xs ${muted} mt-0.5`}>{t('timeline.batch_desc')}</p>
                            </div>
                            <Switch checked={batchOn} onChange={setBatchOn} label={t('timeline.batch')} />
                        </div>
                        {batchOn && (
                            <div className="pb-3">
                                <div className="flex items-center gap-5 flex-wrap">
                                    <label className={`flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]`}>
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
                                    <label className={`flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]`}>
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
                            // Force remount on open so the default date resets to "now" (this row never unmounts, only collapses via CSS).
                            key={isQuickAddOpen ? 'open' : 'closed'}
                            eventToEdit={null}
                            onSave={handleQuickSave}
                            onCancel={() => setIsQuickAddOpen(false)}
                            onDelete={() => { }}
                            templates={doseTemplates}
                            onSaveTemplate={onSaveTemplate}
                            onDeleteTemplate={onDeleteTemplate}
                            isInline={true}
                            events={allEvents}
                        />
                    </div>
                </div>
            </div>

            {groupedEvents.length === 0 && (
                <div className={`${PAGE_COLUMN} flex flex-col items-center text-center py-20 text-[var(--text-muted)]`}>
                    <LogDoodle className="w-24 h-auto mb-6" />
                    <p className="text-sm">{t('timeline.empty')}</p>
                </div>
            )}

            {groupedEvents.length > 0 && (
            <div className={PAGE_COLUMN}>
                {groupedEvents.map(({ key, label, events: dayEvents }) => (
                    <div key={key} className="mb-6 last:mb-0">
                        <div className="sticky top-[94px] z-10 bg-[var(--bg)] py-2">
              <span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>
                        </div>
                        <div>
                            {dayEvents.map(ev => {
                                const isEditing = editingId === ev.id;
                                const isSelected = selectedIds.has(ev.id);
                                const isFuture = ev.timeH > nowH;
                                return (
                                <div key={ev.id} className="border-b border-[var(--border)] last:border-b-0">
                                    <div
                                        onClick={() => selectMode ? toggleSelected(ev.id) : setEditingId(isEditing ? null : ev.id)}
                                        className={`py-3.5 flex items-start gap-3 cursor-pointer -mx-2 px-2 rounded-md hover:bg-[var(--surface-hover)] ${(isEditing || (selectMode && isSelected)) ? 'bg-[var(--surface-hover)]' : ''}`}
                                    >
                                        {selectMode ? (
                                            <span className={`icon-line text-sm check-dot w-4 h-4 rounded-full border justify-center ${isSelected ? 'bg-[var(--accent)] border-[var(--accent-ink)]' : 'border-[var(--border-strong)]'}`}>
                                                <Tick on={isSelected} size={11} strokeWidth={2.5} tone="current" className="text-[var(--on-accent)]" />
                                            </span>
                                        ) : null}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="font-medium text-[var(--text)] truncate text-sm">
                                                        {ev.route === Route.patchRemove ? t('route.patchRemove') : t(`ester.${ev.ester}`)}
                                                    </span>
                                                    {isFuture && (
                                                        <span className={`shrink-0 text-[0.6875rem] font-medium ${muted} px-1.5 py-0.5 rounded bg-[var(--surface-hover)]`}>
                                                            {t('timeline.future')}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs tabular-nums text-[var(--text-muted)] shrink-0">
                                                    {formatTime(new Date(ev.timeH * 3600000))}
                                                </span>
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-xs text-[var(--text-muted)]">
                                                <span className="truncate">{t(`route.${ev.route}`)}</span>
                                                {ev.extras[ExtraKey.releaseRateUGPerDay] ? (
                                                    <>
                                                        <span className="text-[var(--text)]">{`${ev.extras[ExtraKey.releaseRateUGPerDay]} µg/d`}</span>
                                                    </>
                                                ) : ev.route !== Route.patchRemove && (
                                                    <>
                                                        <span className="text-[var(--text)] font-medium">{`${ev.doseMG.toFixed(2)} mg`}</span>
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
                                                        <span className="text-[var(--text)]">{`${formatWearDays(ev.extras[ExtraKey.patchWearH]! / 24)} ${t('unit.day_short')}`}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`grid ${isEditing && !selectMode ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                        <div className="overflow-hidden">
                                            {/* Mounted only for the row being edited — with hundreds of
                                                records, keeping every row's form mounted (even collapsed
                                                to zero height) made every dose add/edit re-render all of
                                                them at once. */}
                                            {isEditing && !selectMode && (
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
                                                        events={allEvents}
                                                    />
                                                </div>
                                            )}
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
