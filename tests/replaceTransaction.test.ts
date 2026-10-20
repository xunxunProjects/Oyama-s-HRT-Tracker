import { describe, expect, it } from 'vitest';
import { DEFAULT_PK_PARAMS } from '../logic';
import {
    COMPLETE_BACKUP_FORMAT,
    COMPLETE_BACKUP_FORMAT_VERSION,
    replaceCompleteBackupBundleToStorage,
    type CompleteBackupActive,
    type CompleteBackupBundle,
    type CompleteBackupContext,
    type CompleteBackupMode,
} from '../src/utils/backupBundle';
import {
    REPLACE_JOURNAL_KEY,
    applyReplaceJournal,
    journalChecksum,
    recoverReplaceJournal,
    type ReplaceJournalEntry,
} from '../src/utils/replaceJournal';
import { mergeSyncStates, normalizeSyncState } from '../src/utils/syncMerge';

const NOW = 1_800_000_000_000;

class FakeStorage {
    readonly map = new Map<string, string>();
    /** Throw once when this key is written, for rollback tests. */
    failOnceOn: string | null = null;

    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        if (this.failOnceOn === key) {
            this.failOnceOn = null;
            throw new DOMException('synthetic quota failure', 'QuotaExceededError');
        }
        this.map.set(key, value);
    }

    removeItem(key: string): void {
        this.map.delete(key);
    }

    snapshot(): Record<string, string> {
        return Object.fromEntries([...this.map.entries()].sort(([a], [b]) => a.localeCompare(b)));
    }
}

const event = (id: string, doseMG = 5) => ({
    id,
    route: 'injection',
    ester: 'EV',
    doseMG,
    timeH: 500_000,
    extras: {},
    updatedAt: NOW - 60_000,
});

const lab = (id: string) => ({
    id,
    timeH: 500_000,
    concValue: 180,
    unit: 'pg/ml',
    updatedAt: NOW - 60_000,
});

const template = (id: string) => ({
    id,
    name: 'Weekly EV',
    route: 'injection',
    ester: 'EV',
    doseMG: 5,
    extras: {},
    createdAt: NOW - 120_000,
    updatedAt: NOW - 60_000,
});

const quickDose = (id: string) => ({
    id,
    route: 'oral',
    ester: 'E2',
    value: 2,
    createdAt: NOW - 120_000,
});

const supply = (id: string) => ({
    id,
    route: 'injection',
    ester: 'EV',
    pack: { kind: 'vial', ml: 5, mgPerMl: 10 },
    count: 3,
    startedAt: NOW - 120_000,
});

const plan = (id: string) => ({
    id,
    route: 'injection',
    ester: 'EV',
    doseMG: 5,
    extras: {},
    everyDays: 7,
    timesPerDay: 1,
});

const mode = (prefix: string): CompleteBackupMode =>
    ({
        events: [event(`${prefix}-event`)],
        labResults: [lab(`${prefix}-lab`)],
        doseTemplates: [template(`${prefix}-template`)],
        quickDoses: [quickDose(`${prefix}-quick`)],
        supplies: [supply(`${prefix}-supply`)],
        plan: [plan(`${prefix}-plan`)],
        deletions: { events: {}, labResults: {}, doseTemplates: {} },
    }) as unknown as CompleteBackupMode;

const bundle = (overrides: Partial<CompleteBackupBundle> = {}): CompleteBackupBundle => ({
    format: COMPLETE_BACKUP_FORMAT,
    formatVersion: COMPLETE_BACKUP_FORMAT_VERSION,
    createdAt: '2030-01-01T00:00:00.000Z',
    mode: 'transfem',
    modes: { transfem: mode('tf'), transmasc: mode('tm') },
    weight: 65,
    weightUpdatedAt: NOW - 60_000,
    pkParams: { ...DEFAULT_PK_PARAMS, e2_kClear: 0.42 },
    pkParamsUpdatedAt: NOW - 60_000,
    calibration: { method: 'off', historyMode: 'forward' },
    preferences: { 'app-theme': 'dark', 'hrt-lang': 'en' },
    ...overrides,
});

