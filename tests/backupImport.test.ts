import { describe, expect, it } from 'vitest';
import { DOSE_MG_MAX, Ester, Route, type LabResult } from '../logic';
import {
    mergeImportedDataToStorage,
    processImportedDataToStorage,
    type ImportActiveRecords,
    type ImportStorageContext,
} from '../src/utils/backupImport';
import { modeKeyFor, readTombstonesFromStorage, type StorageLike } from '../src/utils/backupState';
import { emptyTombstones, type ModeKey, type Tombstones } from '../src/utils/syncMerge';

/** Synthetic values only. No fixture here contains real health data or secrets. */
const OWNER = 'synthetic-user';
const NOW = 1_900_000_000_000;

class MemoryStorage implements StorageLike {
    readonly map = new Map<string, string>();
    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }
    removeItem(key: string): void {
        this.map.delete(key);
    }
    snapshot(): string {
        return JSON.stringify([...this.map.entries()].sort(([a], [b]) => a.localeCompare(b)));
    }
}

const key = (mode: ModeKey, suffix: string) => modeKeyFor(OWNER, mode, suffix);

const event = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    route: Route.sublingual,
    timeH: 500_000,
    doseMG: 2,
    ester: Ester.E2,
    extras: {},
    ...overrides,
});

const tEvent = (id: string, overrides: Record<string, unknown> = {}) =>
    event(id, { route: Route.injection, ester: Ester.TE, ...overrides });

const lab = (id: string, overrides: Record<string, unknown> = {}): LabResult =>
    ({
        id,
        timeH: 500_000,
        concValue: 120,
        unit: 'pg/ml',
        ...overrides,
    }) as LabResult;

const tLab = (id: string, overrides: Record<string, unknown> = {}) => lab(id, { unit: 'ng/dl', ...overrides });

const template = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    name: 'Synthetic template',
    route: Route.oral,
    ester: Ester.E2,
    doseMG: 2,
    extras: {},
    createdAt: 1_000,
    ...overrides,
});

const active = (overrides: Partial<ImportActiveRecords> = {}): ImportActiveRecords => ({
    events: [],
    labResults: [],
    doseTemplates: [],
    weight: 70,
    ...overrides,
});

const context = (
    storage: MemoryStorage,
    mode: ModeKey,
    records: ImportActiveRecords = active(),
): ImportStorageContext => ({ storage, owner: OWNER, mode, active: records });

const ids = (records: { id: string }[]) => records.map(record => record.id);

const seedMode = (storage: MemoryStorage, mode: ModeKey, records: Record<string, unknown[]>) => {
    for (const [suffix, value] of Object.entries(records)) {
        storage.setItem(key(mode, suffix), JSON.stringify(value));
    }
};

const seedTombstones = (storage: MemoryStorage, mode: ModeKey, tombstones: Tombstones) => {
    storage.setItem(key(mode, 'deletions'), JSON.stringify(tombstones));
};

