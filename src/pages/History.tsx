import React, { useState } from 'react';
import { Activity, Plus } from 'lucide-react';
import { DoseEvent, Route, Ester, ExtraKey, getToE2Factor } from '../../logic';
import { formatTime, getRouteIcon } from '../utils/helpers';
import DoseForm from '../components/DoseForm';
import { DoseTemplate } from '../components/DoseFormModal';
import { QuickDose } from '../components/dose_form/QuickDoseButtons';

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
        <div className="relative space-y-6 pt-6 pb-24">
            <div className="px-6 md:px-8">
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg flex items-center justify-between p-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-pink-50 dark:bg-pink-900/20 text-pink-500 dark:text-pink-400 rounded-lg">
                            <Activity size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                {t('timeline.title')}
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {(Object.values(groupedEvents) as DoseEvent[][]).reduce((acc, curr) => acc + curr.length, 0)} {t('timeline.records')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                        className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${isQuickAddOpen
                            ? 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300 rotate-45'
                            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                            }`}
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </div>

            {isQuickAddOpen && (
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
                        onAddQuickDose={onAddQuickDose}
                        onDeleteQuickDose={onDeleteQuickDose}
                        isInline={true}
                    />
                </div>
            )}

            {Object.keys(groupedEvents).length === 0 && (
                <div className="mx-6 md:mx-8 text-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-neutral-900 rounded-lg border border-dashed border-gray-300 dark:border-neutral-700">
                    <p className="text-sm font-medium">{t('timeline.empty')}</p>
                </div>
            )}

            <div className="mx-6 md:mx-8 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden text-sm">
                {Object.entries(groupedEvents).map(([date, items], index) => (
                    <div key={date} className={`${index !== 0 ? 'border-t border-gray-200 dark:border-neutral-800' : ''}`}>
                        <div className="sticky top-0 bg-gray-50/95 dark:bg-neutral-900/95 backdrop-blur-sm py-2 px-5 z-10 flex items-center gap-2 border-b border-gray-200 dark:border-neutral-800">
                            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">{date}</span>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                            {(items as DoseEvent[]).map(ev => (
                                <div key={ev.id} className={`flex flex-col ${editingId === ev.id ? 'bg-gray-50/30 dark:bg-neutral-800/30 border-y border-teal-100 dark:border-teal-900/30 first:border-t-0' : ''}`}>
                                    <div
                                        onClick={() => setEditingId(editingId === ev.id ? null : ev.id)}
                                        className={`p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer group ${editingId === ev.id ? 'pb-2' : ''}`}
                                    >
                                        <div className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${ev.route === Route.injection
                                            ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400'
                                            : 'bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400'
                                            }`}>
                                            {getRouteIcon(ev.route)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm">
                                                    {ev.route === Route.patchRemove ? t('route.patchRemove') : t(`ester.${ev.ester}`)}
                                                </span>
                                                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                                                    {formatTime(new Date(ev.timeH * 3600000))}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate">{t(`route.${ev.route}`)}</span>
                                                    {ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                        <>
                                                            <span className="text-gray-300 dark:text-neutral-600">•</span>
                                                            <span className="text-gray-700 dark:text-gray-300">{`${ev.extras[ExtraKey.releaseRateUGPerDay]} µg/d`}</span>
                                                        </>
                                                    )}
                                                </div>
                                                {ev.route !== Route.patchRemove && !ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                    <div className="flex flex-wrap items-baseline gap-x-2 text-gray-700 dark:text-gray-300">
                                                        <span className="font-semibold">{`${ev.doseMG.toFixed(2)} mg`}</span>
                                                        {ev.ester !== Ester.E2 && ev.ester !== Ester.CPA && (
                                                            <span className="text-gray-400 dark:text-gray-500 text-[10px] lowercase font-normal">
                                                                {`(${t('label.e2')} eq: ${(ev.doseMG * getToE2Factor(ev.ester)).toFixed(2)} mg)`}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {editingId === ev.id && (
                                        <div className="px-4 pb-4">
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
                                                onAddQuickDose={onAddQuickDose}
                                                onDeleteQuickDose={onDeleteQuickDose}
                                                isInline={true}
                                                hideHeader={true}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

        </div>
    );
};

export default History;
