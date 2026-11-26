import { useEffect, useRef, useState } from 'react';
import { decompressData, decryptData, encryptData } from '../../logic';
import type { ShowDialog } from '../contexts/DialogContext';
import type { useAppData } from '../hooks/useAppData';
import { describeSyncError, type CloudSyncState } from '../hooks/useCloudSync';
import type { Lang } from '../i18n/translations';
import type { User } from '../services/auth';
import { cloudService } from '../services/cloud';
import {
    COMPLETE_BACKUP_FORMAT,
    classifyCompleteBackupOutcome,
    completeBackupPreviewFingerprint,
    type CompleteBackupMergeResult,
    type CompleteBackupPreview,
    type PortablePreferences,
} from '../utils/backupBundle';
import {
    describeCompleteBackupExportWarning,
    describeCompleteBackupFailure,
    describeCompleteBackupPreview,
    describeCompleteBackupReplace,
    describeCompleteBackupReplaceFailure,
    describeCompleteBackupResult,
    describeUnreadableCompleteBackup,
    isPartialReplaceFailure,
} from '../utils/backupWarnings';
import { copyText } from '../utils/clipboard';
import { parseCloudBackup } from '../utils/cloudBackup';

type AppData = ReturnType<typeof useAppData>;
type BackupData = Pick<
    AppData,
    | 'events'
    | 'labResults'
    | 'processImportedData'
    | 'mergeImportedData'
    | 'buildExportPayload'
    | 'buildCompleteBackupBundle'
    | 'previewCompleteBackupBundle'
    | 'applyCompleteBackupBundle'
    | 'replaceCompleteBackupBundle'
>;

interface BackupActionOptions {
    t: (key: string) => string;
    lang: Lang;
    user: User | null;
    token: string | null;
    showDialog: ShowDialog;
    data: BackupData;
    applyPortablePreferences: (prefs: PortablePreferences) => void;
    requireSignIn: () => void;
    sync: Pick<CloudSyncState, 'syncNow'>;
}

/**
 * Import, export, complete-backup and cloud actions. Dialogs stay open across
 * renders, so every confirm path re-previews and applies through the latest
 * snapshot instead of the arrays captured when the dialog opened.
 */
