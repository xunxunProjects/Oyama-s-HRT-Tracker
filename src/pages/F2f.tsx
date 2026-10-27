import React, { useEffect, useState } from 'react';
import { Alert, Busy } from '../components/icons';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { useDialog } from '../contexts/DialogContext';
import { useTranslation } from '../contexts/LanguageContext';
import { BusyLabel, SwapLabel } from '../components/StableLabel';
import { apiErrorCode } from '../services/apiClient';
import { f2fService, F2fMember, F2fStatus } from '../services/f2f';

interface F2fProps {
    token: string;
    onBack: () => void;
}

const card = 'rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4';
const heading = 'text-sm font-medium text-[var(--text)]';
const muted = 'text-xs leading-relaxed text-[var(--text-muted)]';
const input = 'input-base text-sm placeholder:font-sans';
const mono = 'break-all font-mono text-xs tracking-wide text-[var(--text-muted)] tabular-nums';
const textButton =
    'text-xs font-medium text-[var(--accent-ink)] hover:opacity-80 disabled:opacity-40 transition-opacity';

/* The server's codes, in words the reader can act on. Anything unexpected,
   including a bare 500, becomes the one calm "something went wrong" line
   rather than English text from the worker. */
const ERROR_KEYS: Record<string, string> = {
    SCHEMA_OUTDATED: 'f2f.err_not_ready',
    RATE_LIMITED: 'f2f.err_rate',
    INVALID_KEY: 'f2f.err_invalid_key',
    BODY_TOO_LARGE: 'f2f.err_invalid_key',
    KEY_EXISTS: 'f2f.err_key_exists',
    KEY_LIMIT: 'f2f.err_key_limit',
    SEAT_UNAVAILABLE: 'f2f.err_no_seat',
    COHORT_CLOSED: 'f2f.err_no_seat',
    ESCROW_UNAVAILABLE: 'f2f.err_no_seat',
    NETWORK: 'f2f.err_network',
};

/** Fingerprints in blocks of four, the way GPG prints them, so two people can
 *  read one out to each other. Copy buttons still copy the raw value. */
const groupFingerprint = (value: string) => value.replace(/(.{4})(?=.)/g, '$1 ');

