export type VoicePassageId = 'zh' | 'en' | 'ru' | 'uk';

export interface VoiceCheck {
    id: string;
    at: number;
    medianF0: number;
    p5: number;
    p95: number;
    score: number;
    voicedRatio: number;
    durationMs: number;
    passageId: VoicePassageId;
}

export type VoiceBucket = 'great' | 'good' | 'keep' | 'needs' | 'start';
