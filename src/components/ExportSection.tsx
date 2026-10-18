import React, { useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { DoseEvent, LabResult } from '../../logic';
import { Lock } from 'lucide-react';
import { CopyTick } from './Tick';
import { exportToCSV, exportToPDF } from '../services/export';
import { settingsSection, rowBleed } from './SettingsListItem';
import { copyText } from '../utils/clipboard';
import { MIN_PASSWORD_LENGTH, newPasswordLevel } from '../../passwordStrength';
import PasswordStrengthHint from './PasswordStrengthHint';
import PgpBackupRow from './PgpBackupRow';

interface ExportSectionProps {
    events: DoseEvent[];
    labResults: LabResult[];
    weight: number;
    onExport: (encrypt: boolean, password?: string) => Promise<string | null>;
    /** Copies the export to the clipboard. Resolving to false means the copy
     *  failed; nothing returned is taken as done. */
    onQuickExport?: () => void | boolean | Promise<void | boolean>;
    /** Encrypts the export to an OpenPGP public key and downloads it. */
    onPgpBackup?: (armoredKey: string) => Promise<void>;
}

// Each row is one button, so the whole row takes the tap, not only the
// 22px-tall accent words on the right, which stay as the row's label for
// what it does. Rows are divided the way Settings rows are.
const rowBase = 'w-full flex items-start justify-between py-[18px] text-start';
const rowLabel = 'block text-[0.9375rem] text-[var(--text)]';
const rowDesc = 'block text-xs text-[var(--text-muted)] mt-0.5';
const action = 'text-sm font-medium text-[var(--accent-ink)] shrink-0 ml-6 mt-0.5';

const ExportSection: React.FC<ExportSectionProps> = ({
    events,
    labResults,
    weight,
    onExport,
    onQuickExport,
    onPgpBackup,
}) => {
    const { t, lang } = useTranslation();
    const [showEncrypted, setShowEncrypted] = useState(false);
    const [password, setPassword] = useState('');
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [jsonCopied, setJsonCopied] = useState(false);
    // Which copy last failed, if any. A tick only ever means the clipboard
    // really has it: a password shown as copied when it wasn't is a backup
    // nobody can open.
    const [copyFailed, setCopyFailed] = useState<'json' | 'password' | null>(null);

    const hasData = events.length > 0 || labResults.length > 0;

    // The file this password protects is downloaded and attacked offline, so
    // it gets the same floor the account password does. An empty field means
    // "generate one for me" and stays allowed.
    const level = newPasswordLevel(password);
    const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
    const passwordBlocked = tooShort || level === 'weak' || level === 'tooLong';

    const handleJsonExport = async () => {
        await onExport(false);
    };

    const handleEncryptedExport = async () => {
        const pw = await onExport(true, password || undefined);
        if (pw) {
            setGeneratedPassword(pw);
            setCopyFailed(null);
        }
    };

    const handleCopyPassword = async () => {
        if (!generatedPassword) return;
        setCopyFailed(null);
        try {
            await copyText(generatedPassword);
        } catch {
            setCopied(false);
            setCopyFailed('password');
            return;
        }
        setCopyFailed(null);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyJson = async () => {
        if (!onQuickExport) return;
        setCopyFailed(null);
        setJsonCopied(false);
        let ok: void | boolean;
        try {
            ok = await onQuickExport();
        } catch {
            ok = false;
        }
        if (ok === false) {
            setJsonCopied(false);
            setCopyFailed('json');
            return;
        }
        setCopyFailed(null);
        setJsonCopied(true);
        setTimeout(() => setJsonCopied(false), 2000);
    };

    const handleCsvExport = () => {
        const csv = exportToCSV({ events, labResults, weight, lang, t });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `hrt-data-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (!hasData) {
        return <p className="py-8 text-sm text-center text-[var(--text-muted)]">{t('drawer.empty_export')}</p>;
    }

    return (
        <>
            <div className={settingsSection}>
                {/* JSON */}
                <button onClick={handleJsonExport} className={`${rowBase} ${rowBleed}`}>
                    <span>
                        <span className={rowLabel}>JSON</span>
                        <span className={rowDesc}>{t('drawer.save_hint')}</span>
                    </span>
                    <span className={action}>{t('export.btn_json')}</span>
                </button>

                {/* Copy JSON */}
                {onQuickExport && (
                    <button onClick={handleCopyJson} className={`${rowBase} ${rowBleed}`}>
                        <span>
                            <span className={rowLabel}>{t('export.btn_copy_json')}</span>
                            <span className={rowDesc}>
                                {copyFailed === 'json' ? t('export.copy_failed') : t('export.copy_desc')}
                            </span>
                        </span>
                        <span className={`${action} flex items-center gap-1`}>
                            <CopyTick copied={jsonCopied} size={13} />
                            {jsonCopied ? t('export.copied') : t('btn.copy')}
                        </span>
                    </button>
                )}

                {/* Encrypted JSON. Once a password is on screen the row stops
                    being a toggle: that password is the only way into the file
                    just saved, so a stray tap on the title must not wipe it.
                    Only the panel's own OK closes it then. */}
                <div>
                    <button
                        onClick={() => {
                            if (!generatedPassword) setShowEncrypted(v => !v);
                        }}
                        aria-expanded={showEncrypted}
                        aria-disabled={generatedPassword ? true : undefined}
                        className={`${rowBase} ${generatedPassword ? 'row-bleed cursor-default' : rowBleed}`}
                    >
                        <span>
                            <span className={rowLabel}>{`JSON (${t('export.encrypt_label')})`}</span>
                            <span className={rowDesc}>{t('export.encrypt_ask_desc')}</span>
                        </span>
                        {!generatedPassword && (
                            <span className={action}>
                                {showEncrypted ? t('btn.cancel') : t('export.btn_encrypted')}
                            </span>
                        )}
                    </button>

                    {showEncrypted && (
                        <div className="pb-[18px] space-y-3">
                            <div className="relative">
                                <input
                                    type="password"
                                    name="export-encryption-password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder={t('export.password_placeholder')}
                                    className="w-full py-2.5 px-3 pl-9 text-sm bg-[var(--field)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--accent-ink)] text-[var(--text)] placeholder:text-[var(--text-muted)]"
                                    autoComplete="new-password"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                                <Lock
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                                    size={14}
                                />
                            </div>
                            <p className="text-xs text-[var(--text-muted)]">{t('export.password_hint_random')}</p>
                            <PasswordStrengthHint level={tooShort ? 'tooShort' : level} />
                            <button
                                onClick={handleEncryptedExport}
                                disabled={passwordBlocked}
                                className="btn-primary w-full"
                            >
                                {t('export.btn_encrypted')}
                            </button>

                            {generatedPassword && (
                                <div className="mt-2 border border-[var(--border)] rounded-lg p-3 space-y-2">
                                    <p className="text-xs font-semibold text-[var(--text)]">
                                        {t('export.password_title')}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)]">{t('export.password_desc')}</p>
                                    <div className="flex items-center gap-2 bg-[var(--surface-hover)] rounded-md px-3 py-2">
                                        <span className="font-mono text-sm text-[var(--text)] flex-1 select-all break-all">
                                            {generatedPassword}
                                        </span>
                                        <button
                                            onClick={handleCopyPassword}
                                            aria-label={copied ? t('export.copied') : t('btn.copy')}
                                            className="tap-target shrink-0 p-1 text-[var(--text-muted)]"
                                        >
                                            <CopyTick copied={copied} size={14} />
                                        </button>
                                    </div>
                                    {copyFailed === 'password' && (
                                        <p className="text-xs text-[var(--text-muted)]">{t('export.copy_failed')}</p>
                                    )}
                                    <button
                                        onClick={() => {
                                            setGeneratedPassword(null);
                                            setShowEncrypted(false);
                                        }}
                                        className="tap-target w-full py-1.5 text-xs text-[var(--text-muted)]"
                                    >
                                        {t('btn.ok')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {onPgpBackup && <PgpBackupRow onBackup={onPgpBackup} />}

                {/* CSV */}
                <button onClick={handleCsvExport} className={`${rowBase} ${rowBleed}`}>
                    <span>
                        <span className={rowLabel}>CSV</span>
                        <span className={rowDesc}>{t('export.csv_desc')}</span>
                    </span>
                    <span className={action}>{t('export.btn_csv')}</span>
                </button>

                {/* PDF */}
                <button
                    onClick={() => exportToPDF({ events, labResults, weight, lang, t })}
                    className={`${rowBase} ${rowBleed}`}
                >
                    <span>
                        <span className={rowLabel}>PDF</span>
                        <span className={rowDesc}>{t('export.pdf_desc')}</span>
                    </span>
                    <span className={action}>{t('export.btn_pdf')}</span>
                </button>
            </div>

            {/* Where a copy's result is announced, failed or done. It stays
                mounted, outside the rows, because a button's contents are read
                as its name rather than as news, and a region that appears
                already filled is often not read at all. It is emptied before
                each try, so a second result is heard again. */}
            <p className="sr-only" role="status">
                {copyFailed ? t('export.copy_failed') : jsonCopied ? t('export.copied') : ''}
            </p>
        </>
    );
};

export default ExportSection;
