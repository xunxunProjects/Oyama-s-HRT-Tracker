import React, { useEffect, useState } from 'react';
import { AlertCircle, Copy, Download, Fingerprint, Loader2, RefreshCw } from 'lucide-react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { useDialog } from '../contexts/DialogContext';
import { useTranslation } from '../contexts/LanguageContext';
import { f2fService, F2fMember, F2fStatus } from '../services/f2f';

interface F2fProps {
    token: string;
    onBack: () => void;
}

const card = 'rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4';
const heading = 'text-sm font-semibold text-[var(--text)]';
const muted = 'text-xs text-[var(--text-muted)]';
const input =
    'w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent-ink)]';
const button = 'rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40 transition-colors';
const primary = `${button} bg-[var(--accent-subtle)] text-[var(--on-accent-subtle)]`;
const secondary = `${button} bg-[var(--surface-hover)] text-[var(--text)]`;
const danger = `${button} bg-[var(--surface-hover)] text-[var(--warning)]`;
const mono = 'break-all font-mono text-xs text-[var(--text-muted)]';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const F2f: React.FC<F2fProps> = ({ token, onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const [status, setStatus] = useState<F2fStatus | null>(null);
    const [members, setMembers] = useState<F2fMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [publicKey, setPublicKey] = useState('');
    const [fingerprint, setFingerprint] = useState('');
    const [copied, setCopied] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const next = await f2fService.status(token);
            setStatus(next);
            if (next.registered && next.cohort) {
                setMembers(await f2fService.members(token, next.cohort.id));
            } else {
                setMembers([]);
            }
            setError(null);
        } catch (loadError) {
            setError(errorMessage(loadError));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const run = async (key: string, action: () => Promise<unknown>) => {
        setBusy(key);
        setError(null);
        try {
            await action();
            await load();
        } catch (actionError) {
            setError(errorMessage(actionError));
        } finally {
            setBusy(null);
        }
    };

    const upload = () => {
        const key = publicKey.trim();
        const fpr = fingerprint.trim();
        if (!key || !fpr) {
            setError(t('f2f.key_required'));
            return;
        }
        void run('upload', async () => {
            await f2fService.upload(token, key, fpr);
            setPublicKey('');
            setFingerprint('');
        });
    };

    const copy = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(label);
            window.setTimeout(() => setCopied(current => (current === label ? null : current)), 1500);
        } catch {
            setError(t('f2f.error'));
        }
    };

    const downloadKeyring = async () => {
        const cohortId = status?.cohort?.id;
        if (!cohortId) return;
        setBusy('keyring');
        setError(null);
        try {
            const text = await f2fService.keyring(token, cohortId);
            const blob = new Blob([text], { type: 'application/pgp-keys' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `hrt-f2f-${cohortId}.asc`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (downloadError) {
            setError(errorMessage(downloadError));
        } finally {
            setBusy(null);
        }
    };

    const revoke = () => {
        const keyId = status?.key?.id;
        if (!keyId) return;
        showDialog(
            'confirm',
            t('f2f.revoke_confirm'),
            () => {
                void run('revoke', () => f2fService.revoke(token, keyId));
            },
            { danger: true, confirmLabel: t('f2f.revoke') },
        );
    };

    const form = (
        <div className="mt-3 space-y-2">
            <textarea
                className={`${input} min-h-32 font-mono`}
                placeholder={t('f2f.public_key_placeholder')}
                value={publicKey}
                onChange={event => setPublicKey(event.target.value)}
                spellCheck={false}
            />
            <input
                className={`${input} font-mono`}
                placeholder={t('f2f.fingerprint_placeholder')}
                value={fingerprint}
                onChange={event => setFingerprint(event.target.value)}
                spellCheck={false}
            />
            <button className={primary} onClick={upload} disabled={busy !== null}>
                {busy === 'upload' ? <Loader2 size={16} className="animate-spin" /> : t('f2f.upload')}
            </button>
        </div>
    );

    return (
        <>
            <PageHeader onBack={onBack} title={t('f2f.title')} subtitle={t('f2f.subtitle')} />
            <div className={`${PAGE_COLUMN} mt-2 space-y-4`}>
                {loading ? (
                    <div className="flex justify-center py-16">
                        <Loader2 className="animate-spin text-[var(--text-muted)]" size={20} />
                    </div>
                ) : (
                    <>
                        {error && (
                            <div className={`${card} flex items-start gap-2 text-sm text-[var(--warning)]`}>
                                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <section className={card}>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className={heading}>{t('f2f.title')}</p>
                                    <p className={`${muted} mt-1`}>{t('f2f.intro')}</p>
                                </div>
                                <button
                                    className={secondary}
                                    onClick={() => run('refresh', load)}
                                    disabled={busy !== null}
                                    aria-label={t('account.retry')}
                                >
                                    <RefreshCw size={16} className={busy === 'refresh' ? 'animate-spin' : ''} />
                                </button>
                            </div>
                            <p className="mt-2 text-xs text-[var(--warning)]">{t('f2f.verify_note')}</p>
                        </section>

                        {status?.registered ? (
                            <>
                                <section className={card}>
                                    <div className="flex items-center gap-2">
                                        <Fingerprint size={16} className="text-[var(--text-muted)]" />
                                        <p className={heading}>{t('f2f.registered')}</p>
                                    </div>
                                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                        <dt className={muted}>{t('f2f.seat')}</dt>
                                        <dd className="text-[var(--text)]">{status.seat}</dd>
                                        <dt className={muted}>{t('f2f.members')}</dt>
                                        <dd className="text-[var(--text)]">
                                            {status.cohort?.memberCount} / {status.cohort?.totalSeats}
                                        </dd>
                                        <dt className={muted}>{t('f2f.state')}</dt>
                                        <dd className="text-[var(--text)]">{status.cohort?.state}</dd>
                                        <dt className={muted}>{t('f2f.cohort')}</dt>
                                        <dd className={mono}>{status.cohort?.id}</dd>
                                    </dl>
                                    {status.key && (
                                        <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
                                            <p className={muted}>{t('f2f.active_key')}</p>
                                            <p className={mono}>{status.key.fingerprint}</p>
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                <button
                                                    className={secondary}
                                                    onClick={() => copy(status.key!.fingerprint, 'own-key')}
                                                >
                                                    <Copy size={14} className="mr-1 inline" />
                                                    {copied === 'own-key' ? t('f2f.copied') : t('f2f.copy')}
                                                </button>
                                                <button
                                                    className={secondary}
                                                    onClick={() =>
                                                        run('retire', () => f2fService.retire(token, status.key!.id))
                                                    }
                                                    disabled={busy !== null}
                                                >
                                                    {t('f2f.retire')}
                                                </button>
                                                <button className={danger} onClick={revoke} disabled={busy !== null}>
                                                    {t('f2f.revoke')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </section>

                                {status.escrow && (
                                    <section className={card}>
                                        <p className={heading}>{t('f2f.escrow_title')}</p>
                                        <p className={`${muted} mt-1`}>{t('f2f.escrow_desc')}</p>
                                        <p className={`${mono} mt-2`}>{status.escrow.fingerprint}</p>
                                        <button
                                            className={`${secondary} mt-2`}
                                            onClick={() => copy(status.escrow!.fingerprint, 'escrow')}
                                        >
                                            <Copy size={14} className="mr-1 inline" />
                                            {copied === 'escrow' ? t('f2f.copied') : t('f2f.copy')}
                                        </button>
                                    </section>
                                )}

                                <section className={card}>
                                    <p className={heading}>{t('f2f.rotate')}</p>
                                    <p className={`${muted} mt-1`}>{t('f2f.rotate_note')}</p>
                                    {form}
                                </section>

                                <section className={card}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className={heading}>{t('f2f.members_title')}</p>
                                        <button
                                            className={secondary}
                                            onClick={() => void downloadKeyring()}
                                            disabled={busy !== null}
                                        >
                                            <Download size={14} className="mr-1 inline" />
                                            {t('f2f.download_keyring')}
                                        </button>
                                    </div>
                                    <p className={`${muted} mt-1`}>{t('f2f.keyring_help')}</p>
                                    {members.length === 0 ? (
                                        <p className={`${muted} mt-2`}>{t('f2f.no_members')}</p>
                                    ) : (
                                        <div className="mt-3 space-y-3">
                                            {members.map(member => (
                                                <div
                                                    key={member.seat}
                                                    className="rounded-lg border border-[var(--border)] p-3"
                                                >
                                                    <p className="text-sm font-medium text-[var(--text)]">
                                                        #{member.seat} · {member.username}
                                                    </p>
                                                    <div className="mt-1 space-y-1">
                                                        {member.keys.length === 0 ? (
                                                            <p className={muted}>{t('f2f.not_registered')}</p>
                                                        ) : (
                                                            member.keys.map(key => (
                                                                <div
                                                                    key={key.fingerprint}
                                                                    className="flex flex-wrap items-center gap-2"
                                                                >
                                                                    <code className={mono}>{key.fingerprint}</code>
                                                                    {key.status !== 'active' && (
                                                                        <span className={muted}>
                                                                            {t('f2f.retired')}
                                                                        </span>
                                                                    )}
                                                                    <button
                                                                        className="text-xs text-[var(--accent-ink)]"
                                                                        onClick={() =>
                                                                            copy(key.publicKey, key.fingerprint)
                                                                        }
                                                                    >
                                                                        {copied === key.fingerprint
                                                                            ? t('f2f.copied')
                                                                            : t('f2f.copy')}
                                                                    </button>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </>
                        ) : (
                            <section className={card}>
                                <p className={heading}>{t('f2f.not_registered')}</p>
                                {form}
                            </section>
                        )}
                    </>
                )}
            </div>
        </>
    );
};

export default F2f;
