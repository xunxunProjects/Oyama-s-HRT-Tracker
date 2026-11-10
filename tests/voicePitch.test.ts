import { describe, expect, it } from 'vitest';
import { detectPitch, frameRms, summarizePitch } from '../src/domain/voice/pitch';

const SAMPLE_RATE = 48000;
const FRAME_SIZE = 4096;

const sine = (freq: number, amplitude = 0.2, samples = FRAME_SIZE): Float32Array => {
    const frame = new Float32Array(samples);
    for (let i = 0; i < samples; i++) frame[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
    return frame;
};

const harmonic = (fundamental: number, amplitude = 0.15): Float32Array => {
    const frame = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) {
        const t = (2 * Math.PI * i) / SAMPLE_RATE;
        frame[i] = amplitude * Math.sin(fundamental * t) + amplitude * 0.5 * Math.sin(2 * fundamental * t);
    }
    return frame;
};

const noise = (amplitude = 0.2): Float32Array => {
    const frame = new Float32Array(FRAME_SIZE);
    let seed = 0x12345678;
    for (let i = 0; i < FRAME_SIZE; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        frame[i] = amplitude * ((seed / 0xffffffff) * 2 - 1);
    }
    return frame;
};

describe('detectPitch', () => {
    it.each([110, 150, 200, 250])('finds a %i Hz sine within 2 Hz', freq => {
        const reading = detectPitch(sine(freq), SAMPLE_RATE);
        expect(reading).not.toBeNull();
        expect(Math.abs(reading!.f0 - freq)).toBeLessThanOrEqual(2);
        expect(reading!.clarity).toBeGreaterThan(0.8);
    });

    it('does not jump an octave on a harmonic-rich 120 Hz signal', () => {
        const reading = detectPitch(harmonic(120), SAMPLE_RATE);
        expect(reading).not.toBeNull();
        expect(Math.abs(reading!.f0 - 120)).toBeLessThanOrEqual(2);
    });

    it('returns null for silence', () => {
        expect(detectPitch(new Float32Array(FRAME_SIZE), SAMPLE_RATE)).toBeNull();
    });

    it('rejects white noise', () => {
        const reading = detectPitch(noise(), SAMPLE_RATE);
        expect(reading === null || reading.clarity < 0.8).toBe(true);
    });
});

describe('frameRms', () => {
    it('measures amplitude', () => {
        expect(frameRms(sine(150))).toBeCloseTo(0.2 / Math.sqrt(2), 2);
        expect(frameRms(new Float32Array(FRAME_SIZE))).toBe(0);
    });
});

describe('summarizePitch', () => {
    it('aggregates voiced frames and ignores silence', () => {
        const frames = [...Array.from({ length: 40 }, () => sine(150)), ...Array.from({ length: 10 }, () => new Float32Array(FRAME_SIZE))];
        const summary = summarizePitch(frames, SAMPLE_RATE);
        expect(summary).not.toBeNull();
        expect(summary!.medianF0).toBeCloseTo(150, 0);
        expect(summary!.p5).toBeLessThanOrEqual(summary!.medianF0);
        expect(summary!.p95).toBeGreaterThanOrEqual(summary!.medianF0);
        expect(summary!.voicedFrames).toBe(40);
        expect(summary!.totalFrames).toBe(50);
        expect(summary!.voicedRatio).toBeGreaterThanOrEqual(0.7);
        expect(summary!.voicedRatio).toBeLessThanOrEqual(0.9);
    });

    it('returns null when there are too few voiced frames', () => {
        const frames = Array.from({ length: 10 }, () => sine(150));
        expect(summarizePitch(frames, SAMPLE_RATE)).toBeNull();
    });
});
