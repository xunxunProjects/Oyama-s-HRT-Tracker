import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ChevronDown, Check, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { useEscape } from '../hooks/useEscape';

interface DateTimePickerProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (date: Date) => void;
    initialDate?: Date;
    mode?: 'datetime' | 'date' | 'time';
    title?: string;
}

const DateTimePicker: React.FC<DateTimePickerProps> = ({
    isOpen,
    onClose,
    onConfirm,
    initialDate,
    mode = 'datetime',
    title
}) => {
    const { t } = useTranslation();
    useEscape(onClose, isOpen);
    const [selectedDate, setSelectedDate] = useState(initialDate || new Date());
    const [view, setView] = useState<'date' | 'time'>(mode === 'time' ? 'time' : 'date');
    const [currentMonth, setCurrentMonth] = useState(initialDate || new Date());
    const containerRef = useRef<HTMLDivElement>(null);
    const anchorRef = useRef<HTMLDivElement>(null);
    const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    const [openTimeSelect, setOpenTimeSelect] = useState<'hour' | 'minute' | null>(null);

    useEffect(() => {
        if (typeof document !== 'undefined') {
            setPortalTarget(document.body);
        }
    }, []);

    useLayoutEffect(() => {
        if (isOpen && anchorRef.current) {
            const updatePosition = () => {
                const isMobile = window.innerWidth < 768;
                if (isMobile) {
                    setPositionStyle({});
                    return;
                }
                const trigger = anchorRef.current?.previousElementSibling;
                if (trigger) {
                    const rect = trigger.getBoundingClientRect();
                    setPositionStyle({
                        top: rect.bottom + 8,
                        left: rect.left,
                        width: 320,
                    });
                }
            };
            updatePosition();
            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, { capture: true, passive: true });
            return () => {
                window.removeEventListener('resize', updatePosition);
                window.removeEventListener('scroll', updatePosition, { capture: true });
            };
        }
    }, [isOpen, onClose]);

    useEffect(() => {
        if (isOpen) {
            const d = initialDate ? new Date(initialDate) : new Date();
            setSelectedDate(d);
            setCurrentMonth(d);
            setView(mode === 'time' ? 'time' : 'date');
        }
    }, [isOpen, initialDate, mode]);

    if (!isOpen) return <div ref={anchorRef} className="hidden" />;

    // Fallback: If portal target is not ready yet, return anchor to prevent crash
    if (!portalTarget) return <div ref={anchorRef} className="hidden" />;

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const renderCalendar = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        const days = [];

        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-9 w-9" />);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const isSelected =
                date.getDate() === selectedDate.getDate() &&
                date.getMonth() === selectedDate.getMonth() &&
                date.getFullYear() === selectedDate.getFullYear();

            const isToday =
                d === new Date().getDate() &&
                month === new Date().getMonth() &&
                year === new Date().getFullYear();

            days.push(
                <button
                    key={d}
                    onClick={() => {
                        const newDate = new Date(selectedDate);
                        newDate.setFullYear(year);
                        newDate.setMonth(month);
                        newDate.setDate(d);
                        setSelectedDate(newDate);
                        if (mode === 'datetime') {
                            setView('time');
                        }
                    }}
                    className={`h-9 w-9 flex items-center justify-center rounded-[var(--radius-full)] text-xs font-bold transition-all duration-200
                        ${isSelected
                            ? 'bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] font-bold shadow-md'
                            : isToday
                                ? 'bg-[var(--color-m3-primary-container)] dark:bg-teal-900/30 text-[var(--color-m3-primary)] dark:text-teal-400 font-bold'
                                : 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container-high)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)]'
                        }
                    `}
                >
                    {d}
                </button>
            );
        }
        return days;
    };

    const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 60 }, (_, i) => i);

    return (
        <>
            <div ref={anchorRef} className="hidden" />
            {createPortal(
                <>
                    <div
                        className="fixed inset-0 z-[60] bg-black/20 dark:bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-200"
                    />
                    <div
                        ref={containerRef}
                        style={positionStyle}
                        className={`fixed z-[70] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] overflow-hidden shadow-[var(--shadow-m3-3)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]
                            ${Object.keys(positionStyle).length > 0
                                ? 'rounded-[var(--radius-xl)] animate-in fade-in slide-in-from-top-2 duration-200' // Desktop
                                : 'bottom-0 left-0 right-0 w-full rounded-t-[var(--radius-xl)] border-t border-b-0 animate-in slide-in-from-bottom duration-300' // Mobile
                            }
                        `}
                    >
                        <div className="pt-5 px-5 pb-2 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] flex justify-between items-start">
                            <div>
                                <div className="flex items-baseline gap-2">
                                    {mode !== 'time' && (
                                        <button
                                            onClick={() => setView('date')}
                                            className={`text-xl font-bold font-display tracking-tight transition-colors ${view === 'date' ? 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]' : 'text-[var(--color-m3-outline)] dark:text-[var(--color-m3-dark-outline)]'}`}
                                        >
                                            {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })}
                                        </button>
                                    )}
                                    {mode !== 'date' && (
                                        <button
                                            onClick={() => setView('time')}
                                            className={`text-xl font-bold font-mono tracking-tight transition-colors ${view === 'time' ? 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]' : 'text-[var(--color-m3-outline)] dark:text-[var(--color-m3-dark-outline)]'}`}
                                        >
                                            {selectedDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 px-5">
                            {view === 'date' && (
                                <div className="h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <button onClick={prevMonth} className="p-2 hover:bg-[var(--color-m3-surface-container-high)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] rounded-[var(--radius-full)] transition text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                            <ChevronLeft size={18} />
                                        </button>
                                        <span className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-base">
                                            {currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                        </span>
                                        <button onClick={nextMonth} className="p-2 hover:bg-[var(--color-m3-surface-container-high)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] rounded-[var(--radius-full)] transition text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-7 mb-2 text-center">
                                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                                            <span key={d} className="text-[10px] font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] w-10 block mx-auto">{d}</span>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-7 gap-y-1 justify-items-center mt-2">
                                        {renderCalendar()}
                                    </div>
                                </div>
                            )}

                            {view === 'time' && (
                                <div className="h-[18rem] relative animate-in fade-in slide-in-from-right-4 duration-300">
                                    {/* Selection Row */}
                                    <div className="flex items-center justify-center gap-4 h-full">
                                        {/* Hour Button */}
                                        <button
                                            onClick={() => setOpenTimeSelect(openTimeSelect === 'hour' ? null : 'hour')}
                                            className={`flex items-center justify-between w-24 px-3 py-2 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-high)] border rounded-[var(--radius-md)] transition-all
                                            ${openTimeSelect === 'hour' ? 'border-[var(--color-m3-primary)] dark:border-teal-400 ring-1 ring-[var(--color-m3-primary)] dark:ring-teal-400' : 'border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] hover:border-[var(--color-m3-primary)]'}
                                        `}
                                        >
                                            <span className="text-2xl font-mono font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                                                {selectedDate.getHours().toString().padStart(2, '0')}
                                            </span>
                                            <ChevronDown size={16} className={`text-[var(--color-m3-on-surface-variant)] transition-transform ${openTimeSelect === 'hour' ? 'rotate-180' : ''}`} />
                                        </button>

                                        <span className="text-2xl font-bold text-[var(--color-m3-outline)] dark:text-[var(--color-m3-dark-outline)]">:</span>

                                        {/* Minute Button */}
                                        <button
                                            onClick={() => setOpenTimeSelect(openTimeSelect === 'minute' ? null : 'minute')}
                                            className={`flex items-center justify-between w-24 px-3 py-2 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-high)] border rounded-[var(--radius-md)] transition-all
                                            ${openTimeSelect === 'minute' ? 'border-[var(--color-m3-primary)] dark:border-teal-400 ring-1 ring-[var(--color-m3-primary)] dark:ring-teal-400' : 'border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] hover:border-[var(--color-m3-primary)]'}
                                        `}
                                        >
                                            <span className="text-2xl font-mono font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                                                {selectedDate.getMinutes().toString().padStart(2, '0')}
                                            </span>
                                            <ChevronDown size={16} className={`text-[var(--color-m3-on-surface-variant)] transition-transform ${openTimeSelect === 'minute' ? 'rotate-180' : ''}`} />
                                        </button>
                                    </div>

                                    {/* Overlays for Dropdown Options */}
                                    {openTimeSelect && (
                                        <div className="absolute inset-x-0 bottom-0 top-0 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] z-10 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-200 border rounded-[var(--radius-md)] border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] shadow-[var(--shadow-m3-1)]">
                                            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)]">
                                                <span className="text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">
                                                    {openTimeSelect === 'hour' ? 'Select Hour' : 'Select Minute'}
                                                </span>
                                                <button onClick={() => setOpenTimeSelect(null)} className="p-1 hover:bg-[var(--color-m3-surface-container-high)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] rounded-[var(--radius-full)] transition"><X size={14} className="text-[var(--color-m3-on-surface-variant)]" /></button>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-2 scrollbar-hide grid grid-cols-4 gap-2 content-start">
                                                {(openTimeSelect === 'hour' ? hours : minutes).map(val => (
                                                    <button
                                                        key={val}
                                                        onClick={() => {
                                                            const d = new Date(selectedDate);
                                                            if (openTimeSelect === 'hour') d.setHours(val);
                                                            else d.setMinutes(val);
                                                            setSelectedDate(d);
                                                            setOpenTimeSelect(null);
                                                        }}
                                                        className={`h-10 rounded-[var(--radius-sm)] font-mono font-bold text-sm flex items-center justify-center transition-colors
                                                     ${(openTimeSelect === 'hour' ? selectedDate.getHours() : selectedDate.getMinutes()) === val
                                                                ? 'bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] shadow-sm'
                                                                : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:bg-[var(--color-m3-surface-container-high)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)]'
                                                            }
                                                 `}
                                                    >
                                                        {val.toString().padStart(2, '0')}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="px-5 pb-5 pt-2 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] flex gap-3 safe-area-pb">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3.5 bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-highest)] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] font-bold rounded-[var(--radius-full)] hover:bg-[var(--color-m3-surface-container-highest)] transition text-sm flex items-center justify-center gap-2"
                            >
                                <X size={18} />
                                {t('btn.cancel')}
                            </button>
                            <button
                                onClick={() => onConfirm(selectedDate)}
                                className="flex-1 py-3.5 bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] font-bold rounded-[var(--radius-full)] transition shadow-[var(--shadow-m3-1)] text-sm"
                            >
                                {t('btn.ok') || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </>,
                portalTarget
            )}
        </>
    );
};

export default DateTimePicker;
