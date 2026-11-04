import { describe, expect, it } from 'vitest';
import {
    e2PgMlToPmolL,
    e2PmolLToPgMl,
    E2_PK_SAMPLING_OFFSETS_H,
    validateE2PKParams,
    DEFAULT_PK_PARAMS,
} from '../logic';

describe('E2 PK parameter debugging (A9)', () => {
    it('unit conversion round-trips', () => {
        const v = 100;
        expect(e2PmolLToPgMl(e2PgMlToPmolL(v))).toBeCloseTo(v, 3);
    });
    it('sampling offsets include 24h', () => {
        expect(E2_PK_SAMPLING_OFFSETS_H).toContain(24);
    });
    it('validateE2PKParams accepts defaults', () => {
        expect(validateE2PKParams(DEFAULT_PK_PARAMS)).toBe(true);
    });
});
