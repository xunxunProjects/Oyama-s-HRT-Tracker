import { describe, expect, it } from 'vitest';
import { applySyncedStateToStorage, buildExportPayloadFromStorage, nsFor } from '../src/utils/backupState';
import { hasContent, mergeSyncStates, normalizeSyncState } from '../src/utils/syncMerge';
import { MemoryStorage } from './memoryStorage';

// #293: the same account showed ~800 pg/mL on one device and ~1000 on another.
// The records matched; the estimator and the age beta were kept per device.

const active = { events: [], labResults: [], doseTemplates: [], weight: 70, birthYear: null, pkParams: null };

const device = (values: Record<string, string>) => {
    const storage = new MemoryStorage();
    for (const [suffix, value] of Object.entries(values)) storage.setItem(nsFor('u1', suffix), value);
    return storage;
};

const stateOf = (storage: MemoryStorage) =>
    normalizeSyncState(JSON.parse(JSON.stringify(buildExportPayloadFromStorage(storage, 'u1', 'transfem', active))));

describe('model settings sync', () => {
    it('leaves them out while the device has never chosen any', () => {
        const payload = buildExportPayloadFromStorage(device({}), 'u1', 'transfem', active);
        expect(payload.modelSettings).toBeUndefined();
    });

    it('a device with defaults takes the other device’s choice', () => {
        const desktop = stateOf(device({}));
        const phone = stateOf(device({ 'cal-method': 'bayes', 'age-beta': 'true', 'model-settings-at': '500' }));
        const { merged, localChanged } = mergeSyncStates(desktop, phone);
        expect(localChanged).toBe(true);
        expect(merged.modelSettings).toEqual({
            calibrationMethod: 'bayes',
            calibrationHistoryMode: 'retrospective',
            ageBeta: true,
        });

        const storage = device({});
        const applied = applySyncedStateToStorage(storage, 'u1', 'transfem', merged);
        expect(applied.modelSettings?.calibrationMethod).toBe('bayes');
        expect(storage.getItem(nsFor('u1', 'cal-method'))).toBe('bayes');
        expect(storage.getItem(nsFor('u1', 'age-beta'))).toBe('true');
        expect(storage.getItem(nsFor('u1', 'model-settings-at'))).toBe('500');
    });

    it('syncs the Personal PK method like any other', () => {
        const desktop = stateOf(device({}));
        const phone = stateOf(device({ 'cal-method': 'mcmc', 'model-settings-at': '600' }));
        const { merged } = mergeSyncStates(desktop, phone);
        expect(merged.modelSettings?.calibrationMethod).toBe('mcmc');
        const storage = device({});
        applySyncedStateToStorage(storage, 'u1', 'transfem', merged);
        expect(storage.getItem(nsFor('u1', 'cal-method'))).toBe('mcmc');
    });

    it('the newer edit wins', () => {
        const older = stateOf(device({ 'cal-method': 'off', 'model-settings-at': '100' }));
        const newer = stateOf(
            device({ 'cal-method': 'ekf', 'cal-history-mode': 'forward', 'model-settings-at': '200' }),
        );
        expect(mergeSyncStates(older, newer).merged.modelSettings?.calibrationMethod).toBe('ekf');
        expect(mergeSyncStates(newer, older).merged.modelSettings?.calibrationMethod).toBe('ekf');
    });

    it('choices from before this synced still agree on both devices', () => {
        const a = stateOf(device({ 'cal-method': 'off' }));
        const b = stateOf(device({ 'cal-method': 'ekf' }));
        expect(a.modelSettingsUpdatedAt).toBe(1);
        expect(hasContent(a)).toBe(false);
        expect(mergeSyncStates(a, b).merged.modelSettings).toEqual(mergeSyncStates(b, a).merged.modelSettings);
    });

    it('reads the old per-device age beta key', () => {
        const storage = new MemoryStorage();
        storage.setItem('app-age-beta', 'true');
        expect(stateOf(storage).modelSettings?.ageBeta).toBe(true);
    });

    it('ignores a malformed value from the cloud', () => {
        const storage = device({ 'cal-method': 'off' });
        const state = stateOf(storage);
        state.modelSettings = { calibrationMethod: 'nope', calibrationHistoryMode: 'forward', ageBeta: true };
        state.modelSettingsUpdatedAt = 900;
        const applied = applySyncedStateToStorage(storage, 'u1', 'transfem', state);
        expect(applied.modelSettings).toBeUndefined();
        expect(storage.getItem(nsFor('u1', 'cal-method'))).toBe('off');
    });
});
