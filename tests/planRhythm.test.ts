import { describe, expect, it } from 'vitest';
import { Ester, Route, type DoseEvent } from '../logic';
import {
    customSeed,
    draftToItem,
    freshDraft,
    itemToDraft,
    normalizePlanItem,
    parseFrequency,
    type PlanItem,
} from '../src/utils/plan';
import { planToCalendar } from '../src/utils/planCalendar';

const item = (over: Partial<PlanItem> = {}): PlanItem => ({
    id: 'p1',
    route: Route.injection,
    ester: Ester.EV,
    doseMG: 4,
    extras: {},
    everyDays: 4,
    timesPerDay: 1,
    ...over,
});

describe('custom plan rhythms', () => {
    it('reads presets and typed whole-number rhythms', () => {
        expect(parseFrequency('e7')).toMatchObject({ everyDays: 7, timesPerDay: 1 });
        expect(parseFrequency('e4')).toMatchObject({ everyDays: 4, timesPerDay: 1 });
        expect(parseFrequency('d5')).toMatchObject({ everyDays: 1, timesPerDay: 5 });
    });

    it('rejects what a half-typed field leaves and values out of range', () => {
        for (const key of ['custom', 'e0', 'e181', 'd0', 'd9', 'e', 'x4', 'e4,5'])
            expect(parseFrequency(key)).toBeNull();
    });

    it('keeps a saved fractional rhythm exactly as it was when the item is opened and saved', () => {
        const odd = item({ everyDays: 4.123456 });
        const back = draftToItem(itemToDraft(odd), odd.id);
        expect(back?.everyDays).toBe(4.123456);
    });

    it('a 4-day injection round-trips through the draft', () => {
        const draft = { ...freshDraft(Route.injection, Ester.EV), freq: 'e4' };
        const saved = draftToItem(draft, 'id');
        expect(saved).toMatchObject({ everyDays: 4, timesPerDay: 1 });
        expect(itemToDraft(saved!).freq).toBe('e4');
    });

    it('starts "another rhythm" from the rhythm chosen so far', () => {
        expect(customSeed('e7')).toBe('e7');
        expect(customSeed('e3.5')).toBe('e4');
        expect(customSeed('d3')).toBe('d3');
        expect(customSeed('d1')).toBe('e4');
    });

    it('no longer accepts an endless rhythm from storage', () => {
        expect(normalizePlanItem({ ...item(), everyDays: Infinity })).toBeNull();
        expect(normalizePlanItem({ ...item(), everyDays: 4 })).toMatchObject({ everyDays: 4 });
    });
});

describe('plan as a calendar file', () => {
    const now = new Date(2026, 9, 28, 10, 0).getTime();
    const lastAt = (daysAgo: number, h: number, m: number): DoseEvent => ({
        id: `e${daysAgo}`,
        route: Route.injection,
        ester: Ester.EV,
        doseMG: 4,
        extras: {},
        timeH: new Date(2026, 9, 28 - daysAgo, h, m).getTime() / 3600000,
    });
    const words = { title: (i: PlanItem) => `EV ${i.doseMG} mg, injection`, note: 'From your plan; log it.' };

    it('repeats every 4 days from the next due day, at the time last logged', () => {
        const ics = planToCalendar([item()], [lastAt(1, 20, 57)], words, now);
        expect(ics).toContain('DTSTART:20261031T205700');
        expect(ics).toContain('RRULE:FREQ=DAILY;INTERVAL=4');
        expect(ics).toContain('UID:plan-p1-0@oyama-tracker');
        expect(ics).toContain('SUMMARY:EV 4 mg\\, injection');
        expect(ics).toContain('DESCRIPTION:From your plan\\; log it.');
    });

    it('gives each of several daily doses its own series, spread through the day', () => {
        const ics = planToCalendar(
            [item({ everyDays: 1, timesPerDay: 2, route: Route.oral, ester: Ester.E2 })],
            [],
            words,
            now,
        );
        expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
        expect(ics).toContain('DTSTART:20261028T090000');
        expect(ics).toContain('DTSTART:20261028T210000');
    });

    it('writes a patch changed every 3.5 days as two weekly series 84 hours apart', () => {
        const ics = planToCalendar(
            [item({ everyDays: 3.5, route: Route.patchApply, ester: Ester.E2 })],
            [],
            words,
            now,
        );
        expect(ics.match(/RRULE:FREQ=DAILY;INTERVAL=7/g)).toHaveLength(2);
        expect(ics).toContain('DTSTART:20261028T090000');
        expect(ics).toContain('DTSTART:20261031T210000');
    });

    it('starts a patch put on today at the next change, then alternates 84 hours apart', () => {
        const patch = item({ everyDays: 3.5, route: Route.patchApply, ester: Ester.E2 });
        const putOn: DoseEvent = {
            id: 'p',
            route: Route.patchApply,
            ester: Ester.E2,
            doseMG: 0,
            extras: {},
            timeH: new Date(2026, 9, 28, 9, 0).getTime() / 3600000,
        };
        const ics = planToCalendar([patch], [putOn], words, now);
        expect(ics).toContain('DTSTART:20261031T210000');
        expect(ics).toContain('DTSTART:20261104T090000');
    });

    it('reminds every dose of the day from the first due day, one earlier than the last logged included', () => {
        const pill = item({ everyDays: 1, timesPerDay: 2, route: Route.oral, ester: Ester.E2 });
        const lastNight: DoseEvent = {
            id: 'n',
            route: Route.oral,
            ester: Ester.E2,
            doseMG: 2,
            extras: {},
            timeH: new Date(2026, 9, 27, 20, 0).getTime() / 3600000,
        };
        const ics = planToCalendar([pill], [lastNight], words, new Date(2026, 9, 28, 6, 0).getTime());
        expect(ics).toContain('DTSTART:20261028T080000');
        expect(ics).toContain('DTSTART:20261028T200000');
    });

    it('encodes a plan id before it reaches the calendar UID', () => {
        const ics = planToCalendar([item({ id: 'p1\r\nBEGIN:VEVENT\r\nSUMMARY:Injected' })], [], words, now);
        expect(ics).not.toContain('\r\nSUMMARY:Injected');
        expect(ics).toContain('UID:plan-p1%0D%0ABEGIN%3AVEVENT%0D%0ASUMMARY%3AInjected-0@oyama-tracker');
    });

    it('folds long lines at 75 bytes with CRLF and a leading space', () => {
        const long = { ...words, note: '注'.repeat(60) };
        const ics = planToCalendar([item()], [], long, now);
        for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
        expect(ics).toMatch(/\r\n [^\r]/);
    });
});
