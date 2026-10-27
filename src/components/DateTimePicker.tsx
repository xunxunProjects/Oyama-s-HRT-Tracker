import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from './icons';
import { useEscapeLayer } from './CustomSelect';
import { useTranslation } from '../contexts/LanguageContext';
import { useInlineHost } from '../contexts/DialogContext';
import { LOCALE_MAP } from '../utils/helpers';
import { PAGE_COLUMN } from './PageHeader';

interface DateTimePickerProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (date: Date) => void;
    initialDate?: Date;
    mode?: 'datetime' | 'date' | 'time';
    title?: string;
    /** Sits in a form and applies each change at once. Otherwise it opens as a
     *  line under what was pressed, with Cancel and OK. */
    inline?: boolean;
    maxYear?: number;
}

const MIN_YEAR = 2015;

/** The weekday a week starts on where the reader is: 0 Sunday, 1 Monday. */
function weekStart(locale: string): number {
    try {
        const loc = new Intl.Locale(locale) as Intl.Locale & {
            getWeekInfo?: () => { firstDay: number };
            weekInfo?: { firstDay: number };
        };
        const info = loc.getWeekInfo?.() ?? loc.weekInfo;
        if (info?.firstDay) return info.firstDay % 7;
    } catch {
        // An engine without Intl.Locale: guess from the language below.
    }
    return /^(en-US|ja|ko|zh-TW|zh-HK)/.test(locale) ? 0 : 1;
}

const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// A ring drawn round the chosen day the way a date is circled on a paper
// calendar: once round, a little wide, the pen running on past where it began.
const RING =
    'M27.6 9.2c-3.1-2.2-7.4-2.9-11.2-1.8-5.2 1.5-8.9 6.1-8.6 11.3.3 5.6 5 9.9 10.7 10.2 5.9.3 11-3.8 11.8-9.3.6-3.9-1-7.6-3.9-10-1.3-1-2.8-1.7-4.3-2.1';

interface NumberPartProps {
    label: string;
    value: number;
    min?: number;
    max: number;
    /** How many digits it's written with: 2 for hours and minutes, 4 for a year. */
    digits?: 2 | 4;
    onChange: (value: number) => void;
    className?: string;
}

/** A part of the date or time typed on a line: hours, minutes, the year. Arrow keys step it. */
const NumberPart: React.FC<NumberPartProps> = ({ label, value, min = 0, max, digits = 2, onChange, className }) => {
    const [draft, setDraft] = useState<string | null>(null);
    const commit = (text: string) => {
        const n = parseInt(text, 10);
        if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        setDraft(null);
    };
    return (
        <input
            type="text"
            inputMode="numeric"
            aria-label={label}
            maxLength={digits}
            value={draft ?? String(value).padStart(digits, '0')}
            onFocus={e => e.currentTarget.select()}
            onChange={e => {
                const text = e.target.value.replace(/\D/g, '');
                setDraft(text);
                if (text.length === digits) commit(text);
            }}
            onBlur={() => draft !== null && commit(draft)}
            onKeyDown={e => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const step = e.key === 'ArrowUp' ? 1 : -1;
                    // Hours and minutes go round; a year stops at its ends.
                    const next = value + step;
                    onChange(digits === 4 ? Math.max(min, Math.min(max, next)) : (next + max + 1) % (max + 1));
                    setDraft(null);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (draft !== null) commit(draft);
                }
            }}
            className={`input-base text-center tabular-nums font-medium ${className ?? 'w-12 text-[1.0625rem]'}`}
        />
    );
};

/**
 * Picks a day on a month's calendar and a time under it, with nothing that
 * opens over anything else. The chosen day is circled in ink as it's chosen.
 * Arrow keys walk the days, Page Up and Page Down the months, and the year is
 * typed beside the month, so a date years away (a share link that lasts until
 * 2100) is one field, not hundreds of pages.
 */
