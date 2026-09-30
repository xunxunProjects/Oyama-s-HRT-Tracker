import { DoseEvent, Ester, ExtraKey, Route } from '../../logic';
import { Regimen, hormoneOf, lapseH } from './regimen';

/**
 * The medication plan: what the person takes and how often, entered by them.
 * Nothing here is read off the log. The log only answers one question per
 * item, by calendar day: is today's dose in, still to come, or not due.
 */
export interface PlanItem {
    id: string;
    route: Route;
    ester: Ester;
    /** mg per dose. 0 for a patch, which is described by its release rate in `extras`. */
    doseMG: number;
    extras: Partial<Record<ExtraKey, number>>;
    /** One dose day every this many days. 1 is daily; a patch changed twice a week is 3.5. */
    everyDays: number;
    /** Doses on a dose day. Only meaningful when `everyDays` is 1. */
    timesPerDay: number;
}

export interface Frequency {
    key: string;
    everyDays: number;
    timesPerDay: number;
}

export const FREQUENCIES: readonly Frequency[] = [
    { key: 'd1', everyDays: 1, timesPerDay: 1 },
    { key: 'd2', everyDays: 1, timesPerDay: 2 },
    { key: 'd3', everyDays: 1, timesPerDay: 3 },
    { key: 'e2', everyDays: 2, timesPerDay: 1 },
    { key: 'e3', everyDays: 3, timesPerDay: 1 },
    { key: 'e3.5', everyDays: 3.5, timesPerDay: 1 },
    { key: 'e5', everyDays: 5, timesPerDay: 1 },
    { key: 'e7', everyDays: 7, timesPerDay: 1 },
    { key: 'e10', everyDays: 10, timesPerDay: 1 },
    { key: 'e14', everyDays: 14, timesPerDay: 1 },
];

export const frequencyKey = (i: Pick<PlanItem, 'everyDays' | 'timesPerDay'>) =>
    (i.everyDays <= 1 ? `d${i.timesPerDay}` : `e${i.everyDays}`);

/** What each route can carry, per mode: the same drugs the dose form logs. */
export const PLAN_DRUGS: Record<'transfem' | 'transmasc', Partial<Record<Route, Ester[]>>> = {
    transfem: {
        [Route.injection]: [Ester.EV, Ester.EB, Ester.EC, Ester.EN, Ester.EU],
        [Route.oral]: [Ester.EV, Ester.E2, Ester.CPA],
        [Route.sublingual]: [Ester.E2, Ester.EV],
        [Route.gel]: [Ester.E2],
        [Route.patchApply]: [Ester.E2],
    },
    transmasc: {
        [Route.injection]: [Ester.TC, Ester.TE, Ester.TU],
        [Route.gel]: [Ester.T],
        [Route.patchApply]: [Ester.T],
    },
};

/** Where a new item starts: the usual amount and rhythm for that drug by that route. */
export const usualFor = (route: Route, ester: Ester): { dose: string; freq: string } => {
    if (ester === Ester.CPA) return { dose: '12.5', freq: 'd1' };
    if (route === Route.patchApply) return { dose: '100', freq: 'e3.5' };
    if (route === Route.injection) return { dose: ester === Ester.TU ? '1000' : [Ester.TC, Ester.TE].includes(ester) ? '50' : '5', freq: 'e7' };
    if (route === Route.gel) return { dose: ester === Ester.T ? '50' : '1.5', freq: 'd1' };
    return { dose: '2', freq: 'd1' };
};

/** A plan item as it is being typed: the amount still a string, the rhythm a key into FREQUENCIES. */
export interface PlanDraft {
    route: Route;
    ester: Ester;
    /** mg, or µg/day for a patch. */
    dose: string;
    freq: string;
    slTier: number;
    /** Index into GEL_SITE_ORDER. */
    gelSite: number;
}

export const freshDraft = (route: Route, ester: Ester): PlanDraft => ({ route, ester, slTier: 2, gelSite: 0, ...usualFor(route, ester) });

export const draftToItem = (d: PlanDraft, id: string): PlanItem | null => {
    const dose = parseFloat(d.dose);
    const f = FREQUENCIES.find(x => x.key === d.freq);
    if (!(dose > 0) || !f) return null;
    const isPatch = d.route === Route.patchApply;
    const extras: PlanItem['extras'] =
        isPatch ? { [ExtraKey.releaseRateUGPerDay]: dose, [ExtraKey.patchWearH]: f.everyDays * 24 }
        : d.route === Route.sublingual ? { [ExtraKey.sublingualTier]: d.slTier }
        : d.route === Route.gel ? { [ExtraKey.gelSite]: d.gelSite } : {};
    return { id, route: d.route, ester: d.ester, doseMG: isPatch ? 0 : dose, extras, everyDays: f.everyDays, timesPerDay: f.timesPerDay };
};

