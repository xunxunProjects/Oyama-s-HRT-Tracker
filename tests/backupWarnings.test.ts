import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../src/i18n/translations';
import {
    PARTIAL_WRITE_MESSAGE,
    type BundleCounts,
    type CompleteBackupMergeResult,
    type CompleteBackupPreview,
} from '../src/utils/backupBundle';
import { REPLACE_PARTIAL_MESSAGE } from '../src/utils/replaceJournal';
import {
    describeBundlePath,
    describeCompleteBackupAccountWarning,
    describeCompleteBackupExportWarning,
    describeCompleteBackupFailure,
    describeCompleteBackupPreview,
    describeCompleteBackupReplace,
    describeCompleteBackupReplaceFailure,
    describeCompleteBackupResult,
    describeUnreadableCompleteBackup,
    isPartialReplaceFailure,
    resolveCompleteBackupTarget,
} from '../src/utils/backupWarnings';

/** Read the shipped copy so the test checks real warning text, not a stub. */
const translate =
    (lang: 'en' | 'zh') =>
    (key: string): string =>
        (TRANSLATIONS[lang] as Record<string, string>)[key] ?? key;

const counts = (overrides: Partial<BundleCounts> = {}): BundleCounts => ({
    events: 0,
    labResults: 0,
    doseTemplates: 0,
    deletions: 0,
    quickDoses: 0,
    supplies: 0,
    plan: 0,
    ...overrides,
});

/** A synthetic preview with nothing in it; each test adds what it checks. */
const preview = (overrides: Partial<CompleteBackupPreview> = {}): CompleteBackupPreview => ({
    ok: true,
    errors: [],
    formatVersion: 1,
    createdAt: '2030-01-01T00:00:00.000Z',
    sourceMode: 'transfem',
    currentMode: 'transfem',
    targetOwner: 'local',
    counts: { transfem: counts(), transmasc: counts() },
    missing: [],
    blocked: [],
    issues: [],
    conflicts: [],
    stats: { added: 0, updated: 0, skipped: 0, removed: 0 },
    preferences: { values: {}, ignored: [], invalid: [] },
    deletionImpact: [],
    scalars: {},
    ...overrides,
});

const mergeResult = (overrides: Partial<CompleteBackupMergeResult> = {}): CompleteBackupMergeResult => ({
    applied: [],
    blocked: [],
    skipped: [],
    added: 0,
    updated: 0,
    removed: 0,
    modes: {},
    preferences: {},
    ...overrides,
});

describe('complete-backup confirmation copy', () => {
    it('names the signed-in target account and asks the reader to check the backup is theirs', () => {
        const warning = describeCompleteBackupAccountWarning({ username: '  synthetic-user  ' }, translate('en'));

        expect(warning.target).toEqual({ kind: 'account', username: 'synthetic-user' });
        expect(warning.lines).toEqual([
            'It merges into the account synthetic-user, so make sure this backup is yours.',
        ]);
    });

    it('only asks for the check when signed out or the username is blank', () => {
        for (const user of [null, undefined, {}, { username: '   ' }, { username: null }]) {
            expect(resolveCompleteBackupTarget(user)).toEqual({ kind: 'local' });
            const warning = describeCompleteBackupAccountWarning(user, translate('en'));
            expect(warning.lines).toEqual(['Make sure this backup is yours.']);
        }
    });

    it('says the same in Chinese without claiming the bundle carries a source account', () => {
        const warning = describeCompleteBackupAccountWarning({ username: '合成账户' }, translate('zh'));

        expect(warning.lines).toEqual(['它会合并到账户 合成账户，请确认这份备份是你的。']);
    });

    it('asks before downloading an unencrypted file and names no tool that is not shipped', () => {
        for (const lang of ['en', 'zh'] as const) {
            const warning = describeCompleteBackupExportWarning(translate(lang));
            expect(warning.message).not.toMatch(/hrt-cold|CLI|JSON/);
            expect(warning.title).not.toBe('export.complete_confirm_title');
        }
        const en = describeCompleteBackupExportWarning(translate('en'));
        expect(en.title).toBe('Download an unencrypted backup?');
        expect(en.confirmLabel).toBe('Download');
        expect(en.message).toContain('not encrypted');

        const zh = describeCompleteBackupExportWarning(translate('zh'));
        expect(zh.title).toBe('下载未加密的备份？');
        expect(zh.message).toContain('没有加密');
    });
});

