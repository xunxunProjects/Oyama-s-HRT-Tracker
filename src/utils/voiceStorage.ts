import type { ModeKey } from './sync/types';
import { modeKeyFor, type StorageLike } from './backupState';
import type { VoiceCheck, VoicePassageId } from '../domain/voice/types';

export const VOICE_CHECKS_SUFFIX = 'voice-checks';
export const MAX_VOICE_CHECKS = 100;

const PASSAGE_IDS: readonly VoicePassageId[] = ['zh', 'en', 'ru', 'uk'];

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

export function isVoiceCheck(value: unknown): value is VoiceCheck {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record.id === 'string' &&
        isFiniteNumber(record.at) &&
        isFiniteNumber(record.medianF0) &&
        isFiniteNumber(record.p5) &&
        isFiniteNumber(record.p95) &&
        isFiniteNumber(record.score) &&
        isFiniteNumber(record.voicedRatio) &&
        isFiniteNumber(record.durationMs) &&
        PASSAGE_IDS.includes(record.passageId as VoicePassageId)
    );
}

export function voiceChecksKey(owner: string, mode: ModeKey): string {
    return modeKeyFor(owner, mode, VOICE_CHECKS_SUFFIX);
}

export function loadVoiceChecks(storage: StorageLike, owner: string, mode: ModeKey): VoiceCheck[] {
    try {
        const raw = storage.getItem(voiceChecksKey(owner, mode));
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isVoiceCheck) : [];
    } catch {
        return [];
    }
}

export function addVoiceCheck(
    storage: StorageLike,
    owner: string,
    mode: ModeKey,
    check: VoiceCheck,
): VoiceCheck[] {
    const next = [check, ...loadVoiceChecks(storage, owner, mode)].slice(0, MAX_VOICE_CHECKS);
    try {
        storage.setItem(voiceChecksKey(owner, mode), JSON.stringify(next));
    } catch {
        // The caller keeps the result on screen; persistence is best effort.
    }
    return next;
}

export function clearAllVoiceChecks(storage: StorageLike, owner: string): void {
    for (const mode of ['transfem', 'transmasc'] as const) {
        try {
            storage.removeItem(voiceChecksKey(owner, mode));
        } catch {
            // Ignore storage failures; the page still clears its in-memory list.
        }
    }
}
