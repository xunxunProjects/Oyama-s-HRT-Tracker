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
    inline?: boolean;
}

const DateTimePicker: React.FC<DateTimePickerProps> = ({
    isOpen,
    onClose,
    onConfirm,
    initialDate,
    mode = 'datetime',
    title,
    inline = false
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
                setPositionStyle({
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 360,
                });
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

    if (!isOpen) return inline ? null : <div ref={anchorRef} className="hidden" />;

    // Fallback: If portal target is not ready yet, return anchor to prevent crash
    if (!inline && !portalTarget) return <div ref={anchorRef} className="hidden" />;

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
                    className={`h-9 w-9 flex items-center justify-center rounded-full text-sm tabular-nums
                        ${isSelected
                            ? 'bg-[var(--color-m3-primary)] text-white font-medium'
                            : isToday
                                ? 'text-[var(--color-m3-primary)] font-semibold ring-1 ring-inset ring-[var(--color-m3-primary)]/40'
                                : 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]'
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

    const inner = (
        <>
                        <div className="pt-5 px-5 pb-3 flex items-center gap-5 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                            {mode !== 'time' && (
                                <button
                                    onClick={() => setView('date')}
                                    className={`text-lg tracking-tight pb-1 border-b-2 -mb-[13px] ${view === 'date' ? 'font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] border-[var(--color-m3-primary)]' : 'font-medium text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] border-transparent'}`}
                                >
                                    {selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                </button>
                            )}
                            {mode !== 'date' && (
                                <button
                                    onClick={() => setView('time')}
                                    className={`text-lg tabular-nums tracking-tight pb-1 border-b-2 -mb-[13px] ${view === 'time' ? 'font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] border-[var(--color-m3-primary)]' : 'font-medium text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] border-transparent'}`}
                                >
                                    {selectedDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </button>
                            )}
                        </div>

                        <div className="p-4 px-5">
                            {view === 'date' && (
                                <div className="h-full flex flex-col">
                                    <div className="flex items-center justify-between mb-3">
                                        <button onClick={prevMonth} className="p-2 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)] rounded-lg text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                            <ChevronLeft size={18} />
                                        </button>
                                        <span className="font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">
                                            {currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                        </span>
                                        <button onClick={nextMonth} className="p-2 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)] rounded-lg text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-7 mb-1 text-center">
                                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                            <span key={i} className="text-[11px] font-medium text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] w-9 block mx-auto">{d}</span>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-7 gap-y-1 justify-items-center mt-1">
                                        {renderCalendar()}
                                    </div>
                                </div>
                            )}

                            {view === 'time' && (
                                <div className="h-[16rem] relative">
                                    {/* Selection Row */}
                                    <div className="flex items-center justify-center gap-2 h-full">
                                        {/* Hour Button */}
                                        <button
                                            onClick={() => setOpenTimeSelect(openTimeSelect === 'hour' ? null : 'hour')}
                                            className={`text-5xl tabular-nums font-light w-24 text-center pb-1 border-b-2 ${
                                                openTimeSelect === 'hour'
                                                    ? 'text-[var(--color-m3-primary)] border-[var(--color-m3-primary)]'
                                                    : 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] border-transparent hover:border-[var(--color-m3-outline-variant)] dark:hover:border-[var(--color-m3-dark-outline-variant)]'
                                            }`}
                                        >
                                            {selectedDate.getHours().toString().padStart(2, '0')}
                                        </button>

                                        <span className="text-4xl font-light text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] pb-2">:</span>

                                        {/* Minute Button */}
                                        <button
                                            onClick={() => setOpenTimeSelect(openTimeSelect === 'minute' ? null : 'minute')}
                                            className={`text-5xl tabular-nums font-light w-24 text-center pb-1 border-b-2 ${
                                                openTimeSelect === 'minute'
                                                    ? 'text-[var(--color-m3-primary)] border-[var(--color-m3-primary)]'
                                                    : 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] border-transparent hover:border-[var(--color-m3-outline-variant)] dark:hover:border-[var(--color-m3-dark-outline-variant)]'
                                            }`}
                                        >
                                            {selectedDate.getMinutes().toString().padStart(2, '0')}
                                        </button>
                                    </div>

                                    {/* Overlays for Dropdown Options */}
                                    {openTimeSelect && (
                                        <div className="absolute inset-0 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] z-10 flex flex-col">
                                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                                                <span className="text-sm font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                                    {openTimeSelect === 'hour' ? (t('time.select_hour') || 'Select Hour') : (t('time.select_minute') || 'Select Minute')}
                                                </span>
                                                <button onClick={() => setOpenTimeSelect(null)} className="p-1 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)] rounded-lg"><X size={14} className="text-[var(--color-m3-on-surface-variant)]" /></button>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-2 scrollbar-hide grid grid-cols-4 gap-1.5 content-start">
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
                                                        className={`h-9 rounded-md tabular-nums text-sm flex items-center justify-center
                                                     ${(openTimeSelect === 'hour' ? selectedDate.getHours() : selectedDate.getMinutes()) === val
                                                                ? 'bg-[var(--color-m3-primary)] text-white font-medium'
                                                                : 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]'
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

                        <div className="px-5 pb-5 pt-2 flex gap-2 justify-end safe-area-pb border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] mt-1">
                            <button
                                onClick={onClose}
                                className="px-4 py-2.5 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] font-medium rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)] text-sm"
                            >
                                {t('btn.cancel')}
                            </button>
                            <button
                                onClick={() => onConfirm(selectedDate)}
                                className="px-5 py-2.5 bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white font-medium rounded-md text-sm"
                            >
                                {t('btn.ok') || 'Confirm'}
                            </button>
                        </div>
        </>
    );

    // Inline mode: render in-flow below the trigger (no portal, no backdrop, no card)
    if (inline) {
        return (
            <div className="mt-1 mb-2">
                {inner}
            </div>
        );
    }

    return (
        <>
            <div ref={anchorRef} className="hidden" />
            {createPortal(
                <>
                    <div
                        className="fixed inset-0 z-[60] bg-black/30 dark:bg-black/50"
                    />
                    <div
                        ref={containerRef}
                        style={positionStyle}
                        className={`fixed z-[70] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] overflow-hidden shadow-[var(--shadow-m3-3)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]
                            ${Object.keys(positionStyle).length > 0
                                ? 'rounded-[var(--radius-xl)]' // Desktop
                                : 'bottom-0 left-0 right-0 w-full rounded-t-[var(--radius-xl)] border-t border-b-0' // Mobile
                            }
                        `}
                    >
                        {inner}
                    </div>
                </>,
                portalTarget
            )}
        </>
    );
};

export default DateTimePicker;