export const useBackupActions = ({
    t,
    lang,
    user,
    token,
    showDialog,
    data,
    applyPortablePreferences,
    requireSignIn,
    sync,
}: BackupActionOptions) => {
    const [pendingImportText, setPendingImportText] = useState<string | null>(null);
    const [isPasswordInputOpen, setIsPasswordInputOpen] = useState(false);

    // Dialogs stay open across renders, so their callbacks must not keep the
    // arrays/functions captured when the dialog opened. Every confirm path
    // re-previews and applies through this latest snapshot instead.
    const completeBackupRef = useRef({
        preview: data.previewCompleteBackupBundle,
        apply: data.applyCompleteBackupBundle,
        replace: data.replaceCompleteBackupBundle,
        build: data.buildCompleteBackupBundle,
    });
    useEffect(() => {
        completeBackupRef.current = {
            preview: data.previewCompleteBackupBundle,
            apply: data.applyCompleteBackupBundle,
            replace: data.replaceCompleteBackupBundle,
            build: data.buildCompleteBackupBundle,
        };
    });

    // An import replaces the records on this device (and, with sync on, on
    // every device), so it asks first whenever there is something to lose, in
    // either HRT mode: a backup carries both. Restoring a backup onto an empty
    // device stays a single step, and a file with nothing usable in it is
    // reported as such before anything is asked. Resolves to whether the
    // import went through, so the paste box keeps its text after a Cancel.
    const confirmImport = (parsed: unknown): Promise<boolean> =>
        new Promise(resolve => {
            if (!data.processImportedData(parsed, { check: true })) {
                showDialog('alert', t('drawer.import_error'));
                resolve(false);
                return;
            }
            const run = () => resolve(data.processImportedData(parsed));
            const { modes } = data.buildExportPayload();
            if (Object.values(modes).every(m => !m.events.length && !m.labResults.length && !m.doseTemplates.length)) {
                run();
                return;
            }
            showDialog('confirm', t('import.replace_confirm'), run, {
                danger: true,
                title: t('import.replace_title'),
                confirmLabel: t('import.replace_btn'),
                onCancel: () => resolve(false),
            });
        });

    /**
     * Complete bundles are unencrypted JSON and merge only. Replace-all remains
     * BLOCKED: there is no proven multi-key transaction, so this path never
     * clears local categories.
     */
    const confirmCompleteBackupImport = (parsed: unknown): Promise<boolean> =>
        new Promise(resolve => {
            // The validator's messages name fields and record ids. They are for
            // whoever looks into the file, so they go to the console and the
            // person is told only that the file can't be read, or is too new.
            const rejectUnreadable = (unreadable: CompleteBackupPreview) => {
                console.warn('Complete backup not imported:', unreadable.errors);
                showDialog('alert', describeUnreadableCompleteBackup(unreadable, t));
                resolve(false);
            };

            const preview = completeBackupRef.current.preview(parsed);
            if (!preview.ok) {
                rejectUnreadable(preview);
                return;
            }
            if (preview.issues.length || preview.conflicts.length) {
                console.warn('Complete backup preview:', { issues: preview.issues, conflicts: preview.conflicts });
            }

            const run = () => {
                let result: CompleteBackupMergeResult;
                try {
                    result = completeBackupRef.current.apply(parsed);
                } catch (err) {
                    console.error(err);
                    showDialog('alert', describeCompleteBackupFailure(err, t));
                    resolve(false);
                    return;
                }
                const outcome = classifyCompleteBackupOutcome(result);
                applyPortablePreferences(result.preferences);
                showDialog('alert', describeCompleteBackupResult(result, outcome, t));
                resolve(outcome !== 'nothing');
            };

            const openPreview = (current: CompleteBackupPreview) => {
                showDialog(
                    'confirm',
                    describeCompleteBackupPreview(current, { t, lang, user }),
                    () => {
                        // The active arrays can change while a dialog is open.
                        // Recompute at confirm time; if the visible outcome
                        // changed, show it again instead of applying stale consent.
                        const latest = completeBackupRef.current.preview(parsed);
                        if (!latest.ok) {
                            rejectUnreadable(latest);
                            return;
                        }
                        if (completeBackupPreviewFingerprint(latest) !== completeBackupPreviewFingerprint(current)) {
                            openPreview(latest);
                            return;
                        }
                        if (latest.scalars.calibration?.action !== 'overwrite') {
                            run();
                            return;
                        }
                        // Calibration changes how PK estimates are interpreted.
                        // It gets its own explicit confirmation instead of
                        // riding on the merge. Apply re-previews again, so a
                        // change during this dialog cannot bypass the latest
                        // conflict/block decisions.
                        showDialog(
                            'confirm',
                            t('import.bundle_calibration_confirm'),
                            () => {
                                const finalPreview = completeBackupRef.current.preview(parsed);
                                if (!finalPreview.ok) {
                                    rejectUnreadable(finalPreview);
                                    return;
                                }
                                run();
                            },
                            {
                                danger: true,
                                title: t('import.bundle_calibration_confirm_title'),
                                confirmLabel: t('import.bundle_calibration_confirm_btn'),
                                onCancel: () => resolve(false),
                            },
                        );
                    },
                    {
                        // A merge that only adds records is not a red-button
                        // action; one that deletes local records is.
                        danger: current.stats.removed > 0,
                        title: t('import.bundle_preview_title'),
                        confirmLabel: t('import.bundle_merge_btn'),
                        onCancel: () => resolve(false),
                    },
                );
            };

            openPreview(preview);
        });

    /**
     * Replace, unlike merge, may not silently drop or block a category: the
     * file has to describe the whole store. Scalars the format may omit
     * (weight, PK parameters) and preferences are optional.
     */
    const confirmCompleteBackupReplace = (parsed: unknown): Promise<boolean> =>
        new Promise(resolve => {
            const optionalMissing = new Set(['weight', 'pkParams', 'preferences']);
            const requiredMissing = (preview: CompleteBackupPreview) =>
                preview.missing.filter(path => !optionalMissing.has(path));
            const reject = (preview: CompleteBackupPreview) => {
                console.warn('Complete backup cannot replace this device:', {
                    errors: preview.errors,
                    issues: preview.issues,
                    missing: requiredMissing(preview),
                });
                showDialog('alert', t('import.bundle_invalid'));
                resolve(false);
            };

            const preview = completeBackupRef.current.preview(parsed);
            if (!preview.ok || preview.issues.length > 0 || requiredMissing(preview).length > 0) {
                reject(preview);
                return;
            }

            const run = () => {
                try {
                    const result = completeBackupRef.current.replace(parsed);
                    applyPortablePreferences(result.preferences);
                    showDialog('alert', t('import.replace_complete_success'));
                    resolve(true);
                } catch (err) {
                    console.error(err);
                    // A partial write leaves its journal behind, and the store
                    // half replaced. Reloading runs the recovery before
                    // anything reads or syncs it, instead of asking the person
                    // to know to reload.
                    showDialog(
                        'alert',
                        describeCompleteBackupReplaceFailure(err, t),
                        isPartialReplaceFailure(err) ? () => window.location.reload() : undefined,
                    );
                    resolve(false);
                }
            };

            const open = (current: CompleteBackupPreview, fingerprint: string) => {
                showDialog(
                    'confirm',
                    describeCompleteBackupReplace(current, { t, lang, user }),
                    () => {
                        // The active arrays can change while the dialog is open.
                        // Replacing them without showing the new contents would
                        // be consent to a different operation.
                        const latest = completeBackupRef.current.preview(parsed);
                        if (!latest.ok || latest.issues.length > 0 || requiredMissing(latest).length > 0) {
                            reject(latest);
                            return;
                        }
                        const latestFingerprint = completeBackupPreviewFingerprint(latest);
                        if (latestFingerprint !== fingerprint) {
                            open(latest, latestFingerprint);
                            return;
                        }
                        run();
                    },
                    {
                        danger: true,
                        title: t('import.replace_complete_title'),
                        confirmLabel: t('import.replace_complete_btn'),
                        onCancel: () => resolve(false),
                    },
                );
            };

            open(preview, completeBackupPreviewFingerprint(preview));
        });

    const replaceCompleteBackupFromJson = async (text: string): Promise<boolean> => {
        try {
            let parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && parsed.c && typeof parsed.c === 'string') {
                parsed = JSON.parse(await decompressData(parsed.c));
            }
            if (!parsed || typeof parsed !== 'object' || parsed.format !== COMPLETE_BACKUP_FORMAT) {
                showDialog('alert', t('import.bundle_invalid'));
                return false;
            }
            return await confirmCompleteBackupReplace(parsed);
        } catch (err) {
            console.error(err);
            showDialog('alert', t('drawer.import_error'));
            return false;
        }
    };

    const importEventsFromJson = async (text: string): Promise<boolean> => {
        try {
            let parsed = JSON.parse(text);

            // Handle Encryption
            if (parsed.encrypted && parsed.iv && parsed.salt && parsed.data) {
                setPendingImportText(text);
                setIsPasswordInputOpen(true);
                return true;
            }

            // Handle Compression
            if (parsed.c && typeof parsed.c === 'string') {
                const decompressed = await decompressData(parsed.c);
                parsed = JSON.parse(decompressed);
            }

            if (parsed && typeof parsed === 'object' && parsed.format === COMPLETE_BACKUP_FORMAT) {
                return await confirmCompleteBackupImport(parsed);
            }

            return await confirmImport(parsed);
        } catch (err) {
            // The alert is the user-facing report. Keep the log to the reason,
            // not a JSON.parse stack for an input the reader can see is wrong.
            console.warn('Import failed:', err instanceof Error ? err.message : String(err));
            showDialog('alert', t('drawer.import_error'));
            return false;
        }
    };

    const closePasswordPrompt = () => {
        setIsPasswordInputOpen(false);
        setPendingImportText(null);
    };

    const handlePasswordSubmit = async (password: string) => {
        if (!pendingImportText) return;
        const decrypted = await decryptData(pendingImportText, password);
        if (decrypted) {
            try {
                let parsed = JSON.parse(decrypted);
                // Handle Compression after decryption
                if (parsed.c && typeof parsed.c === 'string') {
                    const decompressed = await decompressData(parsed.c);
                    parsed = JSON.parse(decompressed);
                }
                setIsPasswordInputOpen(false);
                setPendingImportText(null);
                if (parsed && typeof parsed === 'object' && parsed.format === COMPLETE_BACKUP_FORMAT) {
                    await confirmCompleteBackupImport(parsed);
                    return;
                }
                confirmImport(parsed);
            } catch (e) {
                console.error(e);
                showDialog('alert', t('import.decrypt_error'));
            }
        } else {
            showDialog('alert', t('import.decrypt_error'));
        }
    };

    // Says whether the copy landed, and nothing more: Export shows the result
    // in place on its Copy row, so a success alert on top only cost a tap,
    // and a failed write used to be swallowed while the row still said "copied".
    const handleQuickExport = async (): Promise<boolean> => {
        if (data.events.length === 0 && data.labResults.length === 0) {
            showDialog('alert', t('drawer.empty_export'));
            return false;
        }
        const exportData = data.buildExportPayload();
        const json = JSON.stringify(exportData, null, 2);
        try {
            await copyText(json);
            return true;
        } catch (err) {
            console.error('Failed to copy: ', err);
            return false;
        }
    };

    const downloadFile = (contents: string, filename: string) => {
        const blob = new Blob([contents], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportConfirm = async (encrypt: boolean, customPassword?: string): Promise<string | null> => {
        const exportData = data.buildExportPayload();
        const json = JSON.stringify(exportData, null, 2);

        if (encrypt) {
            const { data: encrypted, password } = await encryptData(json, customPassword);
            downloadFile(encrypted, `hrt-dosages-encrypted-${new Date().toISOString().split('T')[0]}.json`);
            if (!customPassword) {
                return password;
            }
        } else {
            downloadFile(json, `hrt-dosages-${new Date().toISOString().split('T')[0]}.json`);
        }
        return null;
    };

    /**
     * The complete bundle is deliberately plaintext JSON. OpenPGP encryption is
     * the offline Tools project's job; this website never handles keys or
     * passphrases and does not claim a cold-backup encryption format. The
     * download stays behind an explicit plaintext-health-data confirmation.
     */
    const handleCompleteBackupExport = () => {
        const warning = describeCompleteBackupExportWarning(t);
        showDialog(
            'confirm',
            warning.message,
            () => {
                try {
                    // Build at confirm time, not when the dialog opened: the
                    // arrays may have changed while the warning was on screen.
                    const report = completeBackupRef.current.build();
                    downloadFile(
                        JSON.stringify(report.bundle, null, 2),
                        `hrt-complete-backup-${new Date().toISOString().split('T')[0]}.json`,
                    );
                    // Collapsed duplicates and expired deletion marks are
                    // housekeeping; only records left out are worth a word.
                    if (report.issues.length) console.warn('Complete backup export:', report.issues);
                    if (report.invalidRecords > 0) {
                        showDialog('alert', t('export.complete_skipped').replace('{n}', String(report.invalidRecords)));
                    }
                } catch (err) {
                    console.error(err);
                    showDialog('alert', t('export.complete_failed'));
                }
            },
            {
                danger: true,
                title: warning.title,
                confirmLabel: warning.confirmLabel,
            },
        );
    };

    // Reconcile, then upload — not a plain upload. Every save inserts a new
    // newest revision with no "only if unchanged", so writing without reading
    // first would let one device's press erase a dose another device deleted.
    // Works with auto-sync switched off; refuses when the cloud copy is
    // encrypted and unreadable here, rather than replacing it with plaintext.
    const handleCloudSave = async () => {
        if (!token) {
            requireSignIn();
            return;
        }
        const { outcome, errorCode } = await sync.syncNow();
        // A locked cloud copy is not a failure to retry — it is a password this
        // device hasn't been given. Say so, rather than the flat "save failed"
        // that sent people pressing the button again to no effect. A failure
        // likewise names its cause: the worker's error code picks the line.
        if (outcome === 'error') {
            showDialog('alert', `${t('account.cloud_save_failed')} ${describeSyncError(errorCode, t)}`);
            return;
        }
        showDialog(
            'alert',
            t(
                outcome === 'synced'
                    ? 'account.cloud_save_success'
                    : outcome === 'locked'
                      ? 'account.cloud_save_locked'
                      : 'account.cloud_save_failed',
            ),
        );
    };

    const handleCloudLoad = async (backupId?: string) => {
        if (!token) {
            requireSignIn();
            return;
        }
        try {
            let parsed: unknown;
            let timestamp: number;
            if (backupId) {
                const backup = await cloudService.loadOne(token, backupId);
                parsed = await parseCloudBackup(backup.data);
                timestamp = backup.created_at;
            } else {
                // Metadata first, then fetch only the newest body.
                const metas = await cloudService.listMeta(token);
                if (!metas || metas.length === 0) {
                    showDialog('alert', t('account.no_cloud_backups'));
                    return;
                }
                const newest = metas.reduce((a, b) => (b.created_at > a.created_at ? b : a));
                const latest = await cloudService.loadOne(token, newest.id);
                parsed = await parseCloudBackup(latest.data);
                timestamp = latest.created_at;
            }
            if (!parsed) {
                showDialog('alert', t('account.cloud_load_failed'));
                return;
            }
            showDialog(
                'confirm',
                (t('account.load_confirm') as string).replace('{time}', new Date(timestamp * 1000).toLocaleString()),
                () => {
                    data.processImportedData(parsed);
                },
                { danger: true },
            );
        } catch (e) {
            showDialog('alert', t('account.cloud_load_failed'));
        }
    };

    const handleCloudMerge = async (backupId: string) => {
        if (!token) {
            requireSignIn();
            return;
        }
        try {
            const backup = await cloudService.loadOne(token, backupId);
            const parsed = await parseCloudBackup(backup.data);
            if (!parsed) {
                showDialog('alert', t('account.merge_cloud_failed'));
                return;
            }
            data.mergeImportedData(parsed);
        } catch (e) {
            showDialog('alert', t('account.merge_cloud_failed'));
        }
    };

    return {
        isPasswordInputOpen,
        closePasswordPrompt,
        handlePasswordSubmit,
        handleQuickExport,
        handleExportConfirm,
        handleCompleteBackupExport,
        importEventsFromJson,
        replaceCompleteBackupFromJson,
        handleCloudSave,
        handleCloudLoad,
        handleCloudMerge,
    };
};
