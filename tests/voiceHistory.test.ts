import { describe, expect, it } from 'vitest';
import { windowVoiceChecks } from '../src/domain/voice/history';
import type { VoiceCheck } from '../src/domain/voice/types';

const check = (id: number): VoiceCheck => ({
    id: String(id),
    at: id,
    medianF0: 150,
    p5: 140,
    p95: 160,
    score: id,
    voicedRatio: 0.5,
    durationMs: 5000,
    passageId: 'en',
});

describe('windowVoiceChecks', () => {
    it('keeps the newest 12 checks, newest first', () => {
        const checks = Array.from({ length: 13 }, (_, i) => check(13 - i));

        const { recent } = windowVoiceChecks(checks);

        expect(recent).toHaveLength(12);
        expect(recent[0].id).toBe('13');
        expect(recent[11].id).toBe('2');
    });

    it('reverses only the chart copy into chronological order', () => {
        const checks = Array.from({ length: 3 }, (_, i) => check(3 - i));

        const { recent, chart } = windowVoiceChecks(checks);

        expect(recent.map(c => c.id)).toEqual(['3', '2', '1']);
        expect(chart.map(c => c.id)).toEqual(['1', '2', '3']);
    });
});
