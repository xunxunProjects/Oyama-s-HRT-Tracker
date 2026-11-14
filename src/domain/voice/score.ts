import type { VoiceBucket } from './types';

/** The neutral pitch of the score axis, in Hz. */
export const SCORE_MIDPOINT_HZ = 150;

/** How many Hz separate the midpoint from a full +100 / -100 score. */
export const SCORE_SPAN_HZ = 50;

const MIN_SCORE_HZ = 0;
const MAX_SCORE_HZ = 300;

export const scoreFromF0 = (f0: number, mode: 'transfem' | 'transmasc'): number => {
    if (!Number.isFinite(f0)) return 0;
    const hz = Math.min(MAX_SCORE_HZ, Math.max(MIN_SCORE_HZ, f0));
    const raw = ((hz - SCORE_MIDPOINT_HZ) / SCORE_SPAN_HZ) * 100;
    const clamped = Math.min(100, Math.max(-100, raw));
    const score = mode === 'transmasc' ? -clamped : clamped;
    const rounded = Math.round(score * 10) / 10;
    return rounded === 0 ? 0 : rounded;
};

export const bucketForScore = (score: number): VoiceBucket => {
    if (score >= 80) return 'great';
    if (score >= 60) return 'good';
    if (score >= 20) return 'keep';
    if (score >= -20) return 'needs';
    return 'start';
};
