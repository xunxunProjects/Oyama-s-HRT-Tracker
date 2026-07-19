import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Clock3 } from 'lucide-react';
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

type DatePart = 'year' | 'month' | 'day' | 'hour' | 'minute';

const DateTimePicker: React.FC<DateTimePickerProps> = ({
    isOpen,
    onClose,
    onConfirm,
    initialDate,
    mode = 'datetime',
    title,
    inline = false,
}) => {
    const { t } = useTranslation();
    useEscape(onClose, isOpen);

    const [selectedDate, setSelectedDate] = useState(initialDate || new Date());
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});
    const containerRef = useRef<HTMLDivElement>(null);
    const anchorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (typeof document !== 'undefined') setPortalTarget(document.body);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const candidate = initialDate ? new Date(initialDate) : new Date();
        setSelectedDate(Number.isNaN(candidate.getTime()) ? new Date() : candidate);
    }, [isOpen, initialDate]);

    useLayoutEffect(() => {
        if (!isOpen || inline) return;

        const updatePosition = () => {
            if (window.innerWidth < 768) {
                setPositionStyle({});
                return;
            }
            setPositionStyle({
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 440,
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        return () => window.removeEventListener('resize', updatePosition);
    }, [isOpen, inline]);

    const currentYear = new Date().getFullYear();
    const years = useMemo(() => {
        const first = Math.min(1900, selectedDate.getFullYear());
        const last = Math.max(currentYear + 10, selectedDate.getFullYear());
        return Array.from({ length: last - first + 1 }, (_, index) => first + index);
    }, [currentYear, selectedDate]);

    const months = useMemo(() => (
        Array.from({ length: 12 }, (_, month) => ({
            value: month,
            label: new Date(2020, month, 1).toLocaleDateString(undefined, { month: 'long' }),
        }))
    ), []);

    const daysInSelectedMonth = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth() + 1,
        0,
    ).getDate();

    const days = Array.from({ length: daysInSelectedMonth }, (_, index) => index + 1);
    const hours = Array.from({ length: 24 }, (_, index) => index);
    const minutes = Array.from({ length: 60 }, (_, index) => index);

    const setPart = (part: DatePart, value: number) => {
        setSelectedDate(previous => {
            const next = new Date(previous);

            if (part === 'year' || part === 'month') {
                const originalDay = next.getDate();
                next.setDate(1);
                if (part === 'year') next.setFullYear(value);
                else next.setMonth(value);
                const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(originalDay, maxDay));
            } else if (part === 'day') {
                next.setDate(value);
            } else if (part === 'hour') {
                next.setHours(value);
            } else {
                next.setMinutes(value);
            }

            next.setSeconds(0, 0);
            return next;
        });
    };

    const selectClass = 'w-full min-h-11 rounded-lg border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-white dark:bg-neutral-900 px-2.5 py-2 text-sm tabular-nums text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] outline-none focus:border-[var(--color-m3-primary)] focus:ring-1 focus:ring-[var(--color-m3-primary)]/20';
    const labelClass = 'block mb-1.5 text-xs font-medium text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';

    const renderSelect = (
        label: string,
        part: DatePart,
        value: number,
        options: Array<{ value: number; label: string }>,
    ) => (
        <label className="min-w-0">
            <span className={labelClass}>{label}</span>
            <select
                aria-label={label}
                value={value}
                onChange={event => setPart(part, Number(event.target.value))}
                className={selectClass}
            >
                {options.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        </label>
    );

    if (!isOpen) return inline ? null : <div ref={anchorRef} className="hidden" />;
    if (!inline && !portalTarget) return <div ref={anchorRef} className="hidden" />;

    const showDate = mode !== 'time';
    const showTime = mode !== 'date';
    const dateSummary = selectedDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const timeSummary = selectedDate.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    const inner = (
        <div className={inline ? 'rounded-xl border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)]' : ''}>
            <div className="px-5 pt-5 pb-4 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                {title && (
                    <p className="text-sm font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] mb-1">
                        {title}
                    </p>
                )}
                <p className="text-sm tabular-nums text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                    {[showDate ? dateSummary : null, showTime ? timeSummary : null].filter(Boolean).join(' · ')}
                </p>
            </div>

            <div className="px-5 py-5 space-y-5">
                {showDate && (
                    <section>
                        <div className="flex items-center gap-2 mb-3 text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                            <CalendarDays size={16} />
                            <span className="text-sm font-medium">{t('date.select')}</span>
                        </div>
                        <div className="grid grid-cols-[1.05fr_1.35fr_0.8fr] gap-2.5">
                            {renderSelect(
                                t('time.year'),
                                'year',
                                selectedDate.getFullYear(),
                                years.map(year => ({ value: year, label: String(year) })),
                            )}
                            {renderSelect(t('time.month'), 'month', selectedDate.getMonth(), months)}
                            {renderSelect(
                                t('time.day'),
                                'day',
                                selectedDate.getDate(),
                                days.map(day => ({ value: day, label: String(day).padStart(2, '0') })),
                            )}
                        </div>
                    </section>
                )}

                {showTime && (
                    <section>
                        <div className="flex items-center gap-2 mb-3 text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                            <Clock3 size={16} />
                            <span className="text-sm font-medium">{t('time.select')}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            {renderSelect(
                                t('time.hour'),
                                'hour',
                                selectedDate.getHours(),
                                hours.map(hour => ({ value: hour, label: String(hour).padStart(2, '0') })),
                            )}
                            {renderSelect(
                                t('time.minute'),
                                'minute',
                                selectedDate.getMinutes(),
                                minutes.map(minute => ({ value: minute, label: String(minute).padStart(2, '0') })),
                            )}
                        </div>
                    </section>
                )}
            </div>

            <div className="px-5 pb-5 pt-3 flex justify-end gap-2 border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 text-sm font-medium rounded-md text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]"
                >
                    {t('btn.cancel')}
                </button>
                <button
                    type="button"
                    onClick={() => onConfirm(selectedDate)}
                    className="px-5 py-2.5 text-sm font-medium rounded-md bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white"
                >
                    {t('btn.ok')}
                </button>
            </div>
        </div>
    );

    if (inline) return <div className="mt-2 mb-3">{inner}</div>;

    return (
        <>
            <div ref={anchorRef} className="hidden" />
            {createPortal(
                <>
                    <button
                        type="button"
                        aria-label={t('btn.cancel')}
                        onClick={onClose}
                        className="fixed inset-0 z-[60] bg-black/30 dark:bg-black/50"
                    />
                    <div
                        ref={containerRef}
                        style={positionStyle}
                        className={`fixed z-[70] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] overflow-hidden shadow-[var(--shadow-m3-3)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] ${Object.keys(positionStyle).length > 0 ? 'rounded-[var(--radius-xl)]' : 'bottom-0 left-0 right-0 w-full rounded-t-[var(--radius-xl)] border-b-0'}`}
                    >
                        {inner}
                    </div>
                </>,
                portalTarget,
            )}
        </>
    );
};

export default DateTimePicker;
