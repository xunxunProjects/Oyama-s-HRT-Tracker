import { describe, expect, it } from 'vitest';
import { bucketForScore, scoreFromF0, SCORE_MIDPOINT_HZ, SCORE_SPAN_HZ } from '../src/domain/voice/score';

describe('scoreFromF0', () => {
    it('maps the 150 Hz midpoint to zero in both modes', () => {
        expect(scoreFromF0(150, 'transfem')).toBe(0);
        expect(scoreFromF0(150, 'transmasc')).toBe(0);
    });

    it('scores higher pitch toward the transfem goal', () => {
        expect(scoreFromF0(100, 'transfem')).toBe(-100);
        expect(scoreFromF0(125, 'transfem')).toBe(-50);
        expect(scoreFromF0(175, 'transfem')).toBe(50);
        expect(scoreFromF0(200, 'transfem')).toBe(100);
    });

    it('scores lower pitch toward the transmasc goal', () => {
        expect(scoreFromF0(100, 'transmasc')).toBe(100);
        expect(scoreFromF0(125, 'transmasc')).toBe(50);
        expect(scoreFromF0(175, 'transmasc')).toBe(-50);
        expect(scoreFromF0(200, 'transmasc')).toBe(-100);
    });

    it('clamps input frequencies to 0..300 Hz and scores to -100..100', () => {
        expect(scoreFromF0(-50, 'transfem')).toBe(-100);
        expect(scoreFromF0(0, 'transfem')).toBe(-100);
        expect(scoreFromF0(300, 'transfem')).toBe(100);
        expect(scoreFromF0(1000, 'transfem')).toBe(100);
        expect(scoreFromF0(-50, 'transmasc')).toBe(100);
        expect(scoreFromF0(1000, 'transmasc')).toBe(-100);
    });

    it('keeps one decimal of precision', () => {
        expect(scoreFromF0(151, 'transfem')).toBe(2);
        expect(scoreFromF0(162.5, 'transfem')).toBe(25);
        expect(scoreFromF0(149, 'transfem')).toBe(-2);
    });

    it('exposes the score axis constants', () => {
        expect(SCORE_MIDPOINT_HZ).toBe(150);
        expect(SCORE_SPAN_HZ).toBe(50);
    });
});

describe('bucketForScore', () => {
    it('uses the design boundaries', () => {
        expect(bucketForScore(100)).toBe('great');
        expect(bucketForScore(80)).toBe('great');
        expect(bucketForScore(79)).toBe('good');
        expect(bucketForScore(60)).toBe('good');
        expect(bucketForScore(59)).toBe('keep');
        expect(bucketForScore(20)).toBe('keep');
        expect(bucketForScore(19)).toBe('needs');
        expect(bucketForScore(-20)).toBe('needs');
        expect(bucketForScore(-21)).toBe('start');
        expect(bucketForScore(-100)).toBe('start');
    });
});
