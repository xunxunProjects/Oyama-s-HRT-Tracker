import { describe, expect, it } from 'vitest';
import {
    DEFAULT_HYDRATION_STATE,
    applyPlasmaVolume,
    estimatePlasmaVolumeL,
    estimateTbwL,
    hydrationDelta,
    hydrationDeltaSummary,
    plasmaVolumeRatio,
    urineColorOffset,
    type HydrationState,
    type WaterIntake,
} from '../logic';

const state = (overrides: Partial<HydrationState> = {}): HydrationState => ({
    ...DEFAULT_HYDRATION_STATE,
    ...overrides,
});

const water = (timeH: number, cups: number, id = 'w1'): WaterIntake => ({ id, timeH, cups });

describe('hydration volume estimates', () => {
    it('uses the 0.6 fallback when body fat is unknown', () => {
        expect(estimateTbwL(70, null)).toBeCloseTo(42, 10);
    });

    it('uses lean mass when body fat is known', () => {
        expect(estimateTbwL(70, 25)).toBeCloseTo(38.325, 10);
    });

    it('estimates plasma volume as 7.5% of total body water', () => {
        expect(estimatePlasmaVolumeL(42)).toBeCloseTo(3.15, 10);
    });
});

describe('urineColorOffset', () => {
    it('maps the 8-level scale to small hydration offsets', () => {
        expect(urineColorOffset(1)).toBeCloseTo(0.02, 10);
        expect(urineColorOffset(3)).toBe(0);
        expect(urineColorOffset(8)).toBeCloseTo(-0.08, 10);
    });
});

describe('plasmaVolumeRatio', () => {
    it('stays at baseline without water or urine color', () => {
        expect(plasmaVolumeRatio([9, 10, 11], state(), 70)).toEqual([1, 1, 1]);
    });

    it('rises after a cup, then decays monotonically', () => {
        const ratio = plasmaVolumeRatio([9, 10, 11, 12], state({ water: [water(10, 1)] }), 70);

        expect(ratio[0]).toBe(1);
        expect(ratio[1]).toBeGreaterThan(1);
        expect(ratio[2]).toBeGreaterThan(1);
        expect(ratio[2]).toBeLessThan(ratio[1]);
        expect(ratio[3]).toBeLessThan(ratio[2]);
        expect(ratio[3]).toBeGreaterThan(1);
    });

    it('treats two same-time cups as one two-cup event', () => {
        const twoEvents = state({
            water: [water(10, 1, 'a'), water(10, 1, 'b')],
        });
        const oneEvent = state({ water: [water(10, 2)] });

        const a = plasmaVolumeRatio([9, 10, 11], twoEvents, 70);
        const b = plasmaVolumeRatio([9, 10, 11], oneEvent, 70);
        for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 10);
    });

    it('lowers the baseline for dark urine even without water', () => {
        const ratio = plasmaVolumeRatio([9, 10], state({ urineColor: 8 }), 70);

        for (const value of ratio) {
            expect(value).toBeLessThan(1);
            expect(value).toBeGreaterThanOrEqual(0.7);
        }
    });

    it('clamps extreme water intake at 1.5', () => {
        const ratio = plasmaVolumeRatio([9, 10, 11], state({ water: [water(10, 100)] }), 70);

        for (const value of ratio) expect(value).toBeLessThanOrEqual(1.5);
    });

    it('ignores invalid cups and does not mutate its inputs', () => {
        const waterEvents = [water(10, -2), water(10, Number.NaN), water(10, Infinity)];
        const hydration = state({ water: waterEvents });
        const times = [9, 10, 11];
        const cupsBefore = waterEvents.map((event) => event.cups);

        expect(plasmaVolumeRatio(times, hydration, 70)).toEqual([1, 1, 1]);
        expect(waterEvents.map((event) => event.cups)).toEqual(cupsBefore);
        expect(times).toEqual([9, 10, 11]);
    });
});

describe('applyPlasmaVolume', () => {
    const values = [100, 200];
    const ratio = [1, 0.5];

    it('leaves the model unchanged when alpha is zero', () => {
        expect(applyPlasmaVolume(values, ratio, 0)).toEqual([100, 200]);
    });

    it('applies full plasma-volume dilution when alpha is one', () => {
        expect(applyPlasmaVolume(values, ratio, 1)).toEqual([100, 400]);
    });

    it('applies the square-root dilution at the default alpha', () => {
        const adjusted = applyPlasmaVolume(values, ratio, 0.5);
        expect(adjusted[0]).toBeCloseTo(100, 10);
        expect(adjusted[1]).toBeCloseTo(282.842712474619, 9);
    });

    it('does not mutate its inputs and returns finite values', () => {
        const adjusted = applyPlasmaVolume(values, ratio, 0.5);
        expect(adjusted.every(Number.isFinite)).toBe(true);
        expect(values).toEqual([100, 200]);
        expect(ratio).toEqual([1, 0.5]);
    });
});

describe('hydrationDelta', () => {
    it('returns the difference between adjusted and model values', () => {
        expect(hydrationDelta([100, 200], [100, 400])).toEqual([0, 200]);
    });

    it('returns an empty array when the series do not match', () => {
        expect(hydrationDelta([], [1])).toEqual([]);
        expect(hydrationDelta([1, 2], [1])).toEqual([]);
    });
});

describe('hydrationDeltaSummary', () => {
    it('summarises the latest delta as a value and a percentage', () => {
        expect(hydrationDeltaSummary([100, 200], [100, 400])).toEqual({ absolute: 200, percent: 100 });
    });

    it('returns null when there is no comparable series', () => {
        expect(hydrationDeltaSummary([], [1])).toBeNull();
    });

    it('treats a non-finite adjusted point as zero delta', () => {
        expect(hydrationDeltaSummary([100], [Number.NaN])).toEqual({ absolute: 0, percent: 0 });
    });

    it('does not divide by a zero model value', () => {
        expect(hydrationDeltaSummary([0], [10])).toEqual({ absolute: 10, percent: 0 });
    });
});