describe('production import reconciliation', () => {
    it('imports a v2 payload: replaces present kinds, preserves absent ones, and tombstones drops', () => {
        const storage = new MemoryStorage();
        seedMode(storage, 'transfem', {
            events: [event('tf-old')],
            'lab-results': [lab('tf-lab-old')],
            'dose-templates': [template('tf-tpl-old')],
        });
        seedMode(storage, 'transmasc', {
            events: [event('tm-old')],
            'lab-results': [lab('tm-lab-old')],
            'dose-templates': [template('tm-tpl-old')],
        });
        // A record the backup brings back must lose its old tombstone.
        seedTombstones(storage, 'transfem', {
            ...emptyTombstones(),
            events: { 'tf-revived': 123 },
        });

        const result = processImportedDataToStorage(
            {
                meta: { version: 2, exportedAt: '2030-01-01T00:00:00.000Z' },
                mode: 'transfem',
                weight: 500,
                modes: {
                    transfem: {
                        events: [event('tf-revived'), event('tf-new')],
                        // Present but empty: this payload says "no labs".
                        labResults: [],
                        // doseTemplates absent: this payload says nothing about templates.
                    },
                    transmasc: {
                        events: [event('tm-new')],
                        labResults: [lab('tm-lab-new')],
                        doseTemplates: [template('tm-tpl-new')],
                    },
                },
            },
            context(
                storage,
                'transfem',
                active({
                    events: [event('tf-old'), event('tf-revived')],
                    labResults: [lab('tf-lab-old')],
                    doseTemplates: [template('tf-tpl-old')],
                }),
            ),
            { now: NOW },
        );

        expect(ids(result.events!)).toEqual(['tf-revived', 'tf-new']);
        expect(result.labResults).toEqual([]);
        expect(result.doseTemplates).toBeUndefined();
        // Process import output is capped like the existing hook did.
        expect(result.weight).toBe(400);

        // Active-mode storage is written by the hook's state effect, not this
        // helper; tombstones are written here.
        const tfTombstones = readTombstonesFromStorage(storage, OWNER, 'transfem');
        expect(tfTombstones.events).toEqual({ 'tf-old': NOW });
        expect(tfTombstones.events['tf-revived']).toBeUndefined();
        expect(tfTombstones.labResults).toEqual({ 'tf-lab-old': NOW });
        expect(tfTombstones.doseTemplates).toEqual({});

        // The other mode is replaced in storage immediately.
        expect(ids(JSON.parse(storage.getItem(key('transmasc', 'events'))!))).toEqual(['tm-new']);
        expect(ids(JSON.parse(storage.getItem(key('transmasc', 'lab-results'))!))).toEqual(['tm-lab-new']);
        expect(ids(JSON.parse(storage.getItem(key('transmasc', 'dose-templates'))!))).toEqual(['tm-tpl-new']);
        const tmTombstones = readTombstonesFromStorage(storage, OWNER, 'transmasc');
        expect(tmTombstones.events).toEqual({ 'tm-old': NOW });
        expect(tmTombstones.labResults).toEqual({ 'tm-lab-old': NOW });
        expect(tmTombstones.doseTemplates).toEqual({ 'tm-tpl-old': NOW });
    });

    it('imports a v1 flat object: routes T records to transmasc and keeps E2 records active', () => {
        const storage = new MemoryStorage();
        seedMode(storage, 'transmasc', {
            events: [tEvent('tm-existing')],
            'lab-results': [],
        });
        // The incoming T ids are explicitly being restored, so their tombstones go.
        seedTombstones(storage, 'transmasc', {
            ...emptyTombstones(),
            events: { 't-new': 1 },
            labResults: { 't-lab': 1 },
        });

        const result = processImportedDataToStorage(
            {
                events: [event('e2-a'), tEvent('t-new'), tEvent('tm-existing')],
                labResults: [lab('e2-lab'), tLab('t-lab')],
                doseTemplates: [template('tf-tpl-new')],
                weight: 75,
            },
            context(
                storage,
                'transfem',
                active({
                    events: [event('tf-old')],
                    labResults: [lab('tf-lab-old')],
                    doseTemplates: [template('tf-tpl-old')],
                }),
            ),
            { now: NOW },
        );

        expect(ids(result.events!)).toEqual(['e2-a']);
        expect(ids(result.labResults!)).toEqual(['e2-lab']);
        expect(ids(result.doseTemplates!)).toEqual(['tf-tpl-new']);
        expect(result.weight).toBe(75);

        // Existing T id is not duplicated; new T id is appended.
        expect(ids(JSON.parse(storage.getItem(key('transmasc', 'events'))!))).toEqual(['tm-existing', 't-new']);
        expect(ids(JSON.parse(storage.getItem(key('transmasc', 'lab-results'))!))).toEqual(['t-lab']);
        const tmTombstones = readTombstonesFromStorage(storage, OWNER, 'transmasc');
        expect(tmTombstones.events['t-new']).toBeUndefined();
        expect(tmTombstones.labResults['t-lab']).toBeUndefined();

        const tfTombstones = readTombstonesFromStorage(storage, OWNER, 'transfem');
        expect(tfTombstones.events).toEqual({ 'tf-old': NOW });
        expect(tfTombstones.labResults).toEqual({ 'tf-lab-old': NOW });
        expect(tfTombstones.doseTemplates).toEqual({ 'tf-tpl-old': NOW });
    });

    it('imports a bare v1 event array', () => {
        const storage = new MemoryStorage();
        const result = processImportedDataToStorage([event('bare')], context(storage, 'transfem'), { now: NOW });
        expect(ids(result.events!)).toEqual(['bare']);
    });

    it('merges v2 by id, adds only new records, clears tombstones, and is idempotent', () => {
        const storage = new MemoryStorage();
        seedMode(storage, 'transmasc', {
            events: [tEvent('tm-old')],
            'lab-results': [tLab('tml-old')],
            'dose-templates': [template('tmt-old', { ester: Ester.TE })],
        });
        seedTombstones(storage, 'transmasc', {
            ...emptyTombstones(),
            events: { 'tm-old': 1, 'tm-new': 1 },
            labResults: { 'tml-old': 1, 'tml-new': 1 },
            doseTemplates: { 'tmt-old': 1, 'tmt-new': 1 },
        });

        const payload = {
            meta: { version: 2, exportedAt: '2030-01-01T00:00:00.000Z' },
            mode: 'transfem',
            weight: 80,
            modes: {
                transfem: {
                    events: [event('a'), event('b')],
                    labResults: [lab('l1'), lab('l2')],
                    doseTemplates: [template('t1'), template('t2')],
                },
                transmasc: {
                    events: [tEvent('tm-old'), tEvent('tm-new')],
                    labResults: [tLab('tml-old'), tLab('tml-new')],
                    doseTemplates: [template('tmt-old', { ester: Ester.TE }), template('tmt-new', { ester: Ester.TE })],
                },
            },
        };

        const firstActive = active({
            events: [event('a')],
            labResults: [lab('l1')],
            doseTemplates: [template('t1')],
            weight: 70,
        });
        const merged = mergeImportedDataToStorage(payload, context(storage, 'transfem', firstActive), { now: NOW });

        expect(ids(merged.events)).toEqual(['b']);
        expect(ids(merged.labResults)).toEqual(['l2']);
        expect(ids(merged.doseTemplates)).toEqual(['t2']);
        expect(merged.weight).toBe(80);
        // 1 other-mode event + 1 other-mode lab + 3 active records. The other
        // mode's template is restored but was historically not counted.
        expect(merged.mergedCount).toBe(5);

        expect(ids(JSON.parse(storage.getItem(key('transmasc', 'events'))!))).toEqual(['tm-old', 'tm-new']);
        expect(ids(JSON.parse(storage.getItem(key('transmasc', 'lab-results'))!))).toEqual(['tml-old', 'tml-new']);
        expect(ids(JSON.parse(storage.getItem(key('transmasc', 'dose-templates'))!))).toEqual(['tmt-old', 'tmt-new']);
        const tmTombstones = readTombstonesFromStorage(storage, OWNER, 'transmasc');
        expect(tmTombstones.events).toEqual({});
        expect(tmTombstones.labResults).toEqual({});
        expect(tmTombstones.doseTemplates).toEqual({});

        const afterFirst = storage.snapshot();
        const secondActive = active({
            events: [event('a'), event('b')],
            labResults: [lab('l1'), lab('l2')],
            doseTemplates: [template('t1'), template('t2')],
            weight: 80,
        });
        const mergedAgain = mergeImportedDataToStorage(payload, context(storage, 'transfem', secondActive), {
            now: NOW,
        });
        expect(mergedAgain.mergedCount).toBe(0);
        expect(mergedAgain.events).toEqual([]);
        expect(mergedAgain.labResults).toEqual([]);
        expect(mergedAgain.doseTemplates).toEqual([]);
        expect(mergedAgain.weight).toBeUndefined();
        expect(storage.snapshot()).toBe(afterFirst);
    });

    it('merges a v1 flat payload by id and routes cross-mode records', () => {
        const storage = new MemoryStorage();
        const firstActive = active({ events: [event('a')] });
        const merged = mergeImportedDataToStorage(
            {
                events: [event('a'), event('b'), tEvent('t-new')],
                labResults: [lab('e2-lab'), tLab('t-lab')],
                weight: 80,
            },
            context(storage, 'transfem', firstActive),
            { now: NOW },
        );

        expect(ids(merged.events)).toEqual(['b']);
        expect(ids(merged.labResults)).toEqual(['e2-lab']);
        expect(merged.mergedCount).toBe(4); // b + e2-lab + t-new + t-lab
        expect(ids(JSON.parse(storage.getItem(key('transmasc', 'events'))!))).toEqual(['t-new']);
        expect(ids(JSON.parse(storage.getItem(key('transmasc', 'lab-results'))!))).toEqual(['t-lab']);

        const afterFirst = storage.snapshot();
        const secondActive = active({ events: [event('a'), event('b')], labResults: [lab('e2-lab')], weight: 80 });
        const mergedAgain = mergeImportedDataToStorage(
            {
                events: [event('a'), event('b'), tEvent('t-new')],
                labResults: [lab('e2-lab'), tLab('t-lab')],
                weight: 80,
            },
            context(storage, 'transfem', secondActive),
            { now: NOW },
        );
        expect(mergedAgain.mergedCount).toBe(0);
        expect(storage.snapshot()).toBe(afterFirst);
    });

    it('does not deduplicate duplicate ids inside a payload (current behavior)', () => {
        // Characterization: current sanitizers and import paths preserve
        // duplicates. This is a known limitation, not a desired invariant.
        const storage = new MemoryStorage();
        const duplicated = event('dup');
        const result = processImportedDataToStorage(
            {
                modes: {
                    transfem: { events: [duplicated, duplicated] },
                },
            },
            context(storage, 'transfem'),
            { now: NOW },
        );
        expect(result.events).toHaveLength(2);
        expect(result.events!.map(record => record.id)).toEqual(['dup', 'dup']);

        const mergeStorage = new MemoryStorage();
        const merged = mergeImportedDataToStorage(
            { modes: { transfem: { events: [duplicated, duplicated] } } },
            context(mergeStorage, 'transfem'),
            { now: NOW },
        );
        expect(merged.events).toHaveLength(2);
        expect(merged.mergedCount).toBe(2);
    });

    it('rejects malformed and oversized input before any write; check mode never writes', () => {
        const storage = new MemoryStorage();
        seedMode(storage, 'transfem', { events: [event('old')] });
        seedTombstones(storage, 'transfem', { ...emptyTombstones(), events: { old: 1 } });
        const before = storage.snapshot();
        const ctx = context(storage, 'transfem', active({ events: [event('old')] }));

        expect(() => processImportedDataToStorage(null, ctx, { now: NOW })).toThrow('No valid entries');
        expect(storage.snapshot()).toBe(before);

        expect(() =>
            processImportedDataToStorage(
                { events: [{ id: 'bad', route: 'not-a-route', timeH: 1, doseMG: 1, ester: Ester.E2 }] },
                ctx,
                { now: NOW },
            ),
        ).toThrow('No valid entries');
        expect(storage.snapshot()).toBe(before);

        const oversized = {
            modes: {
                transfem: { events: [event('ok')] },
                transmasc: {
                    events: Array.from({ length: 20_001 }, (_, index) => event(`x-${index}`)),
                },
            },
        };
        expect(() => processImportedDataToStorage(oversized, ctx, { now: NOW })).toThrow('Too many entries');
        expect(storage.snapshot()).toBe(before);

        // The confirmation path may validate, but must not write.
        expect(() => processImportedDataToStorage(oversized, ctx, { check: true, now: NOW })).toThrow(
            'Too many entries',
        );
        expect(
            processImportedDataToStorage(
                {
                    modes: {
                        transfem: { events: [event('new')] },
                        transmasc: { events: [tEvent('tm-new')] },
                    },
                },
                ctx,
                { check: true, now: NOW },
            ),
        ).toEqual({});
        expect(storage.snapshot()).toBe(before);
    });

    it('ignores credential fields and leaves seeded credentials untouched', () => {
        const credentials = {
            auth_token: 'synthetic-token',
            auth_user: 'synthetic-user',
            weak_password: 'synthetic-password',
            login_device_passes: 'synthetic-passes',
            enc_key: 'synthetic-key',
        };
        const storage = new MemoryStorage();
        for (const [name, value] of Object.entries(credentials)) storage.setItem(name, value);

        const result = processImportedDataToStorage(
            {
                ...credentials,
                events: [{ ...event('e1'), auth_token: 'record-level-secret' }],
                labResults: [lab('l1')],
                doseTemplates: [template('t1')],
            },
            context(storage, 'transfem'),
            { now: NOW },
        );

        expect(result.events).toHaveLength(1);
        expect(result.events![0]).not.toHaveProperty('auth_token');
        expect(result.events![0].id).toBe('e1');
        for (const [name, value] of Object.entries(credentials)) {
            expect(storage.getItem(name)).toBe(value);
        }
        const keys = [...storage.map.keys()];
        expect(keys).toEqual(expect.arrayContaining(Object.keys(credentials)));
        expect(keys.sort()).toEqual(Object.keys(credentials).sort());
    });

    it('ignores unknown top-level and unknown record fields, and unknown modes', () => {
        const storage = new MemoryStorage();
        const result = processImportedDataToStorage(
            {
                meta: { version: 999, exportedAt: 'synthetic' },
                futureCriticalField: { anything: true },
                modes: {
                    transfem: { events: [{ ...event('known'), mystery: 'drop-me' }] },
                    other: { events: [event('not-a-mode')] },
                },
            },
            context(storage, 'transfem'),
            { now: NOW },
        );

        expect(ids(result.events!)).toEqual(['known']);
        expect(result.events![0]).not.toHaveProperty('mystery');
        expect(storage.getItem(key('transfem', 'events'))).toBeNull();
        expect(storage.getItem('hrt-usynthetic-user-other-events')).toBeNull();
    });

    it('treats empty and missing arrays differently on replace, and as no-ops on merge', () => {
        const storage = new MemoryStorage();
        seedMode(storage, 'transfem', {
            events: [event('old-event')],
            'lab-results': [lab('old-lab')],
        });

        const replaced = processImportedDataToStorage(
            {
                modes: {
                    transfem: {
                        // Present empty: clears events.
                        events: [],
                        // labResults absent: leaves labs alone.
                    },
                },
                weight: 80,
            },
            context(storage, 'transfem', active({ events: [event('old-event')], labResults: [lab('old-lab')] })),
            { now: NOW },
        );
        expect(replaced.events).toEqual([]);
        expect(replaced.labResults).toBeUndefined();
        expect(readTombstonesFromStorage(storage, OWNER, 'transfem').events).toEqual({ 'old-event': NOW });
        expect(readTombstonesFromStorage(storage, OWNER, 'transfem').labResults).toEqual({});

        const mergeStorage = new MemoryStorage();
        seedMode(mergeStorage, 'transfem', { events: [event('old-event')] });
        const merged = mergeImportedDataToStorage(
            { modes: { transfem: { events: [] } }, weight: 80 },
            context(mergeStorage, 'transfem', active({ events: [event('old-event')] })),
            { now: NOW },
        );
        expect(merged.events).toEqual([]);
        expect(merged.mergedCount).toBe(0);
        expect(merged.weight).toBe(80);
        expect(ids(JSON.parse(mergeStorage.getItem(key('transfem', 'events'))!))).toEqual(['old-event']);
        expect(readTombstonesFromStorage(mergeStorage, OWNER, 'transfem').events).toEqual({});
    });

    it('does not emit an out-of-range imported dose', () => {
        // Sanity check that the L2 harness is exercising the real sanitizer.
        const result = processImportedDataToStorage(
            [{ ...event('clamped'), doseMG: 999_999 }],
            context(new MemoryStorage(), 'transfem'),
        );
        expect(result.events![0].doseMG).toBe(DOSE_MG_MAX);
    });
});
