import React, { useEffect, useId, useState } from 'react';
import { Alert, Busy, ChevronDown } from '../components/icons';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { settingsSection } from '../components/SettingsListItem';
import { useDialog } from '../contexts/DialogContext';
import { useTranslation } from '../contexts/LanguageContext';
import { BusyLabel, SwapLabel } from '../components/StableLabel';
import { apiErrorCode } from '../services/apiClient';
import { f2fService, F2fMember, F2fStatus } from '../services/f2f';

interface F2fProps {
    token: string;
    onBack: () => void;
}

const on = 'text-[var(--text)]';
const muted = 'text-xs leading-relaxed text-[var(--text-muted)]';
const input = 'input-base text-sm placeholder:font-sans';
const mono = 'break-all font-mono text-xs text-[var(--text-muted)] tabular-nums';
// A fingerprint read out in blocks of four wraps between blocks, never inside one.
const fprText = 'font-mono text-xs text-[var(--text-muted)] tabular-nums';
const textButton =
    'shrink-0 whitespace-nowrap text-xs font-medium text-[var(--accent-ink)] hover:opacity-80 disabled:opacity-40 transition-opacity';
// A name and its value on one hairline row.
const row = 'flex items-baseline justify-between gap-4 py-3 text-sm';

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

/** The heading over a section of the page: sentence case, quiet, close to what it heads. */
const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h2 className="group-heading mb-1">{children}</h2>
);

/** One step of the how-to: its number in the margin, what to do and why, and
 *  under that the command that does it, ready to copy. */
