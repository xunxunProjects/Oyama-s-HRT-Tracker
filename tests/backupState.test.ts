import { describe, expect, it } from 'vitest';
import {
    applySyncedStateToStorage,
    buildExportPayloadFromStorage,
    sanitizeImportedEvents,
    sanitizeImportedLabResults,
    sanitizeImportedTemplates,
    type StorageLike,
} from '../src/utils/backupState';
import { defaultPack, normalizeSupply, packKindsFor, packUnitMG } from '../src/utils/regimen';
import { normalizePlanItem } from '../src/utils/plan';
import { DOSE_MG_MAX, Route, Ester } from '../logic';
import { emptyTombstones, type SyncState } from '../src/utils/syncMerge';

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
}

class FailingStorage extends MemoryStorage {
    constructor(private readonly failKey: string) {
        super();
    }
    setItem(key: string, value: string): void {
        if (key === this.failKey) throw new Error(`simulated write failure: ${key}`);
        super.setItem(key, value);
    }
}

const event = (id: string) => ({
    id,
    route: Route.sublingual,
    timeH: 500000,
    doseMG: 2,
    ester: Ester.E2,
    extras: {},
});

const modeBlock = (id: string) => ({
    events: [event(id)],
    labResults: [],
    doseTemplates: [],
    deletions: emptyTombstones(),
});

const syncState = (): SyncState => ({
    modes: {
        transfem: modeBlock('tf'),
        transmasc: modeBlock('tm'),
    },
    weight: 70,
    weightUpdatedAt: 123,
    pkParams: undefined,
    pkParamsUpdatedAt: 0,
});

