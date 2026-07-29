import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Copy, Eye, EyeOff, Link2, Loader2, LockKeyhole, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DoseEvent, HRTMode, SimulationResult } from '../../logic';
import { useTranslation } from '../contexts/LanguageContext';
import { getShareCopy } from '../i18n/share';
import { CreatedShare, ShareApiError, ShareSummary, sharingService } from '../services/sharing';
import { useDialog } from '../contexts/DialogContext';
import { LOCALE_MAP } from '../utils/helpers';
import DateTimePicker from '../components/DateTimePicker';

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

const MAX_SHARED_SIMULATION_POINTS = 2500;

const evenlySampleRange = (start: number, end: number, count: number): number[] => {
    if (count <= 0 || end < start) return [];
    const length = end - start + 1;
    if (length <= count) return Array.from({ length }, (_, index) => start + index);
    if (count === 1) return [end];
    return Array.from({ length: count }, (_, index) =>
        start + Math.round(index * (length - 1) / (count - 1))
    );
};

const nearestTimeIndex = (times: number[], target: number): number => {
    let low = 0;
    let high = times.length - 1;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (times[middle] < target) low = middle + 1;
        else high = middle;
    }
    if (low > 0 && Math.abs(times[low - 1] - target) < Math.abs(times[low] - target)) return low - 1;
    return low;
};

