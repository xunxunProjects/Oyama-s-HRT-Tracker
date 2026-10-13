import React, { useMemo, useState } from 'react';
import PageHeader, { PAGE_COLUMN, headerAction } from '../components/PageHeader';
import { Plus, Minus, Trash2, ListChecks, Repeat, ChevronDown } from 'lucide-react';
import Tick from '../components/Tick';
import Switch from '../components/Switch';
import Doodle from '../components/Doodle';
import { v4 as uuidv4 } from 'uuid';
import { DoseEvent, Route, Ester, ExtraKey, getToE2Factor, isEstradiolEster, isTestosteroneEster } from '../../logic';
import { formatTime } from '../utils/helpers';
import { drugLabel } from '../utils/regimenText';
import { useDialog } from '../contexts/DialogContext';
import DoseForm from '../components/DoseForm';
import LogDoodle from '../components/LogDoodle';
import { DoseTemplate } from '../components/DoseFormModal';
import { QuickDose } from '../components/dose_form/QuickDoseButtons';
import { DoseDayGroup } from '../hooks/useAppData';

// Trim trailing zeros so wear durations read "3.5" / "7" rather than "3.50".
const formatWearDays = (days: number): string =>
    (Math.round(days * 100) / 100).toString();

const MAX_BATCH_COUNT = 365;

const muted = 'text-[var(--text-muted)]';
const on = 'text-[var(--text)]';
const headerBtn = headerAction;
const inertWhen = (closed: boolean) => (closed ? ({ inert: '' } as Record<string, unknown>) : {});

/**
 * A number field with − and + on either side, so the batch values can be
 * nudged with a thumb instead of summoning the number pad. Typing still works;
 * the buttons step from whatever is typed and stop at the limits.
 */
const Stepper: React.FC<{
    label: string;
    value: string;
    onChange: (v: string) => void;
    min: number;
    max?: number;
    /** Size of one step for a given value and direction. */
    step: (current: number, dir: 1 | -1) => number;
    inputStep: string;
}> = ({ label, value, onChange, min, max = Infinity, step, inputStep }) => {
    const id = React.useId();
    const n = parseFloat(value);
    const current = Number.isFinite(n) ? n : min;
    const nudge = (dir: 1 | -1) => {
        const next = Math.min(max, Math.max(min, current + dir * step(current, dir)));
        onChange(String(Math.round(next * 100) / 100));
    };
    const btn = 'grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-35 disabled:hover:bg-transparent';
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="block text-xs font-semibold text-[var(--text-muted)] pl-1">{label}</label>
            <span className="flex h-11 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--field)] px-1 hover:border-[var(--border-strong)] focus-within:border-[var(--accent-ink)]">
                <button type="button" onClick={() => nudge(-1)} disabled={current <= min} aria-label={`${label} −`} className={btn}>
                    <Minus size={16} />
                </button>
                <input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min={min}
                    max={Number.isFinite(max) ? max : undefined}
                    step={inputStep}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-center text-sm font-medium tabular-nums text-[var(--text)] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button type="button" onClick={() => nudge(1)} disabled={current >= max} aria-label={`${label} +`} className={btn}>
                    <Plus size={16} />
                </button>
            </span>
        </div>
    );
};

