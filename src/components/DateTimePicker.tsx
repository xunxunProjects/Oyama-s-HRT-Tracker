import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Clock3, ChevronDown, Check } from 'lucide-react';
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

interface PartOption {
    value: number;
    label: string;
}

interface PartSelectProps {
    label: string;
    value: number;
    options: PartOption[];
    onChange: (value: number) => void;
}

const PartSelect: React.FC<PartSelectProps> = ({ label, value, options, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});

    useEffect(() => {
        if (typeof document !== 'undefined') setPortalTarget(document.body);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (
                (triggerRef.current && triggerRef.current.contains(event.target as Node)) ||
                (listRef.current && listRef.current.contains(event.target as Node))
            ) return;
            setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    useLayoutEffect(() => {
        if (!isOpen || !triggerRef.current) return;

        const updatePosition = () => {
            const rect = triggerRef.current!.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const flip = spaceBelow < 160 && spaceAbove > spaceBelow;
            const maxHeight = Math.max(120, Math.min(240, (flip ? spaceAbove : spaceBelow) - 16));
            const width = Math.max(rect.width, 72);

            if (flip) {
                setPositionStyle({ bottom: window.innerHeight - rect.top + 4, left: rect.left, width, maxHeight });
            } else {
                setPositionStyle({ top: rect.bottom + 4, left: rect.left, width, maxHeight });
            }
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, { capture: true, passive: true });
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, { capture: true });
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const el = listRef.current?.querySelector('[data-selected="true"]') as HTMLElement | null;
        el?.scrollIntoView({ block: 'center' });
    }, [isOpen]);

    const selected = options.find(option => option.value === value);

    return (
        <div className="relative">
            <button
                type="button"
                ref={triggerRef}
                onClick={() => setIsOpen(open => !open)}
                aria-label={label}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                className={`w-full min-h-11 flex items-center justify-between gap-1 rounded-lg border px-2.5 py-2 text-sm tabular-nums outline-none transition-colors motion-reduce:transition-none
                    bg-white dark:bg-neutral-900 text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]
                    ${isOpen
                        ? 'border-[var(--color-m3-primary)] ring-1 ring-[var(--color-m3-primary)]/20'
                        : 'border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] hover:border-[var(--color-m3-outline)] dark:hover:border-[var(--color-m3-dark-outline)]'}`}
            >
                <span className="truncate">{selected?.label ?? value}</span>
                <ChevronDown
                    size={14}
                    className={`shrink-0 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && portalTarget && createPortal(
                <div
                    ref={listRef}
                    role="listbox"
                    aria-label={label}
                    style={positionStyle}
                    className="dropdown-in fixed z-[80] overflow-y-auto rounded-lg border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-white dark:bg-neutral-900 shadow-[var(--shadow-m3-3)] py-1"
                >
                    {options.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={option.value === value}
                            data-selected={option.value === value}
                            onClick={() => { onChange(option.value); setIsOpen(false); }}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-start tabular-nums
                                ${option.value === value
                                    ? 'bg-[var(--color-m3-primary-container)] dark:bg-[var(--color-m3-dark-primary-container)] text-[var(--color-m3-on-primary-container)] dark:text-[var(--color-m3-dark-on-primary-container)] font-medium'
                                    : 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]'}`}
                        >
                            <span>{option.label}</span>
                            {option.value === value && <Check size={14} className="text-[var(--color-m3-primary)]" strokeWidth={2.5} />}
                        </button>
                    ))}
                </div>,
                portalTarget,
            )}
        </div>
    );
};

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
        const first = Math.min(2015, selectedDate.getFullYear());
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
        const next = new Date(selectedDate);

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
        setSelectedDate(next);
        // Inline pickers live inside a form — apply changes immediately instead
        // of requiring a separate confirm step; closing stays under the caller's control.
        if (inline) onConfirm(next);
    };

    const labelClass = 'block mb-1.5 text-xs font-medium text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';

    const renderPart = (
        label: string,
        part: DatePart,
        value: number,
        options: PartOption[],
    ) => (
        <div className="min-w-0">
            <span className={labelClass}>{label}</span>
            <PartSelect
                label={label}
                value={value}
                options={options}
                onChange={next => setPart(part, next)}
            />
        </div>
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

    const body = (
        <div className={inline ? 'pt-3 pb-1 space-y-5' : 'px-5 py-5 space-y-5'}>
            {showDate && (
                <section>
                    <div className="flex items-center gap-2 mb-3 text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        <CalendarDays size={16} />
                        <span className="text-sm font-medium">{t('date.select')}</span>
                    </div>
                    <div className="grid grid-cols-[1.05fr_1.35fr_0.8fr] gap-2.5">
                        {renderPart(
                            t('time.year'),
                            'year',
                            selectedDate.getFullYear(),
                            years.map(year => ({ value: year, label: String(year) })),
                        )}
                        {renderPart(t('time.month'), 'month', selectedDate.getMonth(), months)}
                        {renderPart(
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
                        {renderPart(
                            t('time.hour'),
                            'hour',
                            selectedDate.getHours(),
                            hours.map(hour => ({ value: hour, label: String(hour).padStart(2, '0') })),
                        )}
                        {renderPart(
                            t('time.minute'),
                            'minute',
                            selectedDate.getMinutes(),
                            minutes.map(minute => ({ value: minute, label: String(minute).padStart(2, '0') })),
                        )}
                    </div>
                </section>
            )}
        </div>
    );

    if (inline) return <div className="mb-3">{body}</div>;

    const inner = (
        <div className="rounded-xl border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)]">
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

            {body}

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