const sampleIndexes = (times: number[], events: DoseEvent[]): number[] => {
    if (times.length <= MAX_SHARED_SIMULATION_POINTS) return Array.from({ length: times.length }, (_, index) => index);

    const required = new Set<number>([0, times.length - 1]);
    // Keep a bounded set of the most recent dose-adjacent curve samples. These
    // are the points most likely to carry a short oral/sublingual peak.
    for (const event of [...events].sort((a, b) => b.timeH - a.timeH).slice(0, 250)) {
        required.add(nearestTimeIndex(times, event.timeH));
    }

    const recentCutoffH = Date.now() / 3_600_000 - 30 * 24;
    let recentStart = times.findIndex(time => time >= recentCutoffH);
    if (recentStart < 0) recentStart = times.length - 1;

    const remaining = Math.max(0, MAX_SHARED_SIMULATION_POINTS - required.size);
    const olderLength = recentStart;
    const recentLength = times.length - recentStart;
    const olderBudget = olderLength > 0 ? Math.min(450, Math.floor(remaining * 0.2), olderLength) : 0;
    const recentBudget = Math.min(recentLength, remaining - olderBudget);
    const spare = remaining - olderBudget - recentBudget;

    evenlySampleRange(0, recentStart - 1, olderBudget + spare).forEach(index => required.add(index));
    evenlySampleRange(recentStart, times.length - 1, recentBudget).forEach(index => required.add(index));
    return [...required].sort((a, b) => a - b).slice(0, MAX_SHARED_SIMULATION_POINTS);
};

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

    const sharedSimulation = useMemo<SimulationResult | null>(() => {
        if (!simulation) return null;
        const indexes = sampleIndexes(simulation.timeH, events);
        // Preserve the exact calibrated E2 curve the sender sees without
        // including the lab values used to calibrate it. The chart is sampled
        // to a display-sized series so long histories stay comfortably below
        // the share request/storage limit.
        const calibratedE2 = indexes.map((sourceIndex) =>
            simulation.concPGmL_E2[sourceIndex] * calibrationFn(simulation.timeH[sourceIndex])
        );
        return {
            timeH: indexes.map(index => simulation.timeH[index]),
            concPGmL_CPA: indexes.map(index => simulation.concPGmL_CPA[index]),
            concNGdL_T: indexes.map(index => simulation.concNGdL_T[index]),
            concPGmL_E2: calibratedE2,
            concPGmL: calibratedE2,
            auc: simulation.auc,
        };
    }, [simulation, calibrationFn, events]);

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
            const result = await sharingService.create(authToken, {
                version: 1,
                mode,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                createdAt: Date.now(),
                // Share-specific IDs prevent the same local record identifier
                // from being correlated across different links or exports.
                events: events.map(event => ({ ...event, id: uuidv4(), extras: { ...event.extras } })),
                simulation: sharedSimulation,
            }, {
                password: passwordEnabled ? password : undefined,
                expiresAt,
            });
            setCreatedShare(result);
            setShares(previous => [{
                id: result.id,
                createdAt: result.createdAt,
                expiresAt: result.expiresAt,
                passwordRequired: result.passwordRequired,
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
            } catch {
                showDialog('alert', copy.revokeError);
            } finally {
                setRevokingId(null);
            }
        });
    };

    return (
        <div className="relative space-y-4 pb-32">
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] px-6 pb-3 pt-8 dark:bg-[var(--color-m3-dark-surface)] md:px-8">
                <button
                    type="button"
                    onClick={onBack}
                    className="-ml-2 flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                >
                    <ArrowLeft size={18} className="shrink-0 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]" />
                    <span className="text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        {copy.modalTitle}
                    </span>
                </button>
            </div>

            <div className="max-w-2xl px-6 md:px-8">
                <p className="pb-5 text-sm leading-relaxed text-muted">{copy.modalDescription}</p>
                    {createdShare ? (
                        <div className="pb-0 pt-5">
                            <div className="flex items-center gap-2 mb-4 text-body">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-m3-primary-container)] text-[var(--color-m3-on-primary-container)]">
                                    <Check size={14} strokeWidth={2.25} />
                                </span>
                                <p className="text-sm font-medium">{copy.created}</p>
                            </div>

                            <label className="sr-only" htmlFor="created-share-link">
                                {copy.copy}
                            </label>
                            <div className="flex overflow-hidden rounded-lg border border-[var(--color-m3-outline-variant)] bg-[var(--color-m3-surface-container-lowest)] dark:border-[var(--color-m3-dark-outline-variant)] dark:bg-[var(--color-m3-dark-surface-container-low)]">
                                <input
                                    ref={linkInputRef}
                                    id="created-share-link"
                                    readOnly
                                    value={createdShare.url}
                                    className="min-w-0 flex-1 select-all border-0 bg-transparent px-3 py-2.5 font-mono text-sm text-body outline-none"
                                    onFocus={(event) => event.currentTarget.select()}
                                />
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="inline-flex shrink-0 items-center gap-1.5 border-l border-[var(--color-m3-outline-variant)] px-3.5 text-sm font-medium text-[var(--color-m3-primary)] hover:bg-[var(--color-m3-surface-container)] dark:border-[var(--color-m3-dark-outline-variant)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? copy.copied : copy.copy}
                                </button>
                            </div>

                            {createdShare.passwordRequired && (
                                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                                    <LockKeyhole size={13} />
                                    {copy.passwordHint}
                                </p>
                            )}
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="border-b border-[var(--color-m3-outline-variant)] pb-6 dark:border-[var(--color-m3-dark-outline-variant)]">
                            <div className="callout mb-5">
                                {copy.snapshotNote}
                            </div>

                            <div className="mb-5">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <label htmlFor="share-password-toggle" className="text-sm font-medium text-body cursor-pointer">
                                            {copy.passwordToggle}
                                        </label>
                                    </div>
                                    <button
                                        id="share-password-toggle"
                                        type="button"
                                        role="switch"
                                        aria-checked={passwordEnabled}
                                        onClick={() => {
                                            setPasswordEnabled(value => !value);
                                            setError(null);
                                        }}
                                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${passwordEnabled ? 'bg-[var(--color-m3-primary)]' : 'bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm ${passwordEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
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
                                    className="flex w-full items-center justify-between border-b border-[var(--color-m3-outline-variant)] py-[18px] text-start dark:border-[var(--color-m3-dark-outline-variant)]"
                                >
                                    <span className="text-[15px] text-body">{copy.expiryLabel}</span>
                                    <span className="flex items-center gap-1.5 text-muted">
                                        <span className="text-sm tabular-nums">
                                            {expiresAtInput
                                                ? new Date(expiresAtInput).toLocaleString(LOCALE_MAP[lang] || 'en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })
                                                : '—'}
                                        </span>
                                        <ChevronDown size={14} className={isExpiryPickerOpen ? 'rotate-180' : ''} />
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
                                <p className="mb-4 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
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
                        <h3 className="text-sm font-medium text-body">{copy.manageTitle}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted">{copy.manageDescription}</p>
                        {sharesLoading ? (
                            <div className="flex items-center gap-2 py-4 text-xs text-muted">
                                <Loader2 size={13} className="animate-spin" /> {copy.loading}
                            </div>
                        ) : shares.length === 0 ? (
                            <p className="py-4 text-xs text-muted">{copy.noneActive}</p>
                        ) : (
                            <div className="mt-3 max-h-40 overflow-y-auto border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                                {shares.map(share => (
                                    <div key={share.id} className="flex items-center gap-3 border-b border-[var(--color-m3-outline-variant)] py-3 last:border-b-0 dark:border-[var(--color-m3-dark-outline-variant)]">
                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-center gap-1.5 text-xs font-medium text-body">
                                                {copy.sharedOn} {new Date(share.createdAt).toLocaleString(LOCALE_MAP[lang])}
                                                {share.passwordRequired && <LockKeyhole size={11} className="shrink-0 text-muted" />}
                                            </p>
                                            <p className="mt-0.5 truncate text-[11px] text-muted">
                                                {copy.expiresOn} {share.expiresAt ? new Date(share.expiresAt).toLocaleString(LOCALE_MAP[lang]) : copy.neverExpires}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRevoke(share)}
                                            disabled={revokingId === share.id}
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/20"
                                        >
                                            {revokingId === share.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
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
