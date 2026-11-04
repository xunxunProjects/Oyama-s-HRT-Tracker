import { describe, expect, it } from 'vitest';
import { applySyncedStateToStorage, buildExportPayloadFromStorage, modeKeyFor } from '../src/utils/backupState';
import { fingerprintState, hasContent, mergeSyncStates, normalizeSyncState } from '../src/utils/syncMerge';
import { Ester, Route } from '../logic';
import { MemoryStorage } from './memoryStorage';

const item = (id: string, doseMG: number) => ({
    id,
    route: Route.oral,
    ester: Ester.EV,
    doseMG,
    extras: {},
    everyDays: 1,
    timesPerDay: 2,
});

const active = { events: [], labResults: [], doseTemplates: [], weight: 70, birthYear: null, pkParams: null };

/** One device's storage, holding a plan stamped at `at` (0 = never stamped). */
const device = (plan: unknown[] | null, at = 0) => {
    const storage = new MemoryStorage();
    if (plan) storage.setItem(modeKeyFor('u1', 'transfem', 'plan'), JSON.stringify(plan));
    if (at) storage.setItem(modeKeyFor('u1', 'transfem', 'plan-at'), String(at));
    return storage;
};

const stateOf = (storage: MemoryStorage) =>
    normalizeSyncState(JSON.parse(JSON.stringify(buildExportPayloadFromStorage(storage, 'u1', 'transfem', active))));

describe('medication plan sync', () => {
    it('puts the plan in the sync payload', () => {
        const payload = buildExportPayloadFromStorage(device([item('a', 2)], 500), 'u1', 'transfem', active);
        expect(payload.modes.transfem.plan).toHaveLength(1);
        expect(payload.modes.transfem.planUpdatedAt).toBe(500);
        expect(payload.modes.transmasc.plan).toBeUndefined();
    });

    it('a new device with no plan takes the plan from the cloud', () => {
        const phone = stateOf(device(null));
        const cloud = stateOf(device([item('a', 2)], 500));
        expect(hasContent(cloud)).toBe(true);
        const result = mergeSyncStates(phone, cloud);
        expect(result.localChanged).toBe(true);
        expect(result.remoteStale).toBe(false);

        const storage = device(null);
        const applied = applySyncedStateToStorage(storage, 'u1', 'transfem', result.merged);
        expect(applied.active.plan?.map(i => i.id)).toEqual(['a']);
        expect(storage.getItem(modeKeyFor('u1', 'transfem', 'plan-at'))).toBe('500');
    });

    it('the newer edit wins, both ways', () => {
        const older = stateOf(device([item('a', 2)], 500));
        const newer = stateOf(device([item('a', 4)], 900));
        expect(mergeSyncStates(older, newer).merged.modes.transfem.plan?.[0].doseMG).toBe(4);
        expect(mergeSyncStates(newer, older).merged.modes.transfem.plan?.[0].doseMG).toBe(4);
    });

    it('clearing the plan reaches the other device', () => {
        const cleared = stateOf(device([], 900));
        const other = stateOf(device([item('a', 2)], 500));
        const merged = mergeSyncStates(other, cleared).merged;
        expect(merged.modes.transfem.plan).toEqual([]);
    });

    it('an untouched empty plan does not erase another device', () => {
        const empty = stateOf(device([]));
        expect(empty.modes.transfem.plan).toBeUndefined();
        const merged = mergeSyncStates(empty, stateOf(device([item('a', 2)]))).merged;
        expect(merged.modes.transfem.plan).toHaveLength(1);
    });

    it('a plan edit changes the fingerprint, so it gets pushed', () => {
        expect(fingerprintState(stateOf(device([item('a', 2)], 500)))).not.toBe(
            fingerprintState(stateOf(device([item('a', 4)], 500))),
        );
    });

    it('a cloud copy from an older build leaves the local plan alone', () => {
        const local = stateOf(device([item('a', 2)], 500));
        const old = normalizeSyncState({ modes: { transfem: { events: [] }, transmasc: { events: [] } } });
        const result = mergeSyncStates(local, old);
        expect(result.localChanged).toBe(false);
        expect(result.remoteStale).toBe(true);
    });
});