describe('complete-backup preview copy', () => {
    it('says in a few sentences when the backup is from and what it adds', () => {
        const text = describeCompleteBackupPreview(
            preview({
                counts: {
                    transfem: counts({ events: 12, labResults: 3, deletions: 4 }),
                    transmasc: counts({ supplies: 1 }),
                },
                stats: { added: 15, updated: 0, skipped: 0, removed: 0 },
            }),
            { t: translate('en'), lang: 'en', user: null },
        );

        expect(text.startsWith('This backup is from ')).toBe(true);
        expect(text).toContain('2030');
        expect(text.endsWith(' and adds 15 records. Make sure this backup is yours.')).toBe(true);
        // Per-category counts stay out of the dialog.
        expect(text).not.toMatch(/lab results|supplies|Feminizing/);
        expect(text).not.toContain('\n');
    });

    it('reads as plain sentences: no mode keys, method ids, ISO dates or weights', () => {
        const text = describeCompleteBackupPreview(
            preview({
                counts: { transfem: counts({ events: 1 }), transmasc: counts() },
                stats: { added: 0, updated: 1, skipped: 0, removed: 2 },
                blocked: ['transmasc.events', 'transmasc.deletions', 'weight'],
                conflicts: ['weight has equal updatedAt but different content'],
                issues: ['transfem.events[3]: unknown route'],
                scalars: {
                    weight: { action: 'conflict', current: 70, incoming: 62 },
                    pkParams: { action: 'updated', current: null, incoming: null },
                    calibration: {
                        action: 'overwrite',
                        current: { method: 'mipd', historyMode: 'retrospective' },
                        incoming: { method: 'ekf', historyMode: 'forward' },
                    },
                },
            }),
            { t: translate('zh'), lang: 'zh', user: { username: 'synthetic-user' } },
        );

        expect(text).toContain('的备份，会更新 1 条记录。');
        expect(text).toContain('有 2 条记录在备份里已经删掉，这里也会删掉。');
        expect(text).toContain('这些合并不了，保持原样：男性化 HRT 用药记录、男性化 HRT 删掉的记录、体重。');
        expect(text.endsWith('它会合并到账户 synthetic-user，请确认这份备份是你的。')).toBe(true);
        // Chinese sentences run on without a space after the full stop.
        expect(text).not.toContain('。 ');
        for (const jargon of ['transfem', 'transmasc', 'mipd', 'ekf', 'updatedAt', 'unknown route', '2030-01-01T']) {
            expect(text).not.toContain(jargon);
        }
        expect(text).not.toMatch(/kg|校准/);
    });

    it('says when the merge will also apply display settings', () => {
        const withPreferences = describeCompleteBackupPreview(
            preview({ preferences: { values: { 'app-theme': 'dark' }, ignored: [], invalid: [] } }),
            { t: translate('en'), lang: 'en', user: null },
        );
        expect(withPreferences).toContain("It also applies the backup's display settings.");

        const without = describeCompleteBackupPreview(preview(), {
            t: translate('en'),
            lang: 'en',
            user: null,
        });
        expect(without).not.toContain('display settings');
    });

    it('reads right for one record and for nothing new', () => {
        const en = (stats: Partial<CompleteBackupPreview['stats']>) =>
            describeCompleteBackupPreview(
                preview({ stats: { added: 0, updated: 0, skipped: 0, removed: 0, ...stats } }),
                {
                    t: translate('en'),
                    lang: 'en',
                    user: null,
                },
            );

        expect(en({ added: 1 })).toContain(' and adds 1 record. ');
        expect(en({ updated: 1 })).toContain(' and updates 1 record. ');
        expect(en({ added: 3, updated: 2 })).toContain(' and adds 3 records and updates 2. ');
        expect(en({ added: 1, updated: 2 })).toContain(' and adds 1 record and updates 2. ');
        expect(en({ removed: 1 })).toContain(
            ' and has no new records. 1 record deleted in the backup will be deleted here too. ',
        );
    });

    it('names preview paths for people and keeps an unknown one as it is', () => {
        const t = translate('en');
        expect(describeBundlePath('transfem.labResults', t)).toBe('Feminizing HRT lab results');
        expect(describeBundlePath('pkParams', t)).toBe('drug parameters');
        expect(describeBundlePath('transfem.somethingNew', t)).toBe('transfem.somethingNew');
    });
});

