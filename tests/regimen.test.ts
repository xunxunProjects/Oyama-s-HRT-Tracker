import { describe, expect, it } from 'vitest';
import { Ester, Route } from '../logic';
import { detectRegimens, dosesAhead, regimenMatches } from '../src/utils/regimen';

const h = (iso: string) => new Date(iso).getTime() / 3600000;

const dose = (id: string, iso: string, doseMG: number) => ({
    id,
    route: Route.injection,
    ester: Ester.EV,
    doseMG,
    timeH: h(iso),
    extras: {},
});

describe('detectRegimens', () => {
    it('keeps one weekly regimen when the logged amount drifts slightly', () => {
        const nowH = h('2026-10-26T02:53:00+08:00');
        const events = [
            dose('a', '2026-10-24T15:59:00+08:00', 4.9),
            dose('b', '2026-10-17T21:47:00+08:00', 5),
            dose('c', '2026-10-11T13:04:00+08:00', 5),
            dose('d', '2026-10-04T16:18:00+08:00', 4.8),
            dose('e', '2026-09-28T00:21:00+08:00', 5),
            dose('f', '2026-09-20T15:02:00+08:00', 5),
            dose('g', '2026-09-13T12:29:00+08:00', 5),
        ];

        const regimens = detectRegimens(events, nowH);

        expect(regimens).toHaveLength(1);
        const regimen = regimens[0];
        expect(regimen.doseMG).toBe(4.9);
        expect(regimen.lastH).toBe(h('2026-10-24T15:59:00+08:00'));
        expect(regimens.every(r => events.every(e => regimenMatches(r, e)))).toBe(true);

        const ahead = dosesAhead(regimens, nowH, nowH + 14 * 24);
        expect(ahead.some(e => e.id.startsWith('due-'))).toBe(false);
        expect(ahead.every(e => e.timeH > nowH)).toBe(true);
    });

    it('keeps genuinely different strengths on the same route apart', () => {
        const nowH = h('2026-10-26T00:00:00+08:00');
        const events = Array.from({ length: 5 }, (_, day) => [
            dose(`m${day}`, `2026-10-${String(21 + day).padStart(2, '0')}T09:00:00+08:00`, 2),
            dose(`e${day}`, `2026-10-${String(21 + day).padStart(2, '0')}T21:00:00+08:00`, 4),
        ]).flat();

        const regimens = detectRegimens(events, nowH);

        expect(regimens.map(r => r.doseMG).sort()).toEqual([2, 4]);
        expect(regimens.map(r => r.intervalH).sort()).toEqual([24, 24]);
    });
});
