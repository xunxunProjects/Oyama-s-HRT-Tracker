import React from 'react';
import { Activity, Plus } from 'lucide-react';
import { DoseEvent, Route, Ester, ExtraKey, getToE2Factor } from '../../logic';
import { formatTime, getRouteIcon } from '../utils/helpers'; // Need to check if helper is available
import DoseForm from '../components/DoseForm';
import { DoseTemplate } from '../components/DoseFormModal';

interface HistoryProps {
    t: (key: string) => string;
    isQuickAddOpen: boolean;
    setIsQuickAddOpen: (isOpen: boolean) => void;
    doseTemplates: DoseTemplate[];
    onSaveEvent: (e: DoseEvent) => void;
    onDeleteEvent: (id: string) => void;
    onSaveTemplate: (t: DoseTemplate) => void;
    onDeleteTemplate: (id: string) => void;
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
    groupedEvents,
    onEditEvent
}) => {
    return (
        <div className="relative space-y-6 pt-6 pb-24">
            <div className="px-6 md:px-10">
                <div className="w-full p-5 rounded-[24px] bg-white dark:bg-zinc-900 flex items-center justify-between shadow-sm shadow-zinc-200/50 dark:shadow-none border border-zinc-100 dark:border-zinc-800 transition-colors duration-300">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-pink-50 dark:bg-pink-900/20 rounded-2xl text-[#f6c4d7]">
                            <Activity size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight leading-tight">
                                {t('timeline.title')}
                            </h2>
                            <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 mt-0.5">
                                {(Object.values(groupedEvents) as DoseEvent[][]).reduce((acc, curr) => acc + curr.length, 0)} {t('timeline.records')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                        className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-white dark:text-zinc-900 shadow-md transition-all ${isQuickAddOpen ? 'bg-zinc-500 dark:bg-zinc-400 rotate-45' : 'bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white'}`}
                    >
                        <Plus size={20} />
                    </button>
                </div>
            </div>

            {isQuickAddOpen && (
                <div className="mx-6 md:mx-10 mb-6 animate-in slide-in-from-top-4 fade-in duration-300">
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
            )}

            {Object.keys(groupedEvents).length === 0 && (
                <div className="mx-6 md:mx-10 text-center py-20 text-zinc-400 dark:text-zinc-500 bg-white dark:bg-zinc-900 rounded-[24px] border border-dashed border-zinc-200 dark:border-zinc-800 transition-colors">
                    <p className="font-medium">{t('timeline.empty')}</p>
                </div>
            )}

            <div className="mx-6 md:mx-10 bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 overflow-hidden transition-colors duration-300">
                {Object.entries(groupedEvents).map(([date, items], index) => (
                    <div key={date} className={`${index !== 0 ? 'border-t border-zinc-100 dark:border-zinc-800' : ''}`}>
                        <div className="sticky top-0 bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur-sm py-3 px-6 z-10 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 transition-colors">
                            <div className="w-1.5 h-1.5 rounded-full bg-pink-400"></div>
                            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{date}</span>
                        </div>
                        <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                            {(items as DoseEvent[]).map(ev => (
                                <div
                                    key={ev.id}
                                    onClick={() => onEditEvent(ev)}
                                    className="p-4 md:p-5 flex items-center gap-4 md:gap-5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all cursor-pointer group"
                                >
                                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0 ${ev.route === Route.injection ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-500 dark:text-pink-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'} transition-colors`}>
                                        {getRouteIcon(ev.route)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-zinc-900 dark:text-white text-sm truncate">
                                                {ev.route === Route.patchRemove ? t('route.patchRemove') : t(`ester.${ev.ester}`)}
                                            </span>
                                            <span className="font-mono text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
                                                {formatTime(new Date(ev.timeH * 3600000))}
                                            </span>
                                        </div>
                                        <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate">{t(`route.${ev.route}`)}</span>
                                                {ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                    <>
                                                        <span className="text-zinc-300 dark:text-zinc-600">•</span>
                                                        <span className="text-zinc-700 dark:text-zinc-300">{`${ev.extras[ExtraKey.releaseRateUGPerDay]} µg/d`}</span>
                                                    </>
                                                )}
                                            </div>
                                            {ev.route !== Route.patchRemove && !ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-zinc-700 dark:text-zinc-300">
                                                    <span>{`${ev.doseMG.toFixed(2)} mg`}</span>
                                                    {ev.ester !== Ester.E2 && ev.ester !== Ester.CPA && (
                                                        <span className="text-zinc-400 dark:text-zinc-500 text-[10px]">
                                                            {`(${t('label.e2')} eq: ${(ev.doseMG * getToE2Factor(ev.ester)).toFixed(2)} mg)`}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
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
