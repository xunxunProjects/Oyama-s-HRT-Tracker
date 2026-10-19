/**
 * Confirmation copy for complete-backup actions.
 *
 * The bundle deliberately carries no source-account identifier, and the
 * website never encrypts it. These helpers keep the account target and the
 * plaintext warning explicit and testable without adding fields to the format.
 *
 * Everything here is what a person reads, so it says in a few plain sentences
 * what will happen and leaves the detail (per-category counts, ids, validator
 * messages) out of the dialog.
 */
import type { Lang } from '../i18n/translations';
import { LOCALE_MAP } from './helpers';
import { REPLACE_PARTIAL_MESSAGE } from './replaceJournal';
import {
    COMPLETE_BACKUP_FORMAT_VERSION,
    PARTIAL_WRITE_MESSAGE,
    type CompleteBackupMergeResult,
    type CompleteBackupPreview,
} from './backupBundle';

export type Translate = (key: string) => string;

/** The subset of the signed-in user needed to name the import target. */
export interface BackupTargetUser {
    username?: string | null;
}

export type CompleteBackupTarget = { kind: 'account'; username: string } | { kind: 'local' };

/**
 * Resolve the account currently receiving the merge. A blank or missing
 * username is treated as the signed-out local store, never as an account match.
 */
export function resolveCompleteBackupTarget(user: BackupTargetUser | null | undefined): CompleteBackupTarget {
    const username = typeof user?.username === 'string' ? user.username.trim() : '';
    return username ? { kind: 'account', username } : { kind: 'local' };
}

export interface CompleteBackupAccountWarning {
    target: CompleteBackupTarget;
    lines: string[];
}

/**
 * Ask the reader to check the backup is theirs, naming the account it merges
 * into when they are signed in. There is no source-account field to compare,
 * so the copy promises no cross-account detection.
 */
export function describeCompleteBackupAccountWarning(
    user: BackupTargetUser | null | undefined,
    t: Translate,
): CompleteBackupAccountWarning {
    const target = resolveCompleteBackupTarget(user);
    const line =
        target.kind === 'account'
            ? t('import.bundle_yours_account').replace('{name}', target.username)
            : t('import.bundle_yours');
    return { target, lines: [line] };
}

export interface CompleteBackupExportWarning {
    title: string;
    message: string;
    confirmLabel: string;
}

/** Explicit plaintext-health-data confirmation before the bundle download. */
export function describeCompleteBackupExportWarning(t: Translate): CompleteBackupExportWarning {
    return {
        title: t('export.complete_confirm_title'),
        message: t('export.complete_confirm_message'),
        confirmLabel: t('export.complete_confirm_btn'),
    };
}

/**
 * What a person calls a preview path: `transfem.events`, `transmasc.deletions`,
 * `weight`. A path this build has no name for is shown as it is rather than as
 * a missing translation key.
 */
export function describeBundlePath(path: string, t: Translate): string {
    const [first, second] = path.split('.');
    const categoryKey = `import.bundle_cat_${second ?? first}`;
    const category = t(categoryKey);
    if (category === categoryKey) return path;
    if (second === undefined) return category;
    const modeKey = `mode.${first}`;
    const mode = t(modeKey);
    return mode === modeKey ? category : `${mode} ${category}`;
}

/** The parts that were not merged, named once each, joined the reader's way. */
export function describeBlockedParts(paths: string[], t: Translate): string {
    const names = [...new Set(paths.map(path => describeBundlePath(path, t)))];
    return t('import.bundle_skipped_parts').replace('{list}', names.join(t('import.bundle_sep')));
}

const formatBackupDate = (iso: string, lang: Lang): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(LOCALE_MAP[lang] || 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
};

/** `{n}` copy, with its `_one` form so English reads "1 record". */
const countText = (key: string, n: number, t: Translate): string =>
    t(n === 1 ? `${key}_one` : key).replace('{n}', String(n));

/** No space after a CJK full stop, which carries its own. */
const joinSentences = (sentences: string[]): string =>
    sentences.reduce((text, next) => (text ? `${text}${/[。！？]$/.test(text) ? '' : ' '}${next}` : next), '');

const describeRecordChanges = ({ added, updated }: CompleteBackupPreview['stats'], t: Translate): string => {
    if (added > 0 && updated > 0) {
        return t(added === 1 ? 'import.bundle_will_add_update_one' : 'import.bundle_will_add_update')
            .replace('{added}', String(added))
            .replace('{updated}', String(updated));
    }
    if (added > 0) return countText('import.bundle_will_add', added, t);
    if (updated > 0) return countText('import.bundle_will_update', updated, t);
    return t('import.bundle_nothing_new');
};

