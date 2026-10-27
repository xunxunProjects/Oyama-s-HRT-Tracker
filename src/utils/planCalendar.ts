import { DoseEvent } from '../../logic';
import { PlanItem, matchesItem, planStatus } from './plan';

/**
 * The plan as a calendar file (RFC 5545), for the calendar app on the phone
 * to remind the person when each dose is due: the app itself can't wake a
 * phone up, but the calendar already does, without a server or an account.
 * One repeating event per dose time, at the time of day the drug was last
 * logged (9:00 if it never has been), starting from the next day it's due.
 * Event ids come from the plan item, so adding the file again after the plan
 * changes updates the reminders in place instead of doubling them.
 */
export interface CalendarText {
    /** What the reminder is called: the plan row's own wording. */
    title: (item: PlanItem) => string;
    /** The line inside every reminder. */
    note: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A floating local time: the reminder rings at 20:57 wherever the phone is. */
const local = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const utc = (d: Date) =>
    d
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** The id becomes part of a UID line, so encode it rather than letting CR/LF start a new property. */
const calendarUidPart = (id: string) => {
    try {
        return encodeURIComponent(id);
    } catch {
        // A malformed UTF-16 string (lone surrogate) makes encodeURIComponent throw.
        return encodeURIComponent(id.replace(/[\uD800-\uDFFF]/g, '\uFFFD'));
    }
};

/** Lines of more than 75 bytes are folded onto continuation lines that start with a space. */
function fold(line: string): string {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const parts: string[] = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
        const b = enc.encode(ch).length;
        if (bytes + b > (parts.length ? 74 : 75)) {
            parts.push(cur);
            cur = '';
            bytes = 0;
        }
        cur += ch;
        bytes += b;
    }
    parts.push(cur);
    return parts.join('\r\n ');
}

const dayStart = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** `days` on from a time by the clock on the wall, so a change to or from
 *  summer time doesn't move the hour: 3.5 days from Monday 09:00 is Thursday
 *  21:00 either way. */
const later = (d: Date, days: number) => {
    const next = new Date(d);
    next.setDate(next.getDate() + Math.floor(days));
    next.setHours(next.getHours() + Math.round((days % 1) * 24));
    return next;
};

/** When the first reminder for an item should ring, and at what time of day the rest follow. */
function firstDose(item: PlanItem, events: DoseEvent[], nowMs: number): Date {
    const nowH = nowMs / 3600000;
    const taken = events.filter(e => matchesItem(item, e) && e.timeH <= nowH).map(e => e.timeH * 3600000);
    const last = taken.length ? Math.max(...taken) : null;
    // The next dose comes round at the time of day the rhythm brings it to:
    // the last one's, or twelve hours on for a patch changed every 3.5 days.
    const due = last !== null ? later(new Date(last), item.everyDays > 1 ? item.everyDays : 0) : null;
    const status = planStatus(item, events, nowH);
    const today = dayStart(nowMs);
    let day: number;
    if (status.kind === 'due') day = today;
    else if (status.kind === 'rest') day = dayStart(status.nextH * 3600000);
    // Taken today: tomorrow, or the day the rhythm comes round to, counted as
    // the plan counts it.
    else day = due && item.everyDays > 1 ? dayStart(due.getTime()) : dayStart(today + 25 * 3600000);
    const first = new Date(day);
    first.setHours(due ? due.getHours() : 9, due ? due.getMinutes() : 0, 0, 0);
    return first;
}

export function planToCalendar(plan: PlanItem[], events: DoseEvent[], words: CalendarText, nowMs = Date.now()): string {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Oyama Tracker//Plan//EN', 'CALSCALE:GREGORIAN'];
    const stamp = utc(new Date(nowMs));
    for (const item of plan) {
        const title = words.title(item);
        const first = firstDose(item, events, nowMs);
        // Several doses a day: one series per dose, spread through the day.
        // Every 3.5 days (a patch twice a week): two weekly series 84 hours
        // apart, which every calendar can repeat. Any other part day rounds
        // to whole days, which is how the plan reads it anyway.
        const series: { start: Date; rule: string }[] = [];
        if (item.everyDays <= 1) {
            // All from the first day, at times spread round the clock from
            // the last dose's, so one earlier in the day than that (this
            // morning's, after last night's) is reminded too.
            const n = Math.max(1, item.timesPerDay);
            const from = first.getHours() * 60 + first.getMinutes();
            for (let k = 0; k < n; k++) {
                const start = new Date(first);
                start.setHours(0, (from + Math.round((k * 1440) / n)) % 1440, 0, 0);
                series.push({ start, rule: 'FREQ=DAILY' });
            }
        } else if (Math.abs(item.everyDays * 2 - Math.round(item.everyDays * 2)) < 1e-9 && item.everyDays % 1 !== 0) {
            const span = Math.round(item.everyDays * 2);
            series.push({ start: first, rule: `FREQ=DAILY;INTERVAL=${span}` });
            series.push({ start: later(first, item.everyDays), rule: `FREQ=DAILY;INTERVAL=${span}` });
        } else {
            series.push({ start: first, rule: `FREQ=DAILY;INTERVAL=${Math.max(1, Math.round(item.everyDays))}` });
        }
        series.forEach((s, k) => {
            lines.push(
                'BEGIN:VEVENT',
                `UID:plan-${calendarUidPart(item.id)}-${k}@oyama-tracker`,
                `DTSTAMP:${stamp}`,
                `DTSTART:${local(s.start)}`,
                'DURATION:PT15M',
                `RRULE:${s.rule}`,
                `SUMMARY:${text(title)}`,
                `DESCRIPTION:${text(words.note)}`,
                'TRANSP:TRANSPARENT',
                'BEGIN:VALARM',
                'ACTION:DISPLAY',
                `DESCRIPTION:${text(title)}`,
                'TRIGGER:PT0M',
                'END:VALARM',
                'END:VEVENT',
            );
        });
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
}