describe('production backup seams', () => {
    it('covers every Supply pack branch and pack helpers', () => {
        const packs = [
            { kind: 'vial' as const, ml: 5, mgPerMl: 40 },
            { kind: 'pill' as const, mg: 2 },
            { kind: 'pump' as const, mg: 1.25 },
            { kind: 'sachet' as const, mg: 1.5 },
            { kind: 'patch' as const },
            { kind: 'bulk' as const },
        ];
        for (const pack of packs) {
            expect(defaultPack(pack.kind)).toBeDefined();
            expect(packUnitMG(pack)).toBeGreaterThan(0);
            const supply = {
                id: `s-${pack.kind}`,
                route: pack.kind === 'patch' ? Route.patchApply : Route.injection,
                ester: Ester.E2,
                pack,
                count: 2,
                startedAt: 1,
            };
            expect(normalizeSupply(supply)?.pack).toEqual(pack);
        }
        expect(packUnitMG({ kind: 'vial', ml: 5, mgPerMl: 40 })).toBe(200);
        expect(packUnitMG({ kind: 'pill', mg: 2 })).toBe(2);
        expect(packKindsFor(Route.injection)).toEqual(['vial', 'bulk']);
        expect(packKindsFor(Route.patchApply)).toEqual(['patch']);
    });

    it('rejects a bare string Supply.pack with no legacy amount', () => {
        expect(
            normalizeSupply({
                id: 's-bad',
                route: Route.injection,
                ester: Ester.E2,
                pack: 'vial',
                count: 2,
                startedAt: 1,
            }),
        ).toBeNull();
    });

    it('documents that normalizeSupply currently accepts an unknown pack kind', () => {
        // Characterization test for the current permissive production function.
        // L2_REVIEW_REQUIRED: this should become a rejection in a later change.
        const result = normalizeSupply({
            id: 's-unknown',
            route: Route.injection,
            ester: Ester.E2,
            pack: { kind: 'unknown' },
            count: 2,
            startedAt: 1,
        });
        expect(result).not.toBeNull();
    });

    it('validates plan bounds and normalizes non-daily timesPerDay', () => {
        const base = {
            id: 'p1',
            route: Route.sublingual,
            ester: Ester.E2,
            doseMG: 2,
            extras: {},
        };
        expect(normalizePlanItem({ ...base, everyDays: 1, timesPerDay: 2 })).toMatchObject({
            everyDays: 1,
            timesPerDay: 2,
        });
        expect(normalizePlanItem({ ...base, everyDays: 3.5, timesPerDay: 2 })).toMatchObject({
            everyDays: 3.5,
            timesPerDay: 1,
        });
        expect(normalizePlanItem({ ...base, everyDays: 0, timesPerDay: 1 })).toBeNull();
        expect(normalizePlanItem({ ...base, everyDays: 1, timesPerDay: 0 })).toBeNull();
        expect(normalizePlanItem({ ...base, doseMG: -1, everyDays: 1, timesPerDay: 1 })).toBeNull();
        // A newer version's drug code survives the loader; it is not rejected
        // and not rewritten to a known ester.
        expect(normalizePlanItem({ ...base, ester: 'FUTURE1', everyDays: 1, timesPerDay: 1 })).toMatchObject({
            ester: 'FUTURE1',
        });
        expect(normalizePlanItem({ ...base, ester: 'not a drug code', everyDays: 1, timesPerDay: 1 })).toBeNull();
    });

    it('sanitizes import records with bounded fields', () => {
        const events = sanitizeImportedEvents([
            event('e1'),
            { ...event('e2'), doseMG: 999999, ester: 'NEW_DRUG' },
            { ...event('bad'), timeH: Number.NaN },
        ]);
        expect(events).toHaveLength(2);
        expect(events[1].ester).toBe('NEW_DRUG');
        expect(events[1].doseMG).toBe(DOSE_MG_MAX);
        expect(sanitizeImportedLabResults([{ id: 'l', timeH: 1, concValue: 2 }])[0].unit).toBe('pmol/l');
        expect(
            sanitizeImportedTemplates([
                { id: 't', name: 'T', route: Route.oral, ester: Ester.E2, doseMG: 2, createdAt: 1 },
            ]),
        ).toHaveLength(1);
    });

    it('builds the production export shape without local-only data or credentials', () => {
        const storage = new MemoryStorage();
        storage.setItem('auth_token', 'secret');
        storage.setItem('enc_key', 'secret');
        storage.setItem('hrt-u42-quick-doses', JSON.stringify([{ id: 'q' }]));
        storage.setItem('hrt-u42-supplies', JSON.stringify([{ id: 's' }]));
        storage.setItem('hrt-u42-plan', JSON.stringify([{ id: 'p' }]));
        storage.setItem('hrt-u42-cal-method', 'ekf');
        storage.setItem('hrt-u42-weight-at', '111');
        storage.setItem('hrt-u42-pk-params-at', '222');
        const payload = buildExportPayloadFromStorage(
            storage,
            '42',
            'transfem',
            {
                events: [event('active')],
                labResults: [],
                doseTemplates: [],
                weight: 70,
                pkParams: null,
            },
            '2026-01-01T00:00:00.000Z',
        );
        const serialized = JSON.stringify(payload);
        expect(payload.meta).toEqual({ version: 2, exportedAt: '2026-01-01T00:00:00.000Z' });
        expect(payload.mode).toBe('transfem');
        expect(payload.events).toHaveLength(1);
        expect(payload.weightUpdatedAt).toBe(111);
        expect(payload.pkParamsUpdatedAt).toBe(222);
        expect(payload.pkParams).toBeNull();
        expect(serialized).not.toContain('auth_token');
        expect(serialized).not.toContain('enc_key');
        expect(serialized).not.toContain('quick-doses');
        expect(serialized).not.toContain('supplies');
        expect(serialized).not.toContain('cal-method');
    });

    it('applies sync state through storage and leaves local-only keys untouched', () => {
        const storage = new MemoryStorage();
        storage.setItem('hrt-u42-quick-doses', '[{"id":"q"}]');
        storage.setItem('hrt-u42-supplies', '[{"id":"s"}]');
        storage.setItem('hrt-u42-plan', '[{"id":"p"}]');
        const applied = applySyncedStateToStorage(storage, '42', 'transfem', syncState(), 999);
        expect(applied.active.events[0].id).toBe('tf');
        expect(JSON.parse(storage.getItem('hrt-u42-events')!)[0].id).toBe('tf');
        expect(JSON.parse(storage.getItem('hrt-u42-masc-events')!)[0].id).toBe('tm');
        expect(storage.getItem('hrt-u42-quick-doses')).toBe('[{"id":"q"}]');
        expect(storage.getItem('hrt-u42-supplies')).toBe('[{"id":"s"}]');
        expect(storage.getItem('hrt-u42-plan')).toBe('[{"id":"p"}]');
        expect(storage.getItem('hrt-u42-weight')).toBe('70');
        expect(storage.getItem('hrt-u42-weight-at')).toBe('123');
    });

    it('documents partial writes when a later localStorage write fails', () => {
        const storage = new FailingStorage('hrt-u42-masc-events');
        expect(() => applySyncedStateToStorage(storage, '42', 'transfem', syncState(), 999)).toThrow(
            /simulated write failure/,
        );
        // This is the current limitation: earlier keys are already written.
        expect(storage.getItem('hrt-u42-events')).not.toBeNull();
        expect(storage.getItem('hrt-u42-masc-events')).toBeNull();
    });
});
