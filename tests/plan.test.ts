import { describe, expect, it } from 'vitest';
import { Ester, ExtraKey, Route } from '../logic';
import {
    CUSTOM_FREQ,
    PlanItem,
    customFieldsFor,
    draftFrequency,
    draftToItem,
    freshDraft,
    isValidCustomDays,
    isValidCustomTimes,
    itemToDraft,
    normalizePlanItem,
    planStatus,
    regimensFromPlan,
    stepReady,
} from '../src/utils/plan';

const at = (y: number, m: number, d: number, h = 0) => new Date(Date.UTC(y, m - 1, d, h)).getTime() / 3600000;

const item = (patch: Partial<PlanItem> = {}): PlanItem => ({
    id: 'p1',
    route: Route.injection,
    ester: Ester.EV,
    doseMG: 5,
    extras: {},
    everyDays: 7,
    timesPerDay: 1,
    ...patch,
});

describe('custom plan frequency', () => {
    it('keeps a preset key as the preset', () => {
        const d = { ...freshDraft(Route.injection, Ester.EV), freq: 'e7' };
        expect(draftFrequency(d)).toMatchObject({ everyDays: 7, timesPerDay: 1 });
    });

    it('reads a typed interval as one dose every that many days', () => {
        const d = {
            ...freshDraft(Route.injection, Ester.EV),
            freq: CUSTOM_FREQ,
            customKind: 'every' as const,
            customEvery: '4',
        };
        expect(draftFrequency(d)).toMatchObject({ everyDays: 4, timesPerDay: 1 });
        expect(draftToItem(d, 'p1')).toMatchObject({ everyDays: 4, timesPerDay: 1 });
    });

    it('reads a typed rhythm as that many doses a day', () => {
        const d = {
            ...freshDraft(Route.oral, Ester.E2),
            freq: CUSTOM_FREQ,
            customKind: 'times' as const,
            customTimes: '4',
        };
        expect(draftFrequency(d)).toMatchObject({ everyDays: 1, timesPerDay: 4 });
        expect(draftToItem(d, 'p1')).toMatchObject({ everyDays: 1, timesPerDay: 4 });
    });

    it('still plans a custom wear time for a patch', () => {
        const d = {
            ...freshDraft(Route.patchApply, Ester.E2),
            dose: '100',
            freq: CUSTOM_FREQ,
            customKind: 'every' as const,
            customEvery: '5',
        };
        expect(draftToItem(d, 'p1')?.extras[ExtraKey.patchWearH]).toBe(120);
    });

    it('refuses an empty or out-of-range custom value', () => {
        const base = freshDraft(Route.injection, Ester.EV);
        const every = (v: string) => ({ ...base, freq: CUSTOM_FREQ, customKind: 'every' as const, customEvery: v });
        const times = (v: string) => ({ ...base, freq: CUSTOM_FREQ, customKind: 'times' as const, customTimes: v });
        for (const d of [
            every(''),
            every('0'),
            every('4.5'),
            every('3651'),
            times(''),
            times('0'),
            times('2.5'),
            times('25'),
        ]) {
            expect(draftFrequency(d)).toBeNull();
            expect(draftToItem(d, 'p1')).toBeNull();
        }
    });

    it('opens an item with an unlisted interval as the custom form', () => {
        expect(itemToDraft(item({ everyDays: 4 }))).toMatchObject({
            freq: CUSTOM_FREQ,
            customKind: 'every',
            customEvery: '4',
        });
        expect(itemToDraft(item({ everyDays: 1, timesPerDay: 4 }))).toMatchObject({
            freq: CUSTOM_FREQ,
            customKind: 'times',
            customTimes: '4',
        });
        expect(itemToDraft(item({ everyDays: 3.5 }))).toMatchObject({ freq: 'e3.5' });
    });

    it('round-trips an edited custom item without changing its rhythm', () => {
        const original = item({ everyDays: 4 });
        expect(draftToItem(itemToDraft(original), original.id)).toMatchObject({ everyDays: 4, timesPerDay: 1 });
    });

    it('schedules a four-day interval by calendar day', () => {
        const plan = item({ everyDays: 4 });
        const nowH = at(2026, 10, 27, 21);
        const dose = (id: string, timeH: number) => ({
            id,
            route: Route.injection,
            ester: Ester.EV,
            doseMG: 5,
            extras: {},
            timeH,
        });

        expect(planStatus(plan, [dose('a', at(2026, 10, 23, 21))], nowH)).toEqual({ kind: 'due', done: 0, total: 1 });
        expect(planStatus(plan, [dose('a', at(2026, 10, 25, 21))], nowH)).toEqual({
            kind: 'rest',
            nextH: at(2026, 10, 29),
            yesterday: false,
        });
    });

    it('accepts whole custom days only, while the 3.5-day patch preset stays a preset', () => {
        const base = freshDraft(Route.injection, Ester.EV);
        const custom = (value: string) => ({
            ...base,
            freq: CUSTOM_FREQ,
            customKind: 'every' as const,
            customEvery: value,
        });

        expect(draftFrequency(custom('4'))).toMatchObject({ everyDays: 4 });
        expect(isValidCustomDays('4')).toBe(true);
        expect(isValidCustomDays('4.5')).toBe(false);
        expect(draftFrequency(custom('4.5'))).toBeNull();

        const patch = itemToDraft(
            item({
                route: Route.patchApply,
                ester: Ester.E2,
                doseMG: 0,
                extras: { [ExtraKey.releaseRateUGPerDay]: 100 },
                everyDays: 3.5,
            }),
        );
        expect(patch).toMatchObject({ freq: 'e3.5', customEvery: '' });
        expect(draftToItem(patch, 'p1')).toMatchObject({ everyDays: 3.5 });
    });

    it('seeds whole days exactly and leaves a fractional preset empty', () => {
        expect(customFieldsFor({ everyDays: 3.5, timesPerDay: 1 })).toEqual({
            customKind: 'every',
            customEvery: '',
            customTimes: '',
        });
        expect(customFieldsFor({ everyDays: 4, timesPerDay: 1 })).toEqual({
            customKind: 'every',
            customEvery: '4',
            customTimes: '',
        });
        expect(customFieldsFor({ everyDays: 1, timesPerDay: 3 })).toEqual({
            customKind: 'times',
            customEvery: '',
            customTimes: '3',
        });
        expect(isValidCustomTimes('3')).toBe(true);
        expect(isValidCustomTimes('2.5')).toBe(false);
    });

    it('bounds a plan item read back from storage', () => {
        const raw = (overrides: Record<string, unknown> = {}) => ({
            id: 'p1',
            route: Route.injection,
            ester: Ester.EV,
            doseMG: 5,
            extras: {},
            everyDays: 4,
            timesPerDay: 1,
            ...overrides,
        });

        expect(normalizePlanItem(raw())).toMatchObject({ everyDays: 4, timesPerDay: 1 });
        expect(normalizePlanItem(raw({ everyDays: 3.5 }))).toMatchObject({ everyDays: 3.5 });
        expect(normalizePlanItem(raw({ everyDays: 4.5 }))).toBeNull();
        expect(normalizePlanItem(raw({ everyDays: 3651 }))).toBeNull();
        expect(normalizePlanItem(raw({ everyDays: 1, timesPerDay: 24 }))).toMatchObject({ timesPerDay: 24 });
        expect(normalizePlanItem(raw({ everyDays: 1, timesPerDay: 25 }))).toBeNull();
        expect(normalizePlanItem(raw({ everyDays: 1, timesPerDay: 2.5 }))).toBeNull();
    });

    it('leaves the earlier steps usable when the custom value is invalid', () => {
        const base = freshDraft(Route.injection, Ester.EV);
        const invalid = { ...base, freq: CUSTOM_FREQ, customKind: 'every' as const, customEvery: '4.5' };

        expect(stepReady('freq', invalid)).toBe(false);
        expect(stepReady('dose', invalid)).toBe(true);
        expect(stepReady('site', invalid)).toBe(true);
        expect(stepReady('hold', invalid)).toBe(true);
        expect(stepReady('route', invalid)).toBe(true);

        const noDose = { ...invalid, customEvery: '4', dose: '0' };
        expect(stepReady('dose', noDose)).toBe(false);
        expect(stepReady('freq', noDose)).toBe(false);
        expect(stepReady('freq', { ...noDose, dose: '5' })).toBe(true);
    });

    it('projects a custom four-day rhythm and a custom doses-a-day rhythm', () => {
        const nowH = at(2026, 10, 27, 21);
        const last = at(2026, 10, 23, 21);
        const dose = (timeH: number) => ({
            id: 'a',
            route: Route.injection,
            ester: Ester.EV,
            doseMG: 5,
            extras: {},
            timeH,
        });

        const four = regimensFromPlan([item({ everyDays: 4 })], [dose(last)], nowH)[0];
        expect(four.intervalH).toBe(96);
        expect(four.nextH).toBe(last + 96);

        const thrice = regimensFromPlan([item({ everyDays: 1, timesPerDay: 3 })], [], nowH)[0];
        expect(thrice.intervalH).toBe(8);
    });
});