const F2f: React.FC<F2fProps> = ({ token, onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const [status, setStatus] = useState<F2fStatus | null>(null);
    const [members, setMembers] = useState<F2fMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [publicKey, setPublicKey] = useState('');
    const [fingerprint, setFingerprint] = useState('');
    const [copied, setCopied] = useState<string | null>(null);
    const [cliCode, setCliCode] = useState<{ code: string; expires_at: number } | null>(null);

    const describe = (err: unknown) => t(ERROR_KEYS[apiErrorCode(err)] ?? 'f2f.error');

    const stateLabel = (state: string | undefined) => {
        const key = `f2f.state_${state}`;
        const label = t(key);
        return label === key ? (state ?? '') : label;
    };

    const fetchAll = async () => {
        const next = await f2fService.status(token);
        setStatus(next);
        setMembers(next.registered && next.cohort ? await f2fService.members(token, next.cohort.id) : []);
    };

    const load = async () => {
        setLoading(true);
        try {
            await fetchAll();
            setLoadError(null);
        } catch (err) {
            setLoadError(describe(err));
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
            await fetchAll();
        } catch (err) {
            setError(describe(err));
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
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            setError(describe(err));
        } finally {
            setBusy(null);
        }
    };

    const generateCliCode = async () => {
        setBusy('cli-code');
        setError(null);
        try {
            setCliCode(await f2fService.createCliCode(token));
        } catch (err) {
            setError(describe(err));
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

    const copyButton = (value: string, label: string) => (
        <button type="button" className={textButton} onClick={() => copy(value, label)}>
            <SwapLabel show={copied === label} off={t('f2f.copy')} on={t('f2f.copied')} />
        </button>
    );

    const form = (
        <div className="mt-3 space-y-2">
            <textarea
                className={`${input} min-h-32 font-mono text-xs`}
                placeholder={t('f2f.public_key_placeholder')}
                value={publicKey}
                onChange={event => setPublicKey(event.target.value)}
                spellCheck={false}
            />
            <input
                className={`${input} font-mono text-xs`}
                placeholder={t('f2f.fingerprint_placeholder')}
                value={fingerprint}
                onChange={event => setFingerprint(event.target.value)}
                spellCheck={false}
            />
            <button type="button" className="btn-tonal mt-1" onClick={upload} disabled={busy !== null}>
                <BusyLabel busy={busy === 'upload'} size={15}>
                    {t('f2f.upload')}
                </BusyLabel>
            </button>
        </div>
    );

    return (
        <div className="relative pb-32">
            <PageHeader onBack={onBack} title={t('f2f.title')} subtitle={t('f2f.subtitle')} />
            <div className={`${PAGE_COLUMN} mt-2 space-y-4`}>
                {loading ? (
                    <div className="flex justify-center py-16">
                        <Busy className="animate-spin text-[var(--text-muted)]" size={20} />
                    </div>
                ) : loadError ? (
                    <div className="flex flex-col items-center gap-2 py-14 text-center">
                        <p role="alert" className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
                            <Alert size={15} className="shrink-0 text-[var(--warning)]" />
                            {loadError}
                        </p>
                        <button type="button" onClick={load} className="btn-ghost btn-ghost-accent tap-target">
                            {t('account.retry')}
                        </button>
                    </div>
                ) : (
                    <>
                        <section className={card}>
                            <div className="flex items-start justify-between gap-3">
                                <p className={muted}>{t('f2f.intro')}</p>
                                <button
                                    type="button"
                                    className={`${textButton} shrink-0`}
                                    onClick={() => run('refresh', async () => {})}
                                    disabled={busy !== null}
                                >
                                    {t('f2f.refresh')}
                                </button>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-[var(--warning)]">{t('f2f.verify_note')}</p>
                        </section>

                        {error && (
                            <p role="alert" className="flex items-start gap-1.5 px-1 text-sm text-[var(--warning)]">
                                <Alert size={15} className="mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </p>
                        )}

                        {status?.registered ? (
                            <>
                                <section className={card}>
                                    <p className={heading}>{t('f2f.registered')}</p>
                                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                                        <dt className={muted}>{t('f2f.seat')}</dt>
                                        <dd className="tabular-nums text-[var(--text)]">{status.seat}</dd>
                                        <dt className={muted}>{t('f2f.members')}</dt>
                                        <dd className="tabular-nums text-[var(--text)]">
                                            {status.cohort?.memberCount} / {status.cohort?.totalSeats}
                                        </dd>
                                        <dt className={muted}>{t('f2f.state')}</dt>
                                        <dd className="text-[var(--text)]">{stateLabel(status.cohort?.state)}</dd>
                                        <dt className={muted}>{t('f2f.cohort')}</dt>
                                        <dd className={mono}>{status.cohort?.id}</dd>
                                    </dl>
                                    {status.key && (
                                        <div className="mt-4 border-t border-[var(--border)] pt-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className={muted}>{t('f2f.active_key')}</p>
                                                {copyButton(status.key.fingerprint, 'own-key')}
                                            </div>
                                            <p className={`${mono} mt-1`}>{groupFingerprint(status.key.fingerprint)}</p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    className="btn-ghost"
                                                    onClick={() =>
                                                        run('retire', () => f2fService.retire(token, status.key!.id))
                                                    }
                                                    disabled={busy !== null}
                                                >
                                                    {t('f2f.retire')}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-ghost"
                                                    style={{ color: 'var(--warning)' }}
                                                    onClick={revoke}
                                                    disabled={busy !== null}
                                                >
                                                    {t('f2f.revoke')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </section>

                                {status.escrow && (
                                    <section className={card}>
                                        <div className="flex items-center justify-between gap-3">
                                            <p className={heading}>{t('f2f.escrow_title')}</p>
                                            {copyButton(status.escrow.fingerprint, 'escrow')}
                                        </div>
                                        <p className={`${muted} mt-1`}>{t('f2f.escrow_desc')}</p>
                                        <p className={`${mono} mt-2`}>{groupFingerprint(status.escrow.fingerprint)}</p>
                                    </section>
                                )}

                                <section className={card}>
                                    <div className="flex items-center justify-between gap-3">
                                        <p className={heading}>{t('f2f.members_title')}</p>
                                        <button
                                            type="button"
                                            className={textButton}
                                            onClick={() => void downloadKeyring()}
                                            disabled={busy !== null}
                                        >
                                            {t('f2f.download_keyring')}
                                        </button>
                                    </div>
                                    <p className={`${muted} mt-1`}>{t('f2f.keyring_help')}</p>
                                    {members.length === 0 ? (
                                        <p className={`${muted} mt-3`}>{t('f2f.no_members')}</p>
                                    ) : (
                                        <div className="mt-3">
                                            {members.map(member => (
                                                <div
                                                    key={member.seat}
                                                    className="border-t border-[var(--border)] py-3 last:pb-0"
                                                >
                                                    <p className="flex items-baseline gap-3 text-sm text-[var(--text)]">
                                                        <span className="w-8 shrink-0 tabular-nums text-[var(--text-muted)]">
                                                            {member.seat}
                                                        </span>
                                                        <span className="min-w-0 truncate">{member.username}</span>
                                                    </p>
                                                    <div className="mt-1 space-y-1 pl-11">
                                                        {member.keys.length === 0 ? (
                                                            <p className={muted}>{t('f2f.not_registered')}</p>
                                                        ) : (
                                                            member.keys.map(key => (
                                                                <div
                                                                    key={key.fingerprint}
                                                                    className="flex items-start justify-between gap-3"
                                                                >
                                                                    <code className={mono}>
                                                                        {groupFingerprint(key.fingerprint)}
                                                                        {key.status !== 'active' && (
                                                                            <span className="ml-2 font-sans tracking-normal">
                                                                                {t('f2f.retired')}
                                                                            </span>
                                                                        )}
                                                                    </code>
                                                                    {copyButton(key.publicKey, key.fingerprint)}
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <section className={card}>
                                    <p className={heading}>{t('f2f.rotate')}</p>
                                    <p className={`${muted} mt-1`}>{t('f2f.rotate_note')}</p>
                                    {form}
                                </section>
                            </>
                        ) : (
                            <section className={card}>
                                <p className={heading}>{t('f2f.not_registered')}</p>
                                {form}
                            </section>
                        )}

                        <section className={card}>
                            <p className={heading}>{t('f2f.cli_title')}</p>
                            <p className={`${muted} mt-1`}>{t('f2f.cli_desc')}</p>
                            <button
                                type="button"
                                className="btn-secondary mt-3"
                                onClick={() => void generateCliCode()}
                                disabled={busy !== null}
                            >
                                <BusyLabel busy={busy === 'cli-code'} size={15}>
                                    {t('f2f.cli_generate')}
                                </BusyLabel>
                            </button>
                            {cliCode && (
                                <div className="mt-3 space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className={mono}>{cliCode.code}</p>
                                        {copyButton(cliCode.code, 'cli-code')}
                                    </div>
                                    <p className={muted}>
                                        {t('f2f.cli_expires').replace(
                                            '{time}',
                                            new Date(cliCode.expires_at * 1000).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            }),
                                        )}
                                    </p>
                                    <p className={`${muted} pt-1`}>{t('f2f.cli_help')}</p>
                                    <code className={`${mono} block rounded-lg bg-[var(--surface-muted)] p-3`}>
                                        {`hrt-f2f login --server ${window.location.origin} --code ${cliCode.code} --token-out ~/.config/hrt-f2f/token`}
                                    </code>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};

export default F2f;
