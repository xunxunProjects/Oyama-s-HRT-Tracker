import { describe, expect, it } from 'vitest';
import { calibrationDomain, formatAxisTick, logTicks, snap125 } from '../src/utils/calibrationAxis';

describe('formatAxisTick', () => {
    it('uses compact scientific notation for huge values', () => {
        expect(formatAxisTick(1e27)).toBe('1e27');
        expect(formatAxisTick(2e23)).toBe('2e23');
        expect(formatAxisTick(1.0000000000000001e23)).toBe('1e23');
    });

    it('keeps ordinary lab values readable', () => {
        expect(formatAxisTick(10)).toBe('10');
        expect(formatAxisTick(150)).toBe('150');
        expect(formatAxisTick(1000)).toBe('1000');
        expect(formatAxisTick(0.1)).toBe('0.1');
        expect(formatAxisTick(0.01)).toBe('0.01');
    });

    it('uses scientific notation for tiny values', () => {
        expect(formatAxisTick(0.001)).toBe('1e-3');
        expect(formatAxisTick(0.00025)).toBe('2.5e-4');
    });
});

describe('logTicks', () => {
    it('bounds an extreme domain to the requested tick count', () => {
        const ticks = logTicks(10, 2e27, 6);

        expect(ticks.length).toBeGreaterThanOrEqual(4);
        expect(ticks.length).toBeLessThanOrEqual(6);
        expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
        expect(new Set(ticks.map(formatAxisTick)).size).toBe(ticks.length);
    });

    it('keeps the 1-2-5 detail for a normal domain', () => {
        expect(logTicks(10, 1000, 8)).toEqual([10, 20, 50, 100, 200, 500, 1000]);
    });

    it('returns an empty list for invalid or empty domains', () => {
        expect(logTicks(0, 100)).toEqual([]);
        expect(logTicks(10, Infinity)).toEqual([]);
        expect(logTicks(100, 10)).toEqual([]);
        expect(logTicks(10, 100, 1)).toEqual([]);
    });
});

describe('snap125', () => {
    it('snaps outwards to the 1-2-5 sequence', () => {
        expect(snap125(123, 'down')).toBe(100);
        expect(snap125(123, 'up')).toBe(200);
        expect(snap125(1e27, 'up')).toBe(1e27);
    });

    it('leaves invalid values alone', () => {
        expect(snap125(0, 'up')).toBe(0);
        expect(snap125(Number.NaN, 'down')).toBeNaN();
    });
});

describe('calibrationDomain', () => {
    it('snaps a domain around finite positive values and ignores invalid ones', () => {
        const domain = calibrationDomain([1e27, 150, 0, Number.NaN, Number.POSITIVE_INFINITY], 6);

        expect(domain).not.toBeNull();
        expect(domain!.lo).toBeGreaterThan(0);
        expect(domain!.hi).toBeGreaterThanOrEqual(1e27);
        expect(domain!.ticks.length).toBeLessThanOrEqual(6);
        expect(domain!.ticks.every(v => v >= domain!.lo && v <= domain!.hi)).toBe(true);
    });

    it('returns null when there is no usable value', () => {
        expect(calibrationDomain([0, -1, Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
    });
});
