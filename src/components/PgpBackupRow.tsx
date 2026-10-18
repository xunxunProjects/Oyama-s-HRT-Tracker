import React, { useRef, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { rowBleed } from './SettingsListItem';
import { checkPublicKey, groupFingerprint, KeyCheck, loadSavedKey, saveKey, SavedKey } from '../utils/pgpBackup';

interface PgpBackupRowProps {
    /** Encrypts the export to this armored public key and downloads it. */
    onBackup: (armoredKey: string) => Promise<void>;
}

const rowBase = 'w-full flex items-start justify-between py-[18px] text-start';
const rowLabel = 'block text-[0.9375rem] text-[var(--text)]';
const rowDesc = 'block text-xs text-[var(--text-muted)] mt-0.5';
const action = 'text-sm font-medium text-[var(--accent-ink)] shrink-0 ml-6 mt-0.5';

/**
 * The OpenPGP row on Export. The user brings a public key once; this device
 * keeps it and shows its fingerprint so it can be checked against the key's
 * own app. A different key later is never swapped in silently: both
 * fingerprints are shown first, since a swapped key means backups that only
 * someone else can open.
 */
const PgpBackupRow: React.FC<PgpBackupRowProps> = ({ onBackup }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const [open, setOpen] = useState(false);
    const [saved, setSaved] = useState<SavedKey | null>(() => loadSavedKey());
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const showForm = editing || !saved;

    const applyKey = async (armored: string) => {
        setError(null);
        setBusy(true);
        const res = await checkPublicKey(armored).catch((): KeyCheck => ({ ok: false, reason: 'unreadable' }));
        setBusy(false);
        if ('reason' in res) {
            setError(t(`pgp.err_${res.reason}`));
            // A private key pasted by mistake is not left sitting in the box.
            if (res.reason === 'private') setText('');
            return;
        }
        const next = { fingerprint: res.fingerprint, key: res.key, userId: res.userId };
        const keep = () => {
            saveKey(next);
            setSaved(next);
            setEditing(false);
            setText('');
        };
        if (saved && saved.fingerprint !== next.fingerprint) {
            showDialog(
                'confirm',
                t('pgp.change_confirm')
                    .replace('{old}', groupFingerprint(saved.fingerprint))
                    .replace('{new}', groupFingerprint(next.fingerprint)),
                keep,
                { danger: true, title: t('pgp.change_title'), confirmLabel: t('pgp.change_btn') },
            );
            return;
        }
        keep();
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const content = String(reader.result ?? '');
            setText(content);
            void applyKey(content);
        };
        reader.readAsText(file);
    };

    const handleBackup = async () => {
        if (!saved) return;
        setError(null);
        setBusy(true);
        try {
            // Checked again each time: a key that was fine last month may
            // have expired or been revoked since.
            const res = await checkPublicKey(saved.key);
            if ('reason' in res) {
                setError(t(`pgp.err_${res.reason}`));
                return;
            }
            await onBackup(saved.key);
        } catch (err) {
            console.error(err);
            setError(t('pgp.err_encrypt'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <button onClick={() => setOpen(v => !v)} aria-expanded={open} className={`${rowBase} ${rowBleed}`}>
                <span>
                    <span className={rowLabel}>OpenPGP</span>
                    <span className={rowDesc}>{t('pgp.desc')}</span>
                </span>
                <span className={action}>{open ? t('btn.cancel') : t('pgp.btn_open')}</span>
            </button>

            {open && (
                <div className="pb-[18px] space-y-3">
                    {saved && !editing && (
                        <div className="space-y-1">
                            <p className="text-xs text-[var(--text-muted)]">{t('pgp.fingerprint')}</p>
                            <p className="font-mono text-sm text-[var(--text)] tabular-nums break-words select-all">
                                {groupFingerprint(saved.fingerprint)}
                            </p>
                            {saved.userId && <p className="text-xs text-[var(--text-muted)]">{saved.userId}</p>}
                            <p className="text-xs text-[var(--text-muted)]">{t('pgp.verify_hint')}</p>
                        </div>
                    )}

                    {showForm && (
                        <>
                            <textarea
                                className="w-full h-28 p-3 bg-[var(--field)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--border-strong)] font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] resize-none"
                                style={{ fontSize: '16px' }}
                                placeholder={t('pgp.paste_placeholder')}
                                aria-label={t('pgp.paste_placeholder')}
                                value={text}
                                onChange={e => setText(e.target.value)}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                            />
                            <p className="text-xs text-[var(--text-muted)]">{t('pgp.public_only')}</p>
                        </>
                    )}

                    <p className="text-xs text-[var(--danger)]" role="status">
                        {error ?? ''}
                    </p>

                    {showForm ? (
                        <div className="flex items-center justify-end gap-4">
                            {saved && (
                                <button
                                    onClick={() => {
                                        setEditing(false);
                                        setText('');
                                        setError(null);
                                    }}
                                    className="tap-target text-sm text-[var(--text-muted)]"
                                >
                                    {t('btn.cancel')}
                                </button>
                            )}
                            <button
                                onClick={() => fileRef.current?.click()}
                                className="tap-target text-sm font-medium text-[var(--accent-ink)]"
                            >
                                {t('pgp.choose_file')}
                            </button>
                            <button
                                onClick={() => applyKey(text)}
                                disabled={!text.trim() || busy}
                                className="btn-primary"
                            >
                                {t('pgp.use_key')}
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-end gap-4">
                            <button
                                onClick={() => {
                                    setEditing(true);
                                    setError(null);
                                }}
                                className="tap-target text-sm font-medium text-[var(--accent-ink)]"
                            >
                                {t('pgp.change_key')}
                            </button>
                            <button onClick={handleBackup} disabled={busy} className="btn-primary">
                                {t('pgp.btn_download')}
                            </button>
                        </div>
                    )}

                    <input
                        ref={fileRef}
                        type="file"
                        accept=".asc,.pub,.txt,application/pgp-keys,text/plain"
                        className="hidden"
                        onChange={handleFile}
                    />
                </div>
            )}
        </div>
    );
};

export default PgpBackupRow;
