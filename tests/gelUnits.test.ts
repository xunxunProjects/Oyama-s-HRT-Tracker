import { describe, expect, it } from 'vitest';
import { GEL_PRESETS, convertGelAmount, formatGelMG } from '../src/utils/gelUnits';

describe('gel unit conversion', () => {
    it('binds a unit to the product it came from', () => {
        const ruler = GEL_PRESETS.find(p => p.id === 'oestrogel-cn-ruler');
        const pump = GEL_PRESETS.find(p => p.id === 'oestrogel-pump');

        expect(ruler?.mgPerUnit).toBe(1.5);
        expect(pump?.mgPerUnit).toBe(0.75);
        // 1 尺 is two pumps in the Chinese pack, not one pump anywhere else.
        expect(ruler?.mgPerUnit).not.toBe(pump?.mgPerUnit);
    });

    it('converts a count of units to estradiol mg', () => {
        expect(convertGelAmount(1, 1.5)).toBe(1.5);
        expect(convertGelAmount(0.5, 1.5)).toBe(0.75);
        expect(convertGelAmount(2, 0.6)).toBe(1.2);
    });

    it('rejects a missing or non-positive amount', () => {
        expect(convertGelAmount(0, 1.5)).toBeNull();
        expect(convertGelAmount(-1, 1.5)).toBeNull();
        expect(convertGelAmount(Number.NaN, 1.5)).toBeNull();
        expect(convertGelAmount(1, 0)).toBeNull();
        expect(convertGelAmount(1, Number.POSITIVE_INFINITY)).toBeNull();
    });

    it('writes the result without trailing zeros', () => {
        expect(formatGelMG(1.5)).toBe('1.5');
        expect(formatGelMG(0.75)).toBe('0.75');
        expect(formatGelMG(1)).toBe('1');
        expect(formatGelMG(0.48000000000000004)).toBe('0.48');
    });

    it('keeps every preset usable', () => {
        for (const preset of GEL_PRESETS) {
            expect(preset.mgPerUnit).toBeGreaterThan(0);
            expect(preset.gramsPerUnit).toBeGreaterThan(0);
        }
    });
});
