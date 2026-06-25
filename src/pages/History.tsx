import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { DoseEvent, Route, Ester, ExtraKey, getToE2Factor, isTestosteroneEster } from '../../logic';
import { formatTime } from '../utils/helpers';
import DoseForm from '../components/DoseForm';
import { DoseTemplate } from '../components/DoseFormModal';
import { QuickDose } from '../components/dose_form/QuickDoseButtons';

// Trim trailing zeros so wear durations read "3.5" / "7" rather than "3.50".
const formatWearDays = (days: number): string =>
    (Math.round(days * 100) / 100).toString();

interface HistoryProps {
    t: (key: string) => string;
    isQuickAddOpen: boolean;
    setIsQuickAddOpen: (isOpen: boolean) => void;
    doseTemplates: DoseTemplate[];
    onSaveEvent: (e: DoseEvent) => void;
    onDeleteEvent: (id: string) => void;
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
    onSaveTemplate,
    onDeleteTemplate,
    quickDoses = [],
    onAddQuickDose,
    onDeleteQuickDose,
    groupedEvents,
    onEditEvent
}) => {
    const [editingId, setEditingId] = useState<string | null>(null);

    return (
        <div className="relative pb-32">
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-8 pt-8 pb-3 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        {t('timeline.title')}
                    </h1>
                    <p className="text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-0.5">
                        {(Object.values(groupedEvents) as DoseEvent[][]).reduce((acc, curr) => acc + curr.length, 0)} {t('timeline.records')}
                    </p>
                </div>
                <button
                    onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                    className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] px-2 py-1 -mr-2 rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                >
                    <Plus size={15} className={isQuickAddOpen ? 'rotate-45' : ''} />
                    <span>{isQuickAddOpen ? t('btn.cancel') : t('btn.add') || '添加'}</span>
                </button>
            </div>

            <div className={`mt-4 grid ${isQuickAddOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="mx-4 md:mx-8 mb-6">
                        <DoseForm
                            eventToEdit={null}
                            onSave={(e) => {
                                onSaveEvent(e);
                                setIsQuickAddOpen(false);
                            }}
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
                <div className="px-6 md:px-8 text-center py-20 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
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
                                return (
                                <div key={ev.id} className="border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] last:border-b-0">
                                    <div
                                        onClick={() => setEditingId(isEditing ? null : ev.id)}
                                        className={`py-3.5 flex items-start gap-3 cursor-pointer -mx-2 px-2 rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] ${isEditing ? 'bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]' : ''}`}
                                    >
                                        <div className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--color-m3-outline)] dark:bg-[var(--color-m3-dark-outline)]" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-medium text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] truncate text-sm">
                                                    {ev.route === Route.patchRemove ? t('route.patchRemove') : t(`ester.${ev.ester}`)}
                                                </span>
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

                                    <div className={`grid ${isEditing ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
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