describe('complete-backup outcome copy', () => {
    it('tells an unreadable file from one made by a newer version', () => {
        const t = translate('en');
        expect(describeUnreadableCompleteBackup(preview({ ok: false, formatVersion: 2 }), t)).toBe(
            'This complete backup comes from a newer version. Update the app first.',
        );
        for (const formatVersion of [undefined, 0, 1]) {
            expect(describeUnreadableCompleteBackup(preview({ ok: false, formatVersion }), t)).toBe(
                'This is not a complete backup file this app can read.',
            );
        }
    });

    it('says a merge went through, and names the parts it left alone', () => {
        const t = translate('zh');
        expect(describeCompleteBackupResult(mergeResult({ added: 3, updated: 1 }), 'applied', t)).toBe(
            '备份合并好了。',
        );
        expect(
            describeCompleteBackupResult(
                mergeResult({ added: 3, updated: 1, removed: 0, blocked: ['transfem.plan'] }),
                'applied',
                t,
            ),
        ).toBe('备份合并好了。这些合并不了，保持原样：女性化 HRT 用药方案。');
        expect(describeCompleteBackupResult(mergeResult(), 'settings-only', t)).toBe(
            '只导入了设置，备份里没有能合并的记录。',
        );
        expect(describeCompleteBackupResult(mergeResult({ blocked: ['weight'] }), 'nothing', t)).toBe(
            '备份里没有能合并的内容。这些合并不了，保持原样：体重。',
        );
        expect(describeCompleteBackupResult(mergeResult({ blocked: ['weight'] }), 'applied', translate('en'))).toBe(
            "Backup merged. These can't be merged and stay as they are: weight.",
        );
    });

    it('says the device is unchanged unless the rollback failed too', () => {
        const t = translate('en');
        expect(describeCompleteBackupFailure(new Error('synthetic storage write failure'), t)).toBe(
            'The import failed. Nothing on this device was changed.',
        );
        expect(describeCompleteBackupFailure(new Error(PARTIAL_WRITE_MESSAGE), t)).toBe(
            'The import did not finish, and part of it may already have been written.',
        );
    });

    it('warns before replacing in three sentences, counting records and not deletions', () => {
        const t = translate('en');
        const text = describeCompleteBackupReplace(
            preview({
                counts: {
                    transfem: counts({ events: 2, deletions: 9 }),
                    transmasc: counts({ labResults: 1, plan: 1 }),
                },
                preferences: { values: { 'app-theme': 'dark' }, ignored: [], invalid: [] },
            }),
            { t, lang: 'en', user: { username: 'synthetic-user' } },
        );
        expect(text.startsWith('This backup is from ')).toBe(true);
        expect(text).toContain('2030');
        expect(
            text.endsWith(
                ' and holds 4 records. The records and settings on this device will be replaced by the ones in it, and with cloud sync on, your other devices change too. ' +
                    "You're signed in as synthetic-user, so make sure this backup is yours.",
            ),
        ).toBe(true);
        // No merge wording in a replace, and no machinery.
        expect(text).not.toMatch(/merge|journal|deletion|\n/i);

        const one = describeCompleteBackupReplace(
            preview({ counts: { transfem: counts({ events: 1 }), transmasc: counts() } }),
            { t, lang: 'en', user: null },
        );
        expect(one).toContain(' and holds 1 record. ');
        expect(one.endsWith(' Make sure this backup is yours.')).toBe(true);
    });

    it('says the same in Chinese, run on without spaces', () => {
        const text = describeCompleteBackupReplace(
            preview({ counts: { transfem: counts({ events: 3 }), transmasc: counts() } }),
            { t: translate('zh'), lang: 'zh', user: { username: '合成账户' } },
        );
        expect(text).toContain('的备份，有 3 条记录。这台设备上的记录和设置会换成它的内容，');
        expect(text.endsWith('你登录的是 合成账户，请确认这份备份是你的。')).toBe(true);
        expect(text).not.toContain('。 ');
        expect(text).not.toMatch(/合并|日志/);
    });

    it('says a failed replace changed nothing, unless the rollback failed too', () => {
        const t = translate('en');
        expect(describeCompleteBackupReplaceFailure(new Error('synthetic write failure'), t)).toBe(
            'Restore failed. Nothing on this device was changed.',
        );
        expect(describeCompleteBackupReplaceFailure(new Error(REPLACE_PARTIAL_MESSAGE), t)).toBe(
            'The restore did not finish. The app will reload and put this device back the way it was.',
        );
        expect(isPartialReplaceFailure(new Error(REPLACE_PARTIAL_MESSAGE))).toBe(true);
        expect(isPartialReplaceFailure(new Error('synthetic write failure'))).toBe(false);
        expect(isPartialReplaceFailure('not an error')).toBe(false);
    });
});
