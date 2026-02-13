import React from 'react';
import { Activity, Plus } from 'lucide-react';
import { DoseEvent, Route, Ester, ExtraKey, getToE2Factor } from '../../logic';
import { formatTime, getRouteIcon } from '../utils/helpers';
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
                <div className="w-full p-5 rounded-[var(--radius-xl)] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] flex items-center justify-between shadow-[var(--shadow-m3-1)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] transition-all duration-300 m3-surface-tint">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-[var(--color-m3-accent-container)] dark:bg-rose-900/20 rounded-[var(--radius-lg)] text-[var(--color-m3-accent-light)]">
                            <Activity size={24} />
                        </div>
                        <div>
                            <h2 className="font-display text-lg font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tight leading-tight">
                                {t('timeline.title')}
                            </h2>
                            <p className="text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-0.5">
                                {(Object.values(groupedEvents) as DoseEvent[][]).reduce((acc, curr) => acc + curr.length, 0)} {t('timeline.records')}
                            </p>
                        </div>
                    </div>
                    {/* M3 FAB Small */}
                    <button
                        onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                        className={`inline-flex items-center justify-center w-11 h-11 rounded-[var(--radius-lg)] shadow-[var(--shadow-m3-2)] transition-all duration-500 m3-state-layer ${isQuickAddOpen
                            ? 'bg-[var(--color-m3-surface-container-highest)] dark:bg-[var(--color-m3-dark-surface-container-highest)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] rotate-45'
                            : 'bg-[var(--color-m3-primary-container)] dark:bg-teal-900/40 text-[var(--color-m3-primary)] dark:text-teal-400 hover:shadow-[var(--shadow-m3-3)]'
                            }`}
                    >
                        <Plus size={20} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {isQuickAddOpen && (
                <div className="mx-6 md:mx-10 mb-6 animate-m3-container">
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
                <div className="mx-6 md:mx-10 text-center py-20 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] border border-dashed border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] transition-colors">
                    <p className="font-semibold">{t('timeline.empty')}</p>
                </div>
            )}

            <div className="mx-6 md:mx-10 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] overflow-hidden transition-colors duration-300">
                {Object.entries(groupedEvents).map(([date, items], index) => (
                    <div key={date} className={`${index !== 0 ? 'border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]' : ''}`}>
                        <div className="sticky top-0 bg-[var(--color-m3-surface-container-low)]/95 dark:bg-[var(--color-m3-dark-surface-container)]/95 backdrop-blur-sm py-3 px-6 z-10 flex items-center gap-2 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] transition-colors">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-m3-primary)] dark:bg-teal-400" />
                            <span className="text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">{date}</span>
                        </div>
                        <div className="divide-y divide-[var(--color-m3-surface-container)] dark:divide-[var(--color-m3-dark-surface-container-high)]/50">
                            {(items as DoseEvent[]).map(ev => (
                                <div
                                    key={ev.id}
                                    onClick={() => onEditEvent(ev)}
                                    className="p-4 md:p-5 flex items-center gap-4 md:gap-5 hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]/50 transition-all cursor-pointer group"
                                >
                                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-[var(--radius-full)] flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105 ${ev.route === Route.injection
                                        ? 'bg-[var(--color-m3-accent-container)] dark:bg-rose-900/20 text-[var(--color-m3-accent)] dark:text-rose-400'
                                        : 'bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]'
                                        }`}>
                                        {getRouteIcon(ev.route)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm truncate">
                                                {ev.route === Route.patchRemove ? t('route.patchRemove') : t(`ester.${ev.ester}`)}
                                            </span>
                                            <span className="font-mono text-[10px] font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                                {formatTime(new Date(ev.timeH * 3600000))}
                                            </span>
                                        </div>
                                        <div className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] font-medium space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate">{t(`route.${ev.route}`)}</span>
                                                {ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                    <>
                                                        <span className="text-[var(--color-m3-outline)] dark:text-[var(--color-m3-dark-outline)]">•</span>
                                                        <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{`${ev.extras[ExtraKey.releaseRateUGPerDay]} µg/d`}</span>
                                                    </>
                                                )}
                                            </div>
                                            {ev.route !== Route.patchRemove && !ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                                                    <span>{`${ev.doseMG.toFixed(2)} mg`}</span>
                                                    {ev.ester !== Ester.E2 && ev.ester !== Ester.CPA && (
                                                        <span className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] text-[10px]">
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
