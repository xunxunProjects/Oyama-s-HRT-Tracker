import { toDayKey } from './helpers';

/**
 * Count the distinct local calendar days on which this account logged a dose,
 * from its registration time up to now, across both HRT modes.
 *
 * Dose records never leave the browser, so this is the only place the five-day
 * requirement can be checked. The server receives the yes/no result, not the
 * days or the records. It reads the same keys `useAppData` writes for a signed-in
 * account: `hrt-u<id>-events` and `hrt-u<id>-masc-events`.
 */
export const countHrtDaysSince = (userId: string, sinceSec: number, nowSec: number): number => {
    if (typeof localStorage === 'undefined' || !userId) return 0;

    const startMs = sinceSec * 1000;
    const endMs = nowSec * 1000;
    const days = new Set<string>();

    for (const suffix of ['events', 'masc-events']) {
        const raw = localStorage.getItem(`hrt-u${userId}-${suffix}`);
        if (!raw) continue;

        let events: unknown;
        try {
            events = JSON.parse(raw);
        } catch {
            continue;
        }
        if (!Array.isArray(events)) continue;

        for (const event of events) {
            if (!event || typeof event !== 'object') continue;
            const timeH = (event as { timeH?: unknown }).timeH;
            if (typeof timeH !== 'number' || !Number.isFinite(timeH)) continue;

            const ms = timeH * 3_600_000;
            if (ms < startMs || ms > endMs) continue;
            days.add(toDayKey(new Date(ms)));
        }
    }

    return days.size;
};