/**
 * The confirmation shown before a complete bundle is merged, in two or three
 * sentences: when it was made and how many records it brings, what it deletes
 * or cannot merge if anything, and a check that it is the reader's.
 */
export function describeCompleteBackupPreview(
    preview: CompleteBackupPreview,
    { t, lang, user }: { t: Translate; lang: Lang; user: BackupTargetUser | null | undefined },
): string {
    const sentences = [
        t('import.bundle_from')
            .replace('{date}', preview.createdAt ? formatBackupDate(preview.createdAt, lang) : '')
            .replace('{what}', describeRecordChanges(preview.stats, t)),
    ];
    if (preview.stats.removed > 0) sentences.push(countText('import.bundle_will_remove', preview.stats.removed, t));
    if (Object.keys(preview.preferences.values).length > 0) sentences.push(t('import.bundle_preferences'));
    if (preview.blocked.length) sentences.push(describeBlockedParts(preview.blocked, t));
    sentences.push(...describeCompleteBackupAccountWarning(user, t).lines);
    return joinSentences(sentences);
}

/**
 * The confirmation before a complete backup replaces the device, in three
 * sentences like the merge preview: when it was made and how many records it
 * holds, that everything here becomes what it holds, and a check that it is
 * the reader's, naming the account when they are signed in.
 */
export function describeCompleteBackupReplace(
    preview: CompleteBackupPreview,
    { t, lang, user }: { t: Translate; lang: Lang; user: BackupTargetUser | null | undefined },
): string {
    const records = Object.values(preview.counts).reduce(
        (sum, counts) =>
            sum +
            counts.events +
            counts.labResults +
            counts.doseTemplates +
            counts.quickDoses +
            counts.supplies +
            counts.plan,
        0,
    );
    const target = resolveCompleteBackupTarget(user);
    return joinSentences([
        countText('import.replace_complete_from', records, t).replace(
            '{date}',
            preview.createdAt ? formatBackupDate(preview.createdAt, lang) : '',
        ),
        t('import.replace_complete_message'),
        target.kind === 'account'
            ? t('import.replace_complete_yours_account').replace('{name}', target.username)
            : t('import.bundle_yours'),
    ]);
}

/**
 * A replace whose rollback failed too. Its journal is still in storage, and
 * the next start restores the device from it.
 */
export const isPartialReplaceFailure = (err: unknown): boolean =>
    err instanceof Error && (err.message === PARTIAL_WRITE_MESSAGE || err.message === REPLACE_PARTIAL_MESSAGE);

/** After a failed replace: distinguish a clean rollback from a partial write. */
export function describeCompleteBackupReplaceFailure(err: unknown, t: Translate): string {
    return t(isPartialReplaceFailure(err) ? 'import.replace_complete_partial' : 'import.replace_complete_failed');
}

/**
 * Why a file was not imported, in one line: made by a newer version of the app
 * (update first), or not a complete backup this app can read.
 */
export function describeUnreadableCompleteBackup(preview: CompleteBackupPreview, t: Translate): string {
    const newer = preview.formatVersion !== undefined && preview.formatVersion > COMPLETE_BACKUP_FORMAT_VERSION;
    return t(newer ? 'import.bundle_unknown_version' : 'import.bundle_invalid');
}

/**
 * What to tell the person after a merge, by what it actually did. The preview
 * already gave the numbers, so a merge that went through just says so.
 */
export function describeCompleteBackupResult(
    result: CompleteBackupMergeResult,
    outcome: 'applied' | 'settings-only' | 'nothing',
    t: Translate,
): string {
    const sentences = [
        t(
            outcome === 'applied'
                ? 'import.bundle_merged'
                : outcome === 'settings-only'
                  ? 'import.bundle_settings_only'
                  : 'import.bundle_nothing',
        ),
    ];
    if (result.blocked.length) sentences.push(describeBlockedParts(result.blocked, t));
    return joinSentences(sentences);
}

/**
 * After a merge threw. The writes are rolled back first, so the device is
 * unchanged unless that rollback failed too.
 */
export function describeCompleteBackupFailure(err: unknown, t: Translate): string {
    const partial = err instanceof Error && err.message === PARTIAL_WRITE_MESSAGE;
    return t(partial ? 'import.bundle_merge_partial' : 'import.bundle_merge_failed');
}
