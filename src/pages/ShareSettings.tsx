import React, { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { Check, ChevronDown, Eye, EyeOff, Link2, Loader2, LockKeyhole, Trash2 } from 'lucide-react';
import { CopyTick } from '../components/Tick';
import Switch from '../components/Switch';
import { DoseEvent, HRTMode, SimulationResult } from '../../logic';
import { useTranslation } from '../contexts/LanguageContext';
import { getShareCopy } from '../i18n/share';
import { CreatedShare, notifyLiveSharesChanged, ShareApiError, ShareSummary, sharingService } from '../services/sharing';
import { useDialog } from '../contexts/DialogContext';
import { LOCALE_MAP } from '../utils/helpers';
import DateTimePicker from '../components/DateTimePicker';
import { buildSharedDosageSnapshot } from '../services/shareSnapshot';

interface ShareSettingsProps {
    onBack: () => void;
    authToken: string;
    mode: HRTMode;
    events: DoseEvent[];
    simulation: SimulationResult | null;
    calibrationFn: (timeH: number) => number;
}

const toLocalDateTimeValue = (timestamp: number): string => {
    const date = new Date(timestamp);
    return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

// `toLocaleString()` renders seconds, which makes every timestamp in the list
// read as noise. Share stamps only ever matter to the minute.
const formatStamp = (timestamp: number, lang: string): string =>
    new Date(timestamp).toLocaleString(LOCALE_MAP[lang] || 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

const badgeBase = 'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none';
const liveBadgeClass = `${badgeBase} bg-[var(--accent-subtle)] text-[var(--on-accent-subtle)]`;
const metaBadgeClass = `${badgeBase} bg-[var(--surface-hover)] text-muted`;

const ShareSettings: React.FC<ShareSettingsProps> = ({
    onBack,
    authToken,
    mode,
    events,
    simulation,
    calibrationFn,
}) => {
    const { lang, t } = useTranslation();
    const { showDialog } = useDialog();
    const copy = getShareCopy(lang);
    const [passwordEnabled, setPasswordEnabled] = useState(false);
    const [liveEnabled, setLiveEnabled] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [expiresAtInput, setExpiresAtInput] = useState('');
    const [isExpiryPickerOpen, setIsExpiryPickerOpen] = useState(false);
    const [createdShare, setCreatedShare] = useState<CreatedShare | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shares, setShares] = useState<ShareSummary[]>([]);
    const [sharesLoading, setSharesLoading] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const linkInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setPasswordEnabled(false);
        setLiveEnabled(false);
        setPassword('');
        setShowPassword(false);
        setExpiresAtInput(toLocalDateTimeValue(Date.now() + 7 * 24 * 60 * 60_000));
        setIsExpiryPickerOpen(false);
        setCreatedShare(null);
        setSubmitting(false);
        setCopied(false);
        setError(null);
        setShares([]);
        setSharesLoading(true);
        sharingService.list(authToken)
            .then(items => setShares(items.filter(item => !item.expired)))
            .catch(() => setShares([]))
            .finally(() => setSharesLoading(false));
    }, [authToken]);

    const shareSnapshot = useMemo(
        () => buildSharedDosageSnapshot({ mode, events, simulation, calibrationFn }),
        [mode, events, simulation, calibrationFn],
    );

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (submitting || !events.length) return;

        setError(null);
        setSubmitting(true);
        try {
            const expiresAt = new Date(expiresAtInput).getTime();
            if (
                !Number.isFinite(expiresAt)
                || expiresAt <= Date.now()
                || expiresAt > Date.now() + 365 * 24 * 60 * 60_000
            ) {
                setError(copy.invalidExpiry);
                return;
            }
            const result = await sharingService.create(authToken, shareSnapshot, {
                password: passwordEnabled ? password : undefined,
                expiresAt,
                live: liveEnabled,
            });
            setCreatedShare(result);
            if (result.live) notifyLiveSharesChanged();
            setShares(previous => [{
                id: result.id,
                createdAt: result.createdAt,
                expiresAt: result.expiresAt,
                passwordRequired: result.passwordRequired,
                live: result.live,
                mode: result.mode,
                updatedAt: result.updatedAt,
                expired: false,
            }, ...previous.filter(item => item.id !== result.id)]);
        } catch (requestError) {
            if (requestError instanceof ShareApiError) {
                if (requestError.code === 'SNAPSHOT_TOO_LARGE') setError(copy.tooLarge);
                else if (requestError.code === 'SHARE_LIMIT_REACHED') setError(copy.limitReached);
                else if (requestError.code === 'INVALID_EXPIRATION') setError(copy.invalidExpiry);
                else setError(copy.createError);
            } else {
                setError(copy.createError);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleCopy = async () => {
        if (!createdShare) return;
        try {
            await navigator.clipboard.writeText(createdShare.url);
        } catch {
            linkInputRef.current?.select();
            document.execCommand('copy');
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
    };

    const handleRevoke = (share: ShareSummary) => {
        showDialog('confirm', copy.revokeConfirm, async () => {
            setRevokingId(share.id);
            try {
                await sharingService.revoke(authToken, share.id);
                setShares(previous => previous.filter(item => item.id !== share.id));
                if (createdShare?.id === share.id) setCreatedShare(null);
                if (share.live) notifyLiveSharesChanged();
            } catch {
                showDialog('alert', copy.revokeError);
            } finally {
                setRevokingId(null);
            }
        }, { danger: true });
    };

    return (
        <div className="relative space-y-4 pb-32">
            <PageHeader onBack={onBack} title={copy.modalTitle} />

            <div className={PAGE_COLUMN}>
                <p className="pb-5 text-sm leading-relaxed text-muted">{copy.modalDescription}</p>
                    {createdShare ? (
                        <div className="pb-0 pt-5">
                            <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-body">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-subtle)] text-[var(--on-accent-subtle)]">
                                    <Check size={14} strokeWidth={2.25} />
                                </span>
                                <p className="text-[0.9375rem] font-medium">{copy.created}</p>
                                {createdShare.live && (
                                    <span className={liveBadgeClass}>{copy.liveBadge}</span>
                                )}
                                {createdShare.passwordRequired && (
                                    <span className={metaBadgeClass}>
                                        <LockKeyhole size={12} />
                                        {copy.protected}
                                    </span>
                                )}
                            </div>

                            <label className="sr-only" htmlFor="created-share-link">
                                {copy.copy}
                            </label>
                            <div className="flex flex-col gap-1 border-b border-[var(--border)] py-1 sm:flex-row sm:items-center sm:gap-3">
                                <input
                                    ref={linkInputRef}
                                    id="created-share-link"
                                    readOnly
                                    value={createdShare.url}
                                    className="min-w-0 flex-1 select-all truncate border-0 bg-transparent py-2.5 font-mono text-[0.8125rem] text-body outline-none"
                                    onFocus={(event) => event.currentTarget.select()}
                                />
                                {/* Both labels share one grid cell so the button keeps a single
                                    width across the copy → copied swap, in every locale. */}
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="-mr-2 grid shrink-0 place-items-center self-end rounded-md px-2.5 py-2 text-[0.9375rem] font-medium text-[var(--accent-ink)] transition-colors hover:bg-[var(--surface-hover)] sm:self-auto"
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <CopyTick copied={copied} size={14} />
                                        {/* Both labels share one cell so the button keeps the wider one's width. */}
                                        <span className="grid">
                                            <span className={`col-start-1 row-start-1 ${copied ? 'invisible' : ''}`}>{copy.copy}</span>
                                            <span className={`col-start-1 row-start-1 ${copied ? '' : 'invisible'}`}>{copy.copied}</span>
                                        </span>
                                    </span>
                                </button>
                            </div>

                            {createdShare.passwordRequired && (
                                <p className="mt-3 text-sm leading-relaxed text-muted">{copy.passwordHint}</p>
                            )}
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="border-b border-[var(--border)] pb-6">
                            <div className="callout mb-5">
                                {liveEnabled ? copy.liveSnapshotNote : copy.snapshotNote}
                            </div>

                            <div className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--border)] py-[18px]">
                                <label htmlFor="share-live-toggle" className="cursor-pointer text-[0.9375rem] font-medium text-body">
                                    {copy.liveToggle}
                                </label>
                                <Switch id="share-live-toggle" checked={liveEnabled} onChange={setLiveEnabled} />
                            </div>

                            <div className="mb-5">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <label htmlFor="share-password-toggle" className="text-sm font-medium text-body cursor-pointer">
                                            {copy.passwordToggle}
                                        </label>
                                    </div>
                                    <Switch
                                        id="share-password-toggle"
                                        checked={passwordEnabled}
                                        onChange={next => { setPasswordEnabled(next); setError(null); }}
                                    />
                                </div>

                                {passwordEnabled && (
                                    <div className="mt-3">
                                        <label htmlFor="share-password" className="block mb-1.5 text-xs font-medium text-muted">
                                            {copy.passwordLabel}
                                        </label>
                                        <div className="relative">
                                            <input
                                                id="share-password"
                                                type={showPassword ? 'text' : 'password'}
                                                value={password}
                                                onChange={(event) => setPassword(event.target.value)}
                                                className="input-base pr-11"
                                                placeholder={copy.passwordPlaceholder}
                                                minLength={8}
                                                maxLength={128}
                                                autoComplete="new-password"
                                                required
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(value => !value)}
                                                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-body"
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mb-5">
                                <button
                                    type="button"
                                    onClick={() => setIsExpiryPickerOpen(value => !value)}
                                    aria-expanded={isExpiryPickerOpen}
                                    className="flex w-full items-center justify-between border-b border-[var(--border)] py-[18px] text-start"
                                >
                                    <span className="text-[0.9375rem] text-body">{copy.expiryLabel}</span>
                                    <span className="flex items-center gap-1.5 text-muted">
                                        <span className="text-sm tabular-nums">
                                            {expiresAtInput ? formatStamp(new Date(expiresAtInput).getTime(), lang) : '—'}
                                        </span>
                                        <ChevronDown size={14} className={`chev ${isExpiryPickerOpen ? 'rotate-180' : ''}`} />
                                    </span>
                                </button>
                                <DateTimePicker
                                    isOpen={isExpiryPickerOpen}
                                    inline
                                    onClose={() => setIsExpiryPickerOpen(false)}
                                    onConfirm={(date) => setExpiresAtInput(toLocalDateTimeValue(date.getTime()))}
                                    initialDate={expiresAtInput ? new Date(expiresAtInput) : new Date(Date.now() + 7 * 24 * 60 * 60_000)}
                                    mode="datetime"
                                    title={copy.expiryLabel}
                                />
                                <p className="mt-1.5 text-xs text-muted">{copy.expiryHint}</p>
                            </div>

                            {error && (
                                <p className="mb-4 text-sm text-[var(--danger)]" role="alert">{error}</p>
                            )}

                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                <button type="button" onClick={onBack} className="btn-secondary">
                                    {t('btn.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || !events.length || (passwordEnabled && password.length < 8)}
                                    className="btn-primary min-w-[8.5rem]"
                                >
                                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                                    {submitting ? copy.creating : copy.create}
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="pb-6 pt-5">
                        <h3 className="text-[0.9375rem] font-medium text-body">{copy.manageTitle}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted">{copy.manageDescription}</p>
                        {sharesLoading ? (
                            <div className="flex items-center gap-2 py-4 text-sm text-muted">
                                <Loader2 size={14} className="animate-spin" /> {copy.loading}
                            </div>
                        ) : shares.length === 0 ? (
                            <p className="py-4 text-sm text-muted">{copy.noneActive}</p>
                        ) : (
                            <div className="mt-3 border-t border-[var(--border)]">
                                {shares.map(share => (
                                    <div key={share.id} className="flex items-center gap-3 border-b border-[var(--border)] py-3.5 last:border-b-0">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                                <p className="text-sm font-medium text-body">
                                                    {copy.sharedOn} {formatStamp(share.createdAt, lang)}
                                                </p>
                                                {share.live && (
                                                    <span className={liveBadgeClass}>{copy.liveBadge}</span>
                                                )}
                                                {share.passwordRequired && (
                                                    <span className={metaBadgeClass}>
                                                        <LockKeyhole size={12} />
                                                        {copy.protected}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 truncate text-xs text-muted">
                                                {copy.expiresOn} {share.expiresAt ? formatStamp(share.expiresAt, lang) : copy.neverExpires}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRevoke(share)}
                                            disabled={revokingId === share.id}
                                            className="-mr-2 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--surface-hover)] disabled:opacity-50 "
                                        >
                                            {revokingId === share.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                            {copy.revoke}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
            </div>
        </div>
    );
};

export default ShareSettings;
