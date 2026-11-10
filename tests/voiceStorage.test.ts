import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VoiceCheck } from '../src/domain/voice/types';
import { MemoryStorage } from './memoryStorage';
import {
    addVoiceCheck,
    clearAllVoiceChecks,
    isVoiceCheck,
    loadVoiceChecks,
    MAX_VOICE_CHECKS,
    voiceChecksKey,
} from '../src/utils/voiceStorage';

const check = (id: string, at = 1_700_000_000_000): VoiceCheck => ({
    id,
    at,
    medianF0: 150,
    p5: 140,
    p95: 160,
    score: 0,
    voicedRatio: 0.8,
    durationMs: 5000,
    passageId: 'en',
});

describe('voiceChecksKey', () => {
    it('uses the signed-out namespace', () => {
        expect(voiceChecksKey('local', 'transfem')).toBe('hrt-voice-checks');
        expect(voiceChecksKey('local', 'transmasc')).toBe('hrt-masc-voice-checks');
    });

    it('uses the account namespace', () => {
        expect(voiceChecksKey('1', 'transfem')).toBe('hrt-u1-voice-checks');
        expect(voiceChecksKey('1', 'transmasc')).toBe('hrt-u1-masc-voice-checks');
    });
});

describe('loadVoiceChecks', () => {
    it('returns an empty list when the key is missing or invalid', () => {
        const storage = new MemoryStorage();
        expect(loadVoiceChecks(storage, 'local', 'transfem')).toEqual([]);
        storage.setItem('hrt-voice-checks', '{not json');
        expect(loadVoiceChecks(storage, 'local', 'transfem')).toEqual([]);
        storage.setItem('hrt-voice-checks', JSON.stringify([check('a'), { id: 1 }, null]));
        expect(loadVoiceChecks(storage, 'local', 'transfem').map(c => c.id)).toEqual(['a']);
    });

    it('keeps each mode separate', () => {
        const storage = new MemoryStorage();
        addVoiceCheck(storage, 'u1', 'transfem', check('f'));
        addVoiceCheck(storage, 'u1', 'transmasc', check('m'));
        expect(loadVoiceChecks(storage, 'u1', 'transfem').map(c => c.id)).toEqual(['f']);
        expect(loadVoiceChecks(storage, 'u1', 'transmasc').map(c => c.id)).toEqual(['m']);
    });
});

describe('addVoiceCheck', () => {
    it('prepends and caps the list at 100 newest checks', () => {
        const storage = new MemoryStorage();
        for (let i = 0; i < 105; i++) addVoiceCheck(storage, 'u1', 'transfem', check(String(i), i));

        const loaded = loadVoiceChecks(storage, 'u1', 'transfem');
        expect(loaded).toHaveLength(MAX_VOICE_CHECKS);
        expect(loaded[0].id).toBe('104');
        expect(loaded[loaded.length - 1].id).toBe('5');
    });
});

describe('clearAllVoiceChecks', () => {
    it('removes both modes for one owner only', () => {
        const storage = new MemoryStorage();
        addVoiceCheck(storage, 'u1', 'transfem', check('f'));
        addVoiceCheck(storage, 'u1', 'transmasc', check('m'));
        addVoiceCheck(storage, 'u2', 'transfem', check('other'));

        clearAllVoiceChecks(storage, 'u1');

        expect(storage.getItem('hrt-u1-voice-checks')).toBeNull();
        expect(storage.getItem('hrt-u1-masc-voice-checks')).toBeNull();
        expect(loadVoiceChecks(storage, 'u2', 'transfem').map(c => c.id)).toEqual(['other']);
    });
});

describe('isVoiceCheck', () => {
    it('rejects records with an unknown passage or non-finite numbers', () => {
        expect(isVoiceCheck(check('a'))).toBe(true);
        expect(isVoiceCheck({ ...check('a'), passageId: 'fr' })).toBe(false);
        expect(isVoiceCheck({ ...check('a'), medianF0: Number.NaN })).toBe(false);
        expect(isVoiceCheck({ ...check('a'), score: 'high' })).toBe(false);
    });
});

describe('adoption wiring', () => {
    it('lists voice-checks among the mode suffixes', () => {
        const source = readFileSync(resolve(__dirname, '../src/hooks/useAppData.ts'), 'utf8');
        expect(source).toContain("'voice-checks'");
    });
});
