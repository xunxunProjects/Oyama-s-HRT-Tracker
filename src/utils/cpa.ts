import { DoseEvent, Ester } from '../../logic';

/**
 * Cyproterone acetate is tracked by whether it was taken, not by an estimated
 * blood level. It is taken as one 12.5 mg tablet either every day or every
 * other day, so "today" has one of three answers: taken, still to take, or a
 * day off.
 */
export type CpaPlan = 'off' | 'daily' | 'alternate';
export const CPA_PLANS: readonly CpaPlan[] = ['off', 'daily', 'alternate'];
export const CPA_DOSE_MG = 12.5;

export type CpaStatus = 'taken' | 'due' | 'rest';

const cpaTimes = (events: DoseEvent[], nowH: number) =>
    events.filter(e => e.ester === Ester.CPA && e.timeH <= nowH).map(e => e.timeH).sort((a, b) => a - b);

/**
 * The plan the log implies, for someone who hasn't picked one: nothing in two
 * weeks means it isn't being taken; otherwise the usual gap between doses
 * says daily or every other day.
 */
export function inferCpaPlan(events: DoseEvent[], nowH: number): CpaPlan {
    const times = cpaTimes(events, nowH).filter(t => t >= nowH - 28 * 24);
    if (!times.length || nowH - times[times.length - 1] > 14 * 24) return 'off';
    if (times.length < 3) return 'daily';
    const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
    return gaps[gaps.length >> 1] >= 36 ? 'alternate' : 'daily';
}

/** What the person picked on the Overview, and when. */
export interface CpaChoice {
    plan: CpaPlan;
    at: number;
}

export const parseCpaChoice = (raw: string | null): CpaChoice | null => {
    if (!raw) return null;
    try {
        const c = JSON.parse(raw);
        if (c && (CPA_PLANS as readonly string[]).includes(c.plan)) return { plan: c.plan, at: Number(c.at) || 0 };
    } catch { /* not JSON: nothing usable */ }
    return null;
};

/**
 * The plan in force. A pick stands until the log contradicts it: picking
 * "stopped" takes the line off the Overview, and the picker with it, so
 * logging a dose afterwards is what brings both back.
 */
export function effectiveCpaPlan(choice: CpaChoice | null, events: DoseEvent[], nowH: number): CpaPlan {
    if (!choice) return inferCpaPlan(events, nowH);
    if (choice.plan === 'off' && events.some(e => e.ester === Ester.CPA && e.timeH * 3600000 > choice.at)) return inferCpaPlan(events, nowH);
    return choice.plan;
}

/** Today's answer under `plan`, by calendar day in the device's own timezone. */
export function cpaStatus(events: DoseEvent[], plan: CpaPlan, nowH: number): CpaStatus | null {
    if (plan === 'off') return null;
    const now = new Date(nowH * 3600000);
    const todayH = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 3600000;
    const times = cpaTimes(events, nowH);
    const last = times.length ? times[times.length - 1] : -Infinity;
    if (last >= todayH) return 'taken';
    if (plan === 'alternate' && last >= todayH - 24) return 'rest';
    return 'due';
}
