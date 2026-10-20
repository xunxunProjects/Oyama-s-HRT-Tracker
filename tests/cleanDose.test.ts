import { describe, expect, it } from 'vitest';
import { cleanDoseMG } from '../src/utils/cleanDose';
import { mergeSyncStates, normalizeSyncState } from '../src/utils/syncMerge';

describe('cleanDoseMG', () => {
    it('drops the float tail a unit conversion left', () => {
        expect(cleanDoseMG(12.499934062706513)).toBe(12.5);
        expect(cleanDoseMG(5.00006)).toBe(5);
        expect(cleanDoseMG(0.30000000000000004)).toBe(0.3);
    });

    it('leaves doses people type alone', () => {
        for (const mg of [0, 0.0375, 0.1, 1.2345, 2, 12.5, 100, 1000]) expect(cleanDoseMG(mg)).toBe(mg);
    });

    it('never moves a dose by more than 0.01%', () => {
        for (let i = 0; i < 2000; i++) {
            const mg = Math.random() * 10 ** (Math.random() * 6 - 3);
            expect(Math.abs(cleanDoseMG(mg) - mg)).toBeLessThanOrEqual(mg * 1e-4);
        }
    });
});

describe('sync with a tidied copy of a dose', () => {
    it('reads 12.5 and 12.499934062706513 of the same record as no change', () => {
        const record = (doseMG: number) => ({
            id: 'synthetic-cpa',
            route: 'oral',
            ester: 'CPA',
            timeH: 500_000,
            doseMG,
            extras: {},
            updatedAt: 1_000,
        });
        const local = normalizeSyncState({ modes: { transfem: { events: [record(12.5)] } } });
        const remote = normalizeSyncState({ modes: { transfem: { events: [record(12.499934062706513)] } } });
        const result = mergeSyncStates(local, remote);
        expect(result.localChanged).toBe(false);
        expect(result.remoteStale).toBe(false);
    });
});