const active: CompleteBackupActive = {
    events: [],
    labResults: [],
    doseTemplates: [],
    quickDoses: [],
    supplies: [],
    plan: [],
    weight: 70,
    pkParams: null,
    calibrationMethod: 'mipd',
    calibrationHistoryMode: 'retrospective',
};

const context = (storage: FakeStorage): CompleteBackupContext => ({
    storage,
    owner: 'local',
    mode: 'transfem',
    active,
    now: NOW,
});

const seedExistingData = (storage: FakeStorage): void => {
    storage.setItem('hrt-events', JSON.stringify([event('old-local')]));
    storage.setItem('hrt-masc-events', JSON.stringify([event('old-masc')]));
    storage.setItem('hrt-masc-lab-results', JSON.stringify([lab('old-masc-lab')]));
    storage.setItem('hrt-weight', '70');
    storage.setItem('hrt-weight-at', String(NOW - 500_000));
    storage.setItem('hrt-pk-params', JSON.stringify({ e2_kClear: 0.5 }));
    storage.setItem('hrt-pk-params-at', String(NOW - 500_000));
    storage.setItem('hrt-cal-method', 'mipd');
    storage.setItem('hrt-cal-history-mode', 'retrospective');
    storage.setItem('auth_token', 'SECRET-TOKEN-SENTINEL');
    storage.setItem('app-auto-backup', 'false');
};