export const itemToDraft = (i: PlanItem): PlanDraft => ({
    route: i.route,
    ester: i.ester,
    dose: String(i.route === Route.patchApply ? (i.extras[ExtraKey.releaseRateUGPerDay] ?? 0) : Number(i.doseMG.toFixed(3))),
    freq: frequencyKey(i),
    slTier: i.extras[ExtraKey.sublingualTier] ?? 2,
    gelSite: i.extras[ExtraKey.gelSite] ?? 0,
});

export const normalizePlanItem = (raw: any): PlanItem | null => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
    if (!Object.values(Route).includes(raw.route) || !Object.values(Ester).includes(raw.ester)) return null;
    const everyDays = Number(raw.everyDays);
    const timesPerDay = Math.round(Number(raw.timesPerDay));
    const doseMG = Number(raw.doseMG);
    if (!(everyDays >= 1) || !(timesPerDay >= 1) || !Number.isFinite(doseMG) || doseMG < 0) return null;
    return {
        id: raw.id, route: raw.route, ester: raw.ester, doseMG,
        extras: raw.extras && typeof raw.extras === 'object' ? raw.extras : {},
        everyDays, timesPerDay: everyDays > 1 ? 1 : timesPerDay,
    };
};

/**
 * For a short while cyproterone had its own daily / every-other-day choice,
 * stored on its own. Read that as the plan item it always was.
 */
export const legacyCpaItem = (raw: string | null): PlanItem | null => {
    if (!raw) return null;
    try {
        const plan = JSON.parse(raw)?.plan;
        if (plan !== 'daily' && plan !== 'alternate') return null;
        return { id: 'cpa', route: Route.oral, ester: Ester.CPA, doseMG: 12.5, extras: {}, everyDays: plan === 'daily' ? 1 : 2, timesPerDay: 1 };
    } catch { return null; }
};

/** A logged dose counts toward an item when it is the same drug by the same route, whatever the amount. */
export const matchesItem = (item: Pick<PlanItem, 'route' | 'ester'>, e: DoseEvent) =>
    e.route === item.route && e.ester === item.ester;

export type PlanStatus =
    /** Today is a dose day and it isn't all logged yet. `done` of `total` are in. */
    | { kind: 'due'; done: number; total: number }
    | { kind: 'taken' }
    /** Not a dose day. `nextH` is the start of the day the next dose falls on. */
    | { kind: 'rest'; nextH: number; yesterday: boolean };

const dayStartH = (h: number) => {
    const d = new Date(h * 3600000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 3600000;
};

/**
 * Today's answer for one item, by calendar day in the device's timezone.
 * There is no clock time and no "overdue": a dose that is late is simply
 * still due.
 */
export function planStatus(item: PlanItem, events: DoseEvent[], nowH: number): PlanStatus {
    const times = events.filter(e => matchesItem(item, e) && e.timeH <= nowH).map(e => e.timeH).sort((a, b) => a - b);
    const todayH = dayStartH(nowH);
    if (item.everyDays <= 1) {
        const done = times.filter(t => t >= todayH).length;
        return done >= item.timesPerDay ? { kind: 'taken' } : { kind: 'due', done, total: item.timesPerDay };
    }
    const last = times.length ? times[times.length - 1] : null;
    if (last === null) return { kind: 'due', done: 0, total: 1 };
    if (last >= todayH) return { kind: 'taken' };
    const nextDayH = dayStartH(last + item.everyDays * 24);
    if (todayH >= nextDayH) return { kind: 'due', done: 0, total: 1 };
    return { kind: 'rest', nextH: nextDayH, yesterday: last >= todayH - 24 };
}

/** The dose one tap on the Overview logs: the item as planned, at this moment. */
export const planEvent = (item: PlanItem, id: string, nowMs: number): DoseEvent => ({
    id, route: item.route, ester: item.ester, doseMG: item.doseMG, extras: { ...item.extras }, timeH: nowMs / 3600000,
});

/**
 * The plan in the shape the forward-looking features work with (the what-if,
 * blood test timing, supply run-out). With a plan they follow it; they only
 * fall back to reading a rhythm off the log when there is no plan at all.
 */
export function regimensFromPlan(plan: PlanItem[], events: DoseEvent[], nowH: number): Regimen[] {
    return plan.map(item => {
        const intervalH = item.everyDays * 24 / Math.max(1, item.timesPerDay);
        const all = events.filter(e => matchesItem(item, e)).map(e => e.timeH).sort((a, b) => a - b);
        const past = all.filter(t => t <= nowH);
        const scheduledH = all.filter(t => t > nowH);
        const lastH = past.length ? past[past.length - 1] : nowH - intervalH;
        let sinceH = past.length ? lastH : nowH;
        for (let i = past.length - 2; i >= 0; i--) {
            if (past[i + 1] - past[i] > lapseH(intervalH)) break;
            sinceH = past[i];
        }
        return {
            key: `plan|${item.id}`,
            loose: true,
            route: item.route, ester: item.ester, doseMG: item.doseMG, extras: { ...item.extras },
            hormone: hormoneOf(item.ester),
            intervalH, lastH, sinceH, scheduledH,
            nextH: scheduledH[0] ?? Math.max(nowH, lastH + intervalH),
        };
    }).sort((a, b) => a.nextH - b.nextH);
}