const Step: React.FC<{ n: number; title: string; desc: string; children?: React.ReactNode }> = ({
    n,
    title,
    desc,
    children,
}) => (
    <li className="flex gap-3 py-4">
        <span className="w-5 shrink-0 text-sm leading-[1.375rem] tabular-nums text-[var(--text-muted)]">{n}</span>
        <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium leading-[1.375rem] ${on}`}>{title}</p>
            <p className={`${muted} mt-0.5`}>{desc}</p>
            {children}
        </div>
    </li>
);

const F2f: React.FC<F2fProps> = ({ token, onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const id = useId();
    const [status, setStatus] = useState<F2fStatus | null>(null);
    const [members, setMembers] = useState<F2fMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    // What went wrong, and which button it came from, so it can be said
    // right under that button.
    const [error, setError] = useState<{ at: string; text: string } | null>(null);
    const [publicKey, setPublicKey] = useState('');
    const [fingerprint, setFingerprint] = useState('');
    const [copied, setCopied] = useState<string | null>(null);
    const [cliCode, setCliCode] = useState<{ code: string; expires_at: number } | null>(null);
    // The how-to starts open for someone with no key here yet and folded for
    // someone who has one. Decided once, on the first load, so uploading a
    // key doesn't fold it away while the last two steps are still to do.
    const [guideOpen, setGuideOpen] = useState<boolean | null>(null);

    const describe = (err: unknown) => t(ERROR_KEYS[apiErrorCode(err)] ?? 'f2f.error');

    /** The error from the button at `at`, as a hint line under it, in words. */
    const errorAt = (at: string) =>
        error?.at === at ? (
            <p role="alert" className="field-hint is-error">
                {error.text}
            </p>
        ) : null;

    const stateLabel = (state: string | undefined) => {
        const key = `f2f.state_${state}`;
        const label = t(key);
        return label === key ? (state ?? '') : label;
    };

    const fetchAll = async () => {
        const next = await f2fService.status(token);
        setStatus(next);
        setMembers(next.registered && next.cohort ? await f2fService.members(token, next.cohort.id) : []);
        return next;
    };

    const load = async () => {
        setLoading(true);
        try {
            const next = await fetchAll();
            setGuideOpen(open => open ?? !next.registered);
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
            setError({ at: key, text: describe(err) });
        } finally {
            setBusy(null);
        }
    };

    const upload = () => {
        const key = publicKey.trim();
        // GPG prints a fingerprint in blocks of four; the server takes it
        // without the spaces.
        const fpr = fingerprint.replace(/\s+/g, '');
        if (!key || !fpr) {
            setError({ at: 'upload', text: t('f2f.key_required') });
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
            setError({ at: 'copy', text: t('f2f.error') });
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
            setError({ at: 'keyring', text: describe(err) });
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
            setError({ at: 'cli-code', text: describe(err) });
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
            <SwapLabel show={copied === label} off={t('f2f.copy')} on={t('f2f.copied')} align="end" />
        </button>
    );

    /** A command to run in a terminal, on a quiet filled note, with its own Copy. */
    const command = (text: string, label: string) => (
        <div className="callout mt-2 flow-root">
            {/* Copy floats at the top, so only the first line makes room for
                it and a long word further down (the CLI login code) still
                has the whole width to itself. */}
            <span className="float-end ms-3">{copyButton(text, label)}</span>
            <code className={`block font-mono text-xs leading-relaxed [overflow-wrap:anywhere] ${on}`}>
                {/* Each word kept whole, so a line breaks between them and
                    never right after the -- of --recipient. A word too long
                    for the line (a login code, a file name with the group's
                    id) may break only between blocks of four, and only when
                    it doesn't fit on a line of its own: its box moves down
                    whole first. */}
                {text.split(' ').map((word, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && ' '}
                        {word.length <= 28 ? (
                            <span className="whitespace-nowrap">{word}</span>
                        ) : (
                            <span className="inline-block max-w-full">
                                {word.match(/.{1,4}/g)?.map((block, j) => (
                                    <React.Fragment key={j}>
                                        {j > 0 && <wbr />}
                                        {block}
                                    </React.Fragment>
                                ))}
                            </span>
                        )}
                    </React.Fragment>
                ))}
            </code>
        </div>
    );

    const form = (
        <div className="mt-3 space-y-4">
            <div>
                <label htmlFor={`${id}-key`} className="field-label mb-1.5">
                    {t('f2f.public_key')}
                </label>
                <textarea
                    id={`${id}-key`}
                    className={`${input} min-h-32 font-mono text-xs`}
                    placeholder={t('f2f.public_key_placeholder')}
                    value={publicKey}
                    onChange={event => setPublicKey(event.target.value)}
                    spellCheck={false}
                />
            </div>
            <div>
                <label htmlFor={`${id}-fpr`} className="field-label">
                    {t('f2f.fingerprint')}
                </label>
                <input
                    id={`${id}-fpr`}
                    className={`${input} font-mono text-xs`}
                    placeholder={t('f2f.fingerprint_placeholder')}
                    value={fingerprint}
                    onChange={event => setFingerprint(event.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                />
            </div>
            <div>
                <button type="button" className="btn-tonal" onClick={upload} disabled={busy !== null}>
                    <BusyLabel busy={busy === 'upload'} size={15}>
                        {t('f2f.upload')}
                    </BusyLabel>
                </button>
                {errorAt('upload')}
            </div>
        </div>
    );

    const showGuide = guideOpen ?? false;
    const cohortFile = `hrt-f2f-${status?.cohort?.id ?? 'GROUP'}.asc`;

    return (
        <div className="relative md:pb-32">
            <PageHeader onBack={onBack} title={t('f2f.title')} subtitle={t('f2f.subtitle')} />
            <div className={`${PAGE_COLUMN} mt-2`}>
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
                    <div className="space-y-8">
                        <div className="space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <p className={muted}>{t('f2f.intro')}</p>
                                <button
                                    type="button"
                                    className={textButton}
                                    onClick={() => run('refresh', async () => {})}
                                    disabled={busy !== null}
                                >
                                    <BusyLabel busy={busy === 'refresh'} size={13}>
                                        {t('f2f.refresh')}
                                    </BusyLabel>
                                </button>
                            </div>
                            {errorAt('refresh')}
                            {errorAt('copy')}
                            <p className="text-xs leading-relaxed text-[var(--warning)]">{t('f2f.verify_note')}</p>
                        </div>

                        {/* The whole of it for someone new to OpenPGP: make a key,
                            hand over its public half, check fingerprints in
                            person, then write to each other. A fold in place, so
                            it's out of the way once it has been followed. */}
                        <section>
                            <h2 className="group-heading">
                                <button
                                    type="button"
                                    onClick={() => setGuideOpen(!showGuide)}
                                    aria-expanded={showGuide}
                                    aria-controls={`${id}-guide`}
                                    className="inline-flex items-center gap-1 text-start hover:text-[var(--text)]"
                                >
                                    {t('f2f.guide')}
                                    <ChevronDown
                                        size={14}
                                        strokeWidth={1.75}
                                        className={`chev ${showGuide ? 'rotate-180' : ''}`}
                                    />
                                </button>
                            </h2>
                            <div
                                id={`${id}-guide`}
                                className="disclosure"
                                data-open={showGuide}
                                {...(showGuide ? {} : { inert: '' })}
                            >
                                <div className="disclosure-inner">
                                    <p className={`${muted} mt-1`}>{t('f2f.guide_intro')}</p>
                                    <ol className={`${settingsSection} mt-1`}>
                                        <Step n={1} title={t('f2f.step_make')} desc={t('f2f.step_make_desc')}>
                                            {command(
                                                `gpg --quick-generate-key "${t('f2f.cmd_name')} <you@example.com>" future-default default never`,
                                                'cmd-make',
                                            )}
                                            <p className={`${muted} mt-2`}>{t('f2f.step_make_apps')}</p>
                                        </Step>
                                        <Step n={2} title={t('f2f.step_export')} desc={t('f2f.step_export_desc')}>
                                            {command('gpg --armor --export you@example.com', 'cmd-export')}
                                        </Step>
                                        <Step n={3} title={t('f2f.step_fpr')} desc={t('f2f.step_fpr_desc')}>
                                            {command('gpg --fingerprint you@example.com', 'cmd-fpr')}
                                        </Step>
                                        <Step n={4} title={t('f2f.step_upload')} desc={t('f2f.step_upload_desc')} />
                                        <Step n={5} title={t('f2f.step_use')} desc={t('f2f.step_use_desc')}>
                                            {/* Each command is copied as it is, so say right
                                                under it which parts are the reader's to fill in. */}
                                            {command(`gpg --import ${cohortFile}`, 'cmd-import')}
                                            <p className={`${muted} mt-1.5`}>{t('f2f.step_import_hint')}</p>
                                            <div className="mt-2">
                                                {command(
                                                    'gpg --encrypt --armor --recipient FINGERPRINT --recipient FINGERPRINT file.txt',
                                                    'cmd-encrypt',
                                                )}
                                            </div>
                                            <p className={`${muted} mt-1.5`}>{t('f2f.step_encrypt_hint')}</p>
                                        </Step>
                                    </ol>
                                </div>
                            </div>
                        </section>

                        {status?.registered && (
                            <section>
                                <Heading>{t('f2f.registered')}</Heading>
                                <div className={settingsSection}>
                                    <div className={row}>
                                        <span className={on}>{t('f2f.seat')}</span>
                                        <span className="tabular-nums text-[var(--text-muted)]">{status.seat}</span>
                                    </div>
                                    <div className={row}>
                                        <span className={on}>{t('f2f.members')}</span>
                                        <span className="tabular-nums text-[var(--text-muted)]">
                                            {status.cohort?.memberCount} / {status.cohort?.totalSeats}
                                        </span>
                                    </div>
                                    <div className={row}>
                                        <span className={on}>{t('f2f.state')}</span>
                                        <span className="text-[var(--text-muted)]">
                                            {stateLabel(status.cohort?.state)}
                                        </span>
                                    </div>
                                    <div className={row}>
                                        <span className={`shrink-0 ${on}`}>{t('f2f.cohort')}</span>
                                        <span className={`${mono} text-end`}>{status.cohort?.id}</span>
                                    </div>
                                    {status.key && (
                                        <div className="py-3">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <span className={`text-sm ${on}`}>{t('f2f.active_key')}</span>
                                                {copyButton(status.key.fingerprint, 'own-key')}
                                            </div>
                                            <p className={`${fprText} mt-1`}>
                                                {groupFingerprint(status.key.fingerprint)}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                {status.key && (
                                    <div className="mt-2 flex flex-wrap gap-2">
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
                                )}
                                {errorAt('retire')}
                                {errorAt('revoke')}
                            </section>
                        )}

                        {status?.registered && status.escrow && (
                            <section>
                                <Heading>{t('f2f.escrow_title')}</Heading>
                                <p className={muted}>{t('f2f.escrow_desc')}</p>
                                <div className="mt-2 flex items-start justify-between gap-3">
                                    <p className={fprText}>{groupFingerprint(status.escrow.fingerprint)}</p>
                                    {copyButton(status.escrow.fingerprint, 'escrow')}
                                </div>
                            </section>
                        )}

                        {status?.registered && (
                            <section>
                                <div className="mb-1 flex items-baseline justify-between gap-3">
                                    <h2 className="group-heading">{t('f2f.members_title')}</h2>
                                    <button
                                        type="button"
                                        className={textButton}
                                        onClick={() => void downloadKeyring()}
                                        disabled={busy !== null}
                                    >
                                        <BusyLabel busy={busy === 'keyring'} size={13}>
                                            {t('f2f.download_keyring')}
                                        </BusyLabel>
                                    </button>
                                </div>
                                {errorAt('keyring')}
                                <p className={muted}>{t('f2f.keyring_help')}</p>
                                {members.length === 0 ? (
                                    <p className={`${muted} mt-3`}>{t('f2f.no_members')}</p>
                                ) : (
                                    <div className={`${settingsSection} mt-1`}>
                                        {members.map(member => (
                                            <div key={member.seat} className="py-3">
                                                <p className="flex items-baseline gap-3 text-sm text-[var(--text)]">
                                                    <span className="w-8 shrink-0 tabular-nums text-[var(--text-muted)]">
                                                        {member.seat}
                                                    </span>
                                                    <span className="min-w-0 truncate">{member.username}</span>
                                                </p>
                                                <div className="mt-1 space-y-1 ps-11">
                                                    {member.keys.length === 0 ? (
                                                        <p className={muted}>{t('f2f.not_registered')}</p>
                                                    ) : (
                                                        member.keys.map(key => (
                                                            <div
                                                                key={key.fingerprint}
                                                                className="flex items-start justify-between gap-3"
                                                            >
                                                                <code className={fprText}>
                                                                    {groupFingerprint(key.fingerprint)}
                                                                    {key.status !== 'active' && (
                                                                        <span className="ms-2 font-sans tracking-normal">
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
                        )}

                        <section>
                            <Heading>{status?.registered ? t('f2f.rotate') : t('f2f.your_key')}</Heading>
                            <p className={muted}>
                                {status?.registered ? t('f2f.rotate_note') : t('f2f.not_registered')}
                            </p>
                            {form}
                        </section>

                        <section>
                            <Heading>{t('f2f.cli_title')}</Heading>
                            <p className={muted}>{t('f2f.cli_desc')}</p>
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
                            {errorAt('cli-code')}
                            {cliCode && (
                                <div className="mt-3 space-y-2">
                                    {/* The code on a line of its own, in groups of four that
                                        wrap between groups on a narrow phone; when it runs out
                                        and Copy share the row under it. */}
                                    <p className={`font-mono text-xs tabular-nums ${on}`}>
                                        {groupFingerprint(cliCode.code)}
                                    </p>
                                    <div className="flex items-center justify-between gap-3">
                                        <p className={muted}>
                                            {t('f2f.cli_expires').replace(
                                                '{time}',
                                                new Date(cliCode.expires_at * 1000).toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                }),
                                            )}
                                        </p>
                                        {copyButton(cliCode.code, 'cli-code')}
                                    </div>
                                    <p className={`${muted} pt-1`}>{t('f2f.cli_help')}</p>
                                    {command(
                                        `hrt-f2f login --server ${window.location.origin} --code ${cliCode.code} --token-out ~/.config/hrt-f2f/token`,
                                        'cli-command',
                                    )}
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

export default F2f;