describe('complete-backup replace transaction', () => {
    it('replaces both modes and scalars, leaves unrelated keys alone, and removes the journal', () => {
        const storage = new FakeStorage();
        seedExistingData(storage);

        const result = replaceCompleteBackupBundleToStorage(bundle(), context(storage));

        expect(result.applied).toContain('transfem.events');
        expect(result.applied).toContain('transmasc.events');
        expect(result.applied).toContain('calibration');
        expect(JSON.parse(storage.getItem('hrt-events')!)).toEqual([event('tf-event')]);
        expect(JSON.parse(storage.getItem('hrt-masc-events')!)).toEqual([event('tm-event')]);
        expect(JSON.parse(storage.getItem('hrt-masc-lab-results')!)).toEqual([lab('tm-lab')]);
        expect(storage.getItem('hrt-weight')).toBe('65');
        // Stamped as the moment of the replace, like a value set by hand, so a
        // newer value in the cloud does not win it back on the next sync.
        expect(storage.getItem('hrt-weight-at')).toBe(String(NOW));
        expect(JSON.parse(storage.getItem('hrt-pk-params')!)).toEqual({
            ...DEFAULT_PK_PARAMS,
            e2_kClear: 0.42,
        });
        expect(storage.getItem('hrt-pk-params-at')).toBe(String(NOW));
        expect(storage.getItem('hrt-cal-method')).toBe('off');
        expect(storage.getItem('hrt-cal-history-mode')).toBe('forward');
        expect(storage.getItem('auth_token')).toBe('SECRET-TOKEN-SENTINEL');
        expect(storage.getItem('app-auto-backup')).toBe('false');
        expect(storage.getItem(REPLACE_JOURNAL_KEY)).toBeNull();
    });

    it('replaces only the target account namespace', () => {
        const storage = new FakeStorage();
        storage.setItem('hrt-uuser-1-events', JSON.stringify([event('account-old')]));
        storage.setItem('hrt-events', JSON.stringify([event('local-keep')]));
        const accountContext = { ...context(storage), owner: 'user-1' };

        replaceCompleteBackupBundleToStorage(bundle(), accountContext);

        expect(JSON.parse(storage.getItem('hrt-uuser-1-events')!)).toEqual([event('tf-event')]);
        expect(JSON.parse(storage.getItem('hrt-events')!)).toEqual([event('local-keep')]);
        expect(storage.getItem('hrt-uuser-1-cal-method')).toBe('off');
        // The deletions it leaves behind stay in the account's namespace too.
        expect(JSON.parse(storage.getItem('hrt-uuser-1-deletions')!).events).toEqual({ 'account-old': NOW });
        expect(storage.getItem('hrt-deletions')).toBeNull();
    });

    it('deletes what the backup leaves out, so a sync cannot bring it back', () => {
        const storage = new FakeStorage();
        seedExistingData(storage);
        storage.setItem(
            'hrt-deletions',
            JSON.stringify({
                events: { 'deleted-before': NOW - 1_000, 'tf-event': NOW - 2_000, ancient: NOW - 200 * 86_400_000 },
                labResults: {},
                doseTemplates: {},
            }),
        );
        const incoming = bundle({
            modes: {
                transfem: {
                    ...mode('tf'),
                    deletions: { events: { 'bundle-deleted': NOW - 3_000 }, labResults: {}, doseTemplates: {} },
                } as unknown as CompleteBackupMode,
                transmasc: mode('tm'),
            },
        });
        const inMemory = { ...active, events: [event('in-memory-only')] } as unknown as CompleteBackupActive;

        const result = replaceCompleteBackupBundleToStorage(incoming, { ...context(storage), active: inMemory });

        const transfem = JSON.parse(storage.getItem('hrt-deletions')!);
        // Held here and left out of the backup: deleted now. Already known
        // deletions stay; the one for a record the backup brings back goes,
        // and so does one past its lifetime.
        expect(transfem.events).toEqual({
            'deleted-before': NOW - 1_000,
            'bundle-deleted': NOW - 3_000,
            'old-local': NOW,
            'in-memory-only': NOW,
        });
        expect(JSON.parse(storage.getItem('hrt-masc-deletions')!)).toEqual({
            events: { 'old-masc': NOW },
            labResults: { 'old-masc-lab': NOW },
            doseTemplates: {},
        });
        expect(result.modes.transfem?.deletions?.events).toEqual(transfem.events);

        // The cloud copy still holds the old records. Merging it back in, as
        // the next sync does, leaves only what the backup holds.
        const stored = (key: string) => JSON.parse(storage.getItem(key) ?? '[]');
        const local = normalizeSyncState({
            modes: {
                transfem: {
                    events: stored('hrt-events'),
                    labResults: stored('hrt-lab-results'),
                    doseTemplates: stored('hrt-dose-templates'),
                    deletions: transfem,
                },
                transmasc: {
                    events: stored('hrt-masc-events'),
                    labResults: stored('hrt-masc-lab-results'),
                    doseTemplates: stored('hrt-masc-dose-templates'),
                    deletions: stored('hrt-masc-deletions'),
                },
            },
        });
        const cloud = normalizeSyncState({
            modes: {
                transfem: { events: [event('old-local'), event('in-memory-only')] },
                transmasc: { events: [event('old-masc')], labResults: [lab('old-masc-lab')] },
            },
        });
        const { merged } = mergeSyncStates(local, cloud);
        expect(merged.modes.transfem.events.map(e => e.id)).toEqual(['tf-event']);
        expect(merged.modes.transmasc.events.map(e => e.id)).toEqual(['tm-event']);
        expect(merged.modes.transmasc.labResults.map(l => l.id)).toEqual(['tm-lab']);
    });

    it('refuses an incomplete bundle before writing anything', () => {
        const storage = new FakeStorage();
        seedExistingData(storage);
        const before = storage.snapshot();
        const incomplete = bundle({
            modes: {
                transfem: mode('tf'),
                transmasc: { events: [event('tm-event')] } as unknown as CompleteBackupMode,
            },
        });

        expect(() => replaceCompleteBackupBundleToStorage(incomplete, context(storage))).toThrow();
        expect(storage.snapshot()).toEqual(before);
        expect(storage.getItem(REPLACE_JOURNAL_KEY)).toBeNull();
    });

    it('refuses duplicate ids and dropped invalid records', () => {
        const storage = new FakeStorage();
        seedExistingData(storage);
        const before = storage.snapshot();
        const duplicate = bundle({
            modes: {
                transfem: {
                    ...mode('tf'),
                    events: [event('tf-event'), event('tf-event', 9)],
                } as unknown as CompleteBackupMode,
                transmasc: mode('tm'),
            },
        });
        expect(() => replaceCompleteBackupBundleToStorage(duplicate, context(storage))).toThrow(/duplicate id/);

        const invalid = bundle({
            modes: {
                transfem: {
                    ...mode('tf'),
                    events: [{ ...event('bad'), timeH: -1 }],
                } as unknown as CompleteBackupMode,
                transmasc: mode('tm'),
            },
        });
        expect(() => replaceCompleteBackupBundleToStorage(invalid, context(storage))).toThrow();
        expect(storage.snapshot()).toEqual(before);
    });

    it('rolls back every key when a target write throws', () => {
        const storage = new FakeStorage();
        seedExistingData(storage);
        const before = storage.snapshot();
        storage.failOnceOn = 'hrt-cal-method';

        expect(() => replaceCompleteBackupBundleToStorage(bundle(), context(storage))).toThrow(
            /synthetic quota failure/,
        );
        expect(storage.snapshot()).toEqual(before);
        expect(storage.getItem(REPLACE_JOURNAL_KEY)).toBeNull();
    });

    it('recovers an interrupted apply before the app reads state', () => {
        const storage = new FakeStorage();
        seedExistingData(storage);
        const before = storage.snapshot();

        // Simulate a crash after the journal was written and one key applied.
        const writes: ReplaceJournalEntry[] = [
            { key: 'hrt-events', value: JSON.stringify([event('new')]) },
            { key: 'hrt-weight', value: '60' },
        ];
        const snapshot = writes.map(write => ({ key: write.key, value: storage.getItem(write.key) }));
        const journal = {
            v: 1 as const,
            phase: 'applying' as const,
            createdAt: NOW,
            owner: 'local',
            writes,
            snapshot,
            checksum: journalChecksum(writes, snapshot),
        };
        storage.setItem('hrt-events', JSON.stringify([event('new')]));
        storage.setItem(REPLACE_JOURNAL_KEY, JSON.stringify(journal));

        expect(recoverReplaceJournal(storage)).toBe('rolled-back');
        expect(storage.snapshot()).toEqual(before);
        expect(storage.getItem(REPLACE_JOURNAL_KEY)).toBeNull();
    });

    it('finishes a committed journal without rolling back', () => {
        const storage = new FakeStorage();
        seedExistingData(storage);
        storage.setItem('hrt-events', JSON.stringify([event('new')]));
        const writes: ReplaceJournalEntry[] = [{ key: 'hrt-events', value: JSON.stringify([event('new')]) }];
        const snapshot = [{ key: 'hrt-events', value: JSON.stringify([event('old-local')]) }];
        storage.setItem(
            REPLACE_JOURNAL_KEY,
            JSON.stringify({
                v: 1,
                phase: 'committed',
                createdAt: NOW,
                owner: 'local',
                writes,
                snapshot,
                checksum: journalChecksum(writes, snapshot),
            }),
        );

        expect(recoverReplaceJournal(storage)).toBe('completed');
        expect(JSON.parse(storage.getItem('hrt-events')!)).toEqual([event('new')]);
        expect(storage.getItem(REPLACE_JOURNAL_KEY)).toBeNull();
    });

    it('refuses a corrupt journal rather than reading a half-replace', () => {
        const storage = new FakeStorage();
        storage.setItem(
            REPLACE_JOURNAL_KEY,
            JSON.stringify({
                v: 1,
                phase: 'applying',
                createdAt: NOW,
                owner: 'local',
                writes: [],
                snapshot: [],
                checksum: 'deadbeef',
            }),
        );
        expect(() => recoverReplaceJournal(storage)).toThrow(/checksum/);
    });

    it('leaves the journal for recovery when rollback itself fails', () => {
        const storage = new FakeStorage();
        seedExistingData(storage);
        storage.setItem('hrt-extra-a', 'old-value');
        const inner = storage.setItem.bind(storage);
        let targetFailed = false;
        storage.setItem = (key: string, value: string) => {
            // The second target write fails, then the first rollback write
            // fails too: the journal must remain for the next startup.
            if (key === 'hrt-cal-method') {
                targetFailed = true;
                throw new DOMException('synthetic quota failure', 'QuotaExceededError');
            }
            if (targetFailed && key === 'hrt-extra-a') {
                throw new DOMException('synthetic rollback failure', 'QuotaExceededError');
            }
            inner(key, value);
        };

        expect(() =>
            applyReplaceJournal(storage, 'local', [
                { key: 'hrt-extra-a', value: 'new-value' },
                { key: 'hrt-cal-method', value: 'off' },
            ]),
        ).toThrow(/partial writes/);
        expect(storage.getItem(REPLACE_JOURNAL_KEY)).not.toBeNull();
    });
});
