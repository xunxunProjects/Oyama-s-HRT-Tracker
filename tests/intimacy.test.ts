import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applySyncedStateToStorage, buildExportPayloadFromStorage, modeKeyFor } from '../src/utils/backupState';
import { mergeSyncStates, normalizeSyncState } from '../src/utils/syncMerge';
import { mergeImportedDataToStorage, processImportedDataToStorage } from '../src/utils/backupImport';
import { normalizeIntimacyRecord, sanitizeImportedIntimacy } from '../src/utils/intimacy';
import { TRANSLATIONS } from '../src/i18n/translations';
import { MemoryStorage } from './memoryStorage';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = 1_800_000_000_000;
const rec = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    timeH: 480_000,
    kind: 'solo',
    ...extra,
});
const active = { events: [], labResults: [], doseTemplates: [], weight: 70, birthYear: null, pkParams: null };

describe('sexual activity records', () => {
    it('keep only the neutral fields and drop anything unreadable', () => {
        expect(
            normalizeIntimacyRecord(
                rec('a', { orgasm: true, durationMin: 12.4, satisfaction: 4, note: 'ok', anatomy: 'x' }),
            ),
        ).toEqual({
            id: 'a',
            timeH: 480_000,
            kind: 'solo',
            orgasm: true,
            durationMin: 12,
            satisfaction: 4,
            note: 'ok',
        });
        expect(normalizeIntimacyRecord(rec('b', { kind: 'unknown' }))).toBeNull();
        expect(normalizeIntimacyRecord(rec('c', { satisfaction: 9 }))).toEqual(rec('c'));
        expect(sanitizeImportedIntimacy([rec('d'), null, { id: 'e' }])).toHaveLength(1);
    });

    it('travel in the sync payload and merge with deletions like other records', () => {
        const a = new MemoryStorage();
        a.setItem(modeKeyFor('u1', 'transfem', 'intimacy'), JSON.stringify([rec('kept'), rec('gone')]));
        const b = new MemoryStorage();
        b.setItem(
            modeKeyFor('u1', 'transfem', 'deletions'),
            JSON.stringify({ events: {}, labResults: {}, doseTemplates: {}, intimacy: { gone: NOW - 1000 } }),
        );
        b.setItem(modeKeyFor('u1', 'transfem', 'intimacy'), JSON.stringify([rec('new', { kind: 'partnered' })]));

        const payloadA = buildExportPayloadFromStorage(a, 'u1', 'transfem', active);
        expect(payloadA.modes.transfem.intimacy.map(r => r.id)).toEqual(['kept', 'gone']);
        const payloadB = buildExportPayloadFromStorage(b, 'u1', 'transfem', active);

        const { merged } = mergeSyncStates(normalizeSyncState(payloadA), normalizeSyncState(payloadB));
        expect(merged.modes.transfem.intimacy.map((r: { id: string }) => r.id).sort()).toEqual(['kept', 'new']);

        const applied = applySyncedStateToStorage(a, 'u1', 'transfem', merged, NOW);
        expect(applied.active.intimacy.map(r => r.id).sort()).toEqual(['kept', 'new']);
        expect(JSON.parse(a.getItem(modeKeyFor('u1', 'transfem', 'intimacy'))!)).toHaveLength(2);
    });

    it('come back from a restored backup, replace or merge', () => {
        const backup = { modes: { transfem: { events: [], intimacy: [rec('x')] } } };
        const replace = processImportedDataToStorage(backup, {
            storage: new MemoryStorage(),
            owner: 'u1',
            mode: 'transfem',
            active,
        });
        expect(replace.intimacy?.map(r => r.id)).toEqual(['x']);
        const merge = mergeImportedDataToStorage(backup, {
            storage: new MemoryStorage(),
            owner: 'u1',
            mode: 'transfem',
            active: { ...active, intimacy: [] },
        });
        expect(merge.intimacy.map(r => r.id)).toEqual(['x']);
    });

    it('never reach a share link', () => {
        for (const file of ['src/services/shareSnapshot.ts', 'src/services/sharing.ts', 'shareSnapshotSchema.ts']) {
            expect(readFileSync(resolve(root, file), 'utf8')).not.toMatch(/intimacy/i);
        }
    });

    it('are worded without gendered terms in every language', () => {
        const gendered =
            /\b(boyfriend|girlfriend|husband|wife|man|woman|men|women|penis|vagina|erection|ejaculat\w*)\b|男友|女友|老公|老婆|丈夫|妻子|射精|勃起/i;
        for (const [lang, pack] of Object.entries(TRANSLATIONS)) {
            const strings = Object.entries(pack as Record<string, string>).filter(([k]) => k.startsWith('intimacy.'));
            for (const [key, value] of strings) expect(`${lang} ${key} ${value}`).not.toMatch(gendered);
        }
    });
});