// Whole days, but quarter days below one so a twice-daily or every-6-hours
// schedule can still be reached from the buttons.
const intervalStep = (v: number, dir: 1 | -1) => (dir > 0 ? v >= 1 : v > 1) ? 1 : 0.25;

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
    /** Every dose, for the add form to start from what was taken last. */
    events?: DoseEvent[];
    /** The one-tap doses, shown at the top of the add form as they are in the edit sheet. */
    quickDoses?: QuickDose[];
    onAddQuickDose?: (dose: QuickDose) => void;
    onDeleteQuickDose?: (id: string) => void;
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

    const allEvents = useMemo(() => groupedEvents.flatMap(g => g.events), [groupedEvents]);
    const totalRecords = allEvents.length;
    const nowH = Date.now() / 3600000;

    // How long the patch each removal took off had been worn, for its row.
    // Paired the way the model pairs them (patchRemovalTimes in logic.ts): in
    // time order, each removal ends the oldest patch still on, so the row says
    // what the curve does. Keyed on the event, as there, since imported files
    // can repeat an id.
    const wornBeforeRemoval = useMemo(() => {
        const wornH = new Map<DoseEvent, number>();
        const onSkin: DoseEvent[] = [];
        for (const e of [...allEvents].sort((a, b) => a.timeH - b.timeH)) {
            if (e.route === Route.patchApply) onSkin.push(e);
            else if (e.route === Route.patchRemove) {
                const applied = onSkin.shift();
                if (applied && e.timeH > applied.timeH) wornH.set(e, e.timeH - applied.timeH);
            }
        }
        return wornH;
    }, [allEvents]);

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

    const renderRow = (ev: DoseEvent) => {
        const isEditing = editingId === ev.id;
        const isSelected = selectedIds.has(ev.id);
        const isFuture = ev.timeH > nowH;
        const isRemoval = ev.route === Route.patchRemove;
        const wornH = isRemoval ? wornBeforeRemoval.get(ev) : undefined;
        const editOpen = isEditing && !selectMode;
        return (
            <div key={ev.id} className="border-b border-[var(--border)] last:border-b-0">
                {/* A button, so a keyboard reaches every record: it opens the
                    record's form, or in select mode ticks it. The drawing at its
                    head says the route, which the first line alone does not when
                    gel, patch, tablet and pill all read "Estradiol (E2)". */}
                <button
                    type="button"
                    onClick={() => selectMode ? toggleSelected(ev.id) : setEditingId(isEditing ? null : ev.id)}
                    {...(selectMode ? { role: 'checkbox', 'aria-checked': isSelected } : { 'aria-expanded': isEditing })}
                    className={`w-[calc(100%+1rem)] py-3.5 flex items-center gap-3 text-start -mx-2 px-2 rounded-md hover:bg-[var(--surface-hover)] ${(isEditing || (selectMode && isSelected)) ? 'bg-[var(--surface-hover)]' : ''}`}
                >
                    {selectMode ? (
                        <span className={`check-dot inline-flex shrink-0 items-center justify-center w-4 h-4 rounded-full border ${isSelected ? 'bg-[var(--accent)] border-[var(--accent-ink)]' : 'border-[var(--border-strong)]'}`}>
                            <Tick on={isSelected} size={11} strokeWidth={2.5} tone="current" className="text-[var(--on-accent)]" />
                        </span>
                    ) : null}
                    <Doodle name={ev.route} size={1.75} asleep={isFuture} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-baseline gap-2 min-w-0">
                                <span className="font-medium text-[var(--text)] truncate text-sm">
                                    {isRemoval ? t('route.patchRemove') : drugLabel(ev.ester, t)}
                                </span>
                                {wornH !== undefined && (
                                    <span className={`shrink-0 text-xs ${muted}`}>
                                        {t('timeline.patch_worn').replace('{d}', `${formatWearDays(wornH / 24)} ${t('unit.day_short')}`)}
                                    </span>
                                )}
                                {isFuture && (
                                    <span className={`shrink-0 self-center text-[0.6875rem] font-medium ${muted} px-1.5 py-0.5 rounded bg-[var(--surface-hover)]`}>
                                        {t('timeline.future')}
                                    </span>
                                )}
                            </div>
                            <span className="text-xs tabular-nums text-[var(--text-muted)] shrink-0">
                                {formatTime(new Date(ev.timeH * 3600000))}
                            </span>
                        </div>
                        {/* A removal is the one line: its route is its name,
                            and it has no amount of its own. */}
                        {!isRemoval && (
                            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-xs text-[var(--text-muted)]">
                                <span className="truncate">{t(`route.${ev.route}`)}</span>
                                {ev.extras[ExtraKey.releaseRateUGPerDay] ? (
                                    <>
                                        <span className="text-[var(--text)]">{`${ev.extras[ExtraKey.releaseRateUGPerDay]} µg/d`}</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-[var(--text)] font-medium">{`${ev.doseMG.toFixed(2)} mg`}</span>
                                        {ev.ester !== Ester.E2 && isEstradiolEster(ev.ester) && (
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
                        )}
                    </div>
                    {!selectMode && (
                        <ChevronDown size={16} className={`chev ${muted} shrink-0 ${isEditing ? 'rotate-180' : ''}`} />
                    )}
                </button>

                <div className="disclosure" data-open={editOpen} {...inertWhen(!editOpen)}>
                    <div className="disclosure-inner">
                        {/* Mounted only for the row being edited — with hundreds of
                            records, keeping every row's form mounted (even collapsed
                            to zero height) made every dose add/edit re-render all of
                            them at once. */}
                        {editOpen && (
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
    };

    const renderDay = ({ key, label, events: dayEvents }: DoseDayGroup) => (
        <div key={key} className="mb-6 last:mb-0">
            <div className="sticky top-[80px] z-10 bg-[var(--bg)] py-2">
                <span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>
            </div>
            <div>
                {dayEvents.map(renderRow)}
            </div>
        </div>
    );

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

            {/* Inert while closed, so a keyboard does not tab through a form it cannot see. */}
            <div className="disclosure mt-4" data-open={isQuickAddOpen} {...inertWhen(!isQuickAddOpen)}>
                <div className="disclosure-inner">
                    <div className={`${PAGE_COLUMN} mb-6`}>
                        <div className="flex items-center justify-between py-3">
                            <div>
                                <p className={`text-sm font-medium ${on}`}>{t('timeline.batch')}</p>
                                <p className={`text-xs ${muted} mt-0.5`}>{t('timeline.batch_desc')}</p>
                            </div>
                            <Switch checked={batchOn} onChange={setBatchOn} label={t('timeline.batch')} />
                        </div>
                        {batchOn && (
                            <div className="pb-4 pt-1 animate-[fade-in_var(--duration-base)_var(--ease-standard)] motion-reduce:animate-none">
                                <div className="grid grid-cols-2 gap-3">
                                    <Stepper
                                        label={t('timeline.batch_interval')}
                                        value={batchIntervalDays}
                                        onChange={setBatchIntervalDays}
                                        min={0.25}
                                        step={intervalStep}
                                        inputStep="0.25"
                                    />
                                    <Stepper
                                        label={t('timeline.batch_count')}
                                        value={batchCount}
                                        onChange={setBatchCount}
                                        min={2}
                                        max={MAX_BATCH_COUNT}
                                        step={() => 1}
                                        inputStep="1"
                                    />
                                </div>
                                <p className={`mt-3 flex items-start gap-2 text-xs ${muted}`}>
                                    <span className="icon-line"><Repeat size={14} /></span>
                                    <span>{batchHint}</span>
                                </p>
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
                {groupedEvents.map(day => renderDay(day))}
            </div>
            )}

        </div>
    );
};

export default History;