const DateTimePicker: React.FC<DateTimePickerProps> = ({
    isOpen,
    onClose,
    onConfirm,
    initialDate,
    mode = 'datetime',
    title,
    inline = false,
    maxYear,
}) => {
    const { t, lang } = useTranslation();
    // A layer rather than a plain window listener: inline, the picker sits in
    // a form that folds away on Escape too, and the press should only fold
    // the picker away.
    useEscapeLayer(onClose, isOpen);
    const locale = LOCALE_MAP[lang] || 'en-US';
    const host = useInlineHost(isOpen && !inline);
    const id = useId();

    const [selectedDate, setSelectedDate] = useState(initialDate || new Date());
    const [view, setView] = useState(() => {
        const d = initialDate || new Date();
        return { year: d.getFullYear(), month: d.getMonth() };
    });
    // Bumped on every pick, so the ring is drawn on afresh each time and not
    // when the page merely renders again.
    const [inkKey, setInkKey] = useState(0);
    const gridRef = useRef<HTMLDivElement>(null);
    const focusDay = useRef(false);

    useEffect(() => {
        if (!isOpen) return;
        const candidate = initialDate ? new Date(initialDate) : new Date();
        const d = Number.isNaN(candidate.getTime()) ? new Date() : candidate;
        setSelectedDate(d);
        setView({ year: d.getFullYear(), month: d.getMonth() });
        // Only when the picker opens: initialDate follows every pick inline.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const lastYear = Math.max(maxYear ?? new Date().getFullYear() + 10, selectedDate.getFullYear());
    const firstYear = Math.min(MIN_YEAR, selectedDate.getFullYear());

    const apply = (next: Date) => {
        next.setSeconds(0, 0);
        setSelectedDate(next);
        // Inline, each change goes straight into the form; closing stays the
        // caller's.
        if (inline) onConfirm(next);
    };

    const pickDay = (year: number, month: number, day: number) => {
        const next = new Date(selectedDate);
        next.setFullYear(year, month, day);
        setView({ year, month });
        setInkKey(k => k + 1);
        apply(next);
    };

    const shiftMonth = (by: number) =>
        setView(v => {
            const d = new Date(v.year, v.month + by, 1);
            const year = Math.max(firstYear, Math.min(lastYear, d.getFullYear()));
            return { year, month: year === d.getFullYear() ? d.getMonth() : v.month };
        });

    const setTime = (part: 'hour' | 'minute', value: number) => {
        const next = new Date(selectedDate);
        if (part === 'hour') next.setHours(value);
        else next.setMinutes(value);
        apply(next);
    };

    const now = new Date();
    const start = weekStart(locale);
    const weekdays = useMemo(() => {
        const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
        const long = new Intl.DateTimeFormat(locale, { weekday: 'long' });
        // 2026-03-01 is a Sunday.
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(2026, 2, 1 + ((start + i) % 7));
            return { short: fmt.format(d), long: long.format(d) };
        });
    }, [locale, start]);

    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const lead = (new Date(view.year, view.month, 1).getDay() - start + 7) % 7;
    const selectedInView = selectedDate.getFullYear() === view.year && selectedDate.getMonth() === view.month;
    const focusable = selectedInView ? selectedDate.getDate() : 1;

    // After a key moved the day, focus follows it into the new month's grid.
    useEffect(() => {
        if (!focusDay.current) return;
        focusDay.current = false;
        gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    });

    const onGridKey = (e: React.KeyboardEvent) => {
        const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (e.key in moves || e.key === 'PageUp' || e.key === 'PageDown') {
            e.preventDefault();
            const base = new Date(view.year, view.month, focusable);
            if (e.key === 'PageUp') base.setMonth(base.getMonth() - 1);
            else if (e.key === 'PageDown') base.setMonth(base.getMonth() + 1);
            else base.setDate(base.getDate() + moves[e.key]);
            if (base.getFullYear() < firstYear || base.getFullYear() > lastYear) return;
            focusDay.current = true;
            pickDay(base.getFullYear(), base.getMonth(), base.getDate());
        }
    };

    if (!isOpen) return null;

    const showDate = mode !== 'time';
    const showTime = mode !== 'date';
    const monthTitle = new Date(view.year, view.month, 1).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
    });
    const monthName = new Date(view.year, view.month, 1).toLocaleDateString(locale, { month: 'long' });
    const setYear = (year: number) => {
        const next = new Date(selectedDate);
        const day = next.getDate();
        next.setDate(1);
        next.setFullYear(year);
        next.setDate(Math.min(day, new Date(year, next.getMonth() + 1, 0).getDate()));
        setView({ year, month: next.getMonth() });
        setInkKey(k => k + 1);
        apply(next);
    };
    const canBack = view.year > firstYear || view.month > 0;
    const canOn = view.year < lastYear || view.month < 11;

    const body = (
        <div className={inline ? 'pt-3 pb-1 space-y-4' : 'space-y-4'}>
            {showDate && (
                <section aria-labelledby={`${id}-month`}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-baseline gap-2">
                            <p id={`${id}-month`} className="text-sm font-medium text-[var(--text)]" aria-live="polite">
                                {monthName}
                            </p>
                            <NumberPart
                                label={t('time.year')}
                                value={view.year}
                                min={firstYear}
                                max={lastYear}
                                digits={4}
                                onChange={setYear}
                                className="w-14 min-h-0 py-1 text-sm"
                            />
                        </div>
                        <div className="flex items-center -me-2">
                            <button
                                type="button"
                                onClick={() => shiftMonth(-1)}
                                disabled={!canBack}
                                aria-label={t('date.prev_month')}
                                className="btn-ghost w-9 px-0 rtl:-scale-x-100"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <button
                                type="button"
                                onClick={() => shiftMonth(1)}
                                disabled={!canOn}
                                aria-label={t('date.next_month')}
                                className="btn-ghost w-9 px-0 rtl:-scale-x-100"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="cal-grid" aria-hidden="true">
                        {weekdays.map(w => (
                            <abbr key={w.long} title={w.long} className="cal-weekday">
                                {w.short}
                            </abbr>
                        ))}
                    </div>
                    <div ref={gridRef} className="cal-grid" role="group" aria-label={monthTitle} onKeyDown={onGridKey}>
                        {Array.from({ length: lead }, (_, i) => (
                            <span key={`lead-${i}`} />
                        ))}
                        {Array.from({ length: daysInMonth }, (_, i) => {
                            const day = i + 1;
                            const date = new Date(view.year, view.month, day);
                            const chosen = selectedInView && selectedDate.getDate() === day;
                            const today = sameDay(date, now);
                            return (
                                <button
                                    key={day}
                                    type="button"
                                    tabIndex={day === focusable ? 0 : -1}
                                    aria-pressed={chosen}
                                    aria-current={today ? 'date' : undefined}
                                    aria-label={date.toLocaleDateString(locale, {
                                        weekday: 'long',
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                    })}
                                    onClick={() => pickDay(view.year, view.month, day)}
                                    className={`cal-day ${chosen ? 'is-chosen' : ''} ${today ? 'is-today' : ''}`}
                                >
                                    {chosen && (
                                        <svg key={inkKey} viewBox="0 0 40 40" className="cal-ring" aria-hidden="true">
                                            <path d={RING} pathLength={1} className={inkKey ? 'ink-draw' : undefined} />
                                        </svg>
                                    )}
                                    <span className="relative tabular-nums">{day}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            {showTime && (
                <section className="flex items-center gap-3">
                    <span className="text-sm text-[var(--text-muted)] me-auto">{t('time.select')}</span>
                    <NumberPart
                        label={t('time.hour')}
                        value={selectedDate.getHours()}
                        max={23}
                        onChange={v => setTime('hour', v)}
                    />
                    <span className="text-[var(--text-muted)] -mx-1" aria-hidden="true">
                        :
                    </span>
                    <NumberPart
                        label={t('time.minute')}
                        value={selectedDate.getMinutes()}
                        max={59}
                        onChange={v => setTime('minute', v)}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            const n = new Date();
                            setView({ year: n.getFullYear(), month: n.getMonth() });
                            setInkKey(k => k + 1);
                            apply(n);
                        }}
                        className="btn-ghost btn-ghost-accent ms-1"
                    >
                        {t('time.now')}
                    </button>
                </section>
            )}
        </div>
    );

    if (inline) return <div className="mb-3">{body}</div>;

    // Opened from a button (the What-if start): a line under it, like the
    // app's other prompts, with the way out and the way on.
    const line = (
        <div className="inline-prompt m-appear block" role="group" aria-label={title}>
            {title && <p className="inline-prompt-title mb-3">{title}</p>}
            {body}
            <div className="inline-prompt-actions mt-4 justify-end">
                <button type="button" onClick={onClose} className="btn-secondary btn-sm">
                    {t('btn.cancel')}
                </button>
                <button type="button" onClick={() => onConfirm(selectedDate)} className="btn-primary btn-sm">
                    {t('btn.ok')}
                </button>
            </div>
        </div>
    );
    if (host) return createPortal(line, host);
    const slot = document.getElementById('prompt-slot');
    return slot ? (
        createPortal(
            <div className="prompt-banner glass glass-bar">
                <div className={`${PAGE_COLUMN} max-w-md`}>{line}</div>
            </div>,
            slot,
        )
    ) : (
        <div className={PAGE_COLUMN}>{line}</div>
    );
};

export default DateTimePicker;
