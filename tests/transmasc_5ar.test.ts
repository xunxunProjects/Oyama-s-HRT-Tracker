import { describe, expect, it } from 'vitest';
import { DEFAULT_5AR, dhtFromTestosterone } from '../logic';

describe('5-alpha-reductase inhibition (Phase 8.1)', () => {
    it('finasteride lowers DHT relative to none', () => {
        const none = dhtFromTestosterone(500, DEFAULT_5AR.none.inhibition);
        const fin = dhtFromTestosterone(500, DEFAULT_5AR.finasteride.inhibition);
        expect(fin).toBeLessThan(none);
    });
    it('dutasteride lowers DHT more than finasteride', () => {
        const fin = dhtFromTestosterone(500, DEFAULT_5AR.finasteride.inhibition);
        const dut = dhtFromTestosterone(500, DEFAULT_5AR.dutasteride.inhibition);
        expect(dut).toBeLessThan(fin);
    });
    it('zero inhibition gives baseline DHT', () => {
        const base = dhtFromTestosterone(500, 0);
        expect(base).toBeGreaterThan(0);
    });
});
