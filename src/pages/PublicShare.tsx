import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Clock, Eye, EyeOff, Busy, LockKeyhole } from '../components/icons';
import { DoseEvent, Ester, ExtraKey, getToE2Factor, isEstradiolEster, isTestosteroneEster, Route } from '../../logic';
import Doodle from '../components/Doodle';
import ResultChart from '../components/ResultChart';
import { useTranslation } from '../contexts/LanguageContext';
import { getShareCopy } from '../i18n/share';
import { LOCALE_MAP } from '../utils/helpers';
import { drugLabel } from '../utils/regimenText';
import { LockedShare, SHARE_KEY_INVALID, ShareApiError, ShareDetails, sharingService } from '../services/sharing';

interface PublicShareProps {
    token: string | null;
    /** The decryption key from the link's fragment. Never sent anywhere. */
    shareKey: string | null;
}

type ShareState =
    | { kind: 'loading' }
    | { kind: 'locked'; meta: LockedShare }
    | { kind: 'ready'; details: ShareDetails }
    | { kind: 'expired' }
    | { kind: 'unavailable' }
    | { kind: 'badKey' }
    | { kind: 'rateLimited'; retryAt: number };

const formatWearDays = (days: number): string => (Math.round(days * 100) / 100).toString();

const PublicShare: React.FC<PublicShareProps> = ({ token, shareKey }) => {
    const { lang, t } = useTranslation();
    const copy = getShareCopy(lang);
    const [state, setState] = useState<ShareState>({ kind: 'loading' });
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [retryNonce, setRetryNonce] = useState(0);
    // When a wrong-password lock on this link ends; until then the form stays
    // up with the reason under it instead of bouncing to another screen.
    const [unlockBlockedUntil, setUnlockBlockedUntil] = useState(0);
    const unlockedPasswordRef = useRef('');
    const viewerPassRef = useRef('');

    const formatTime = (ms: number) =>
        new Intl.DateTimeFormat(LOCALE_MAP[lang] || 'en-US', { hour: 'numeric', minute: '2-digit' }).format(ms);

    const classifyError = (error: unknown): ShareState => {
        if (error instanceof ShareApiError && (error.status === 410 || error.code === 'SHARE_EXPIRED')) {
            return { kind: 'expired' };
        }
        if (error instanceof ShareApiError && error.code === SHARE_KEY_INVALID) return { kind: 'badKey' };
        // A 429 is a budget problem, not a missing record. Showing the
        // unavailable text here made rate limiting look like a dead link.
        if (error instanceof ShareApiError && (error.status === 429 || error.code === 'RATE_LIMITED')) {
            return { kind: 'rateLimited', retryAt: Date.now() + (error.retryAfterMs ?? 60_000) };
        }
        return { kind: 'unavailable' };
    };

    useEffect(() => {
        document.title = `${copy.publicTitle} – HRT Tracker`;
        let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
        const created = !robots;
        if (!robots) {
            robots = document.createElement('meta');
            robots.name = 'robots';
            document.head.appendChild(robots);
        }
        const previous = robots.content;
        robots.content = 'noindex, nofollow, noarchive';
        return () => {
            if (created) robots?.remove();
            else if (robots) robots.content = previous;
        };
    }, [copy.publicTitle]);

    useEffect(() => {
        let cancelled = false;
        unlockedPasswordRef.current = '';
        setPassword('');
        setPasswordError(null);

        if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
            setState({ kind: 'unavailable' });
            return () => {
                cancelled = true;
            };
        }

        setState({ kind: 'loading' });
        sharingService
            .open(token, shareKey)
            .then(result => {
                if (cancelled) return;
                if ('snapshot' in result) setState({ kind: 'ready', details: result });
                else setState({ kind: 'locked', meta: result });
            })
            .catch(error => {
                if (!cancelled) setState(classifyError(error));
            });
        return () => {
            cancelled = true;
        };
        // classifyError contains no reactive state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, shareKey, retryNonce]);

    // After a 429, wait out the server's Retry-After (or a minute if it did
    // not say) and try the link again on our own, so a hit limit reads as a
    // pause instead of a broken link.
    useEffect(() => {
        if (state.kind !== 'rateLimited') return;
        const timer = window.setTimeout(
            () => setRetryNonce(nonce => nonce + 1),
            Math.min(Math.max(state.retryAt - Date.now(), 0), 5 * 60_000),
        );
        return () => window.clearTimeout(timer);
    }, [state]);

    useEffect(() => {
        if (!unlockBlockedUntil) return;
        const timer = window.setTimeout(() => setUnlockBlockedUntil(0), Math.max(unlockBlockedUntil - Date.now(), 0));
        return () => window.clearTimeout(timer);
    }, [unlockBlockedUntil]);

    const handleUnlock = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!token || unlocking) return;
        setUnlocking(true);
        setPasswordError(null);
        try {
            const details = await sharingService.unlock(token, shareKey, password);
            unlockedPasswordRef.current = password;
            viewerPassRef.current = details.viewerPass ?? '';
            setState({ kind: 'ready', details });
            setPassword('');
        } catch (error) {
            if (error instanceof ShareApiError && error.code === 'INVALID_PASSWORD') {
                setPasswordError(copy.wrongPassword);
            } else if (error instanceof ShareApiError && error.status === 429) {
                setUnlockBlockedUntil(Date.now() + (error.retryAfterMs ?? 60_000));
            } else {
                setState(classifyError(error));
            }
        } finally {
            setUnlocking(false);
        }
    };

    const liveReady = state.kind === 'ready' && state.details.live;
    useEffect(() => {
        if (!token || !liveReady) return;

        let cancelled = false;
        let refreshing = false;
        let retryAfter = 0;
        const refresh = async () => {
            if (cancelled || refreshing || document.hidden || Date.now() < retryAfter) return;
            refreshing = true;
            try {
                // The viewer pass lets this read skip the password check, so a
                // lock someone else tripped on this link does not stop it.
                const result = unlockedPasswordRef.current
                    ? await sharingService.unlock(
                          token,
                          shareKey,
                          unlockedPasswordRef.current,
                          viewerPassRef.current || undefined,
                      )
                    : await sharingService.open(token, shareKey);
                if (!cancelled && 'snapshot' in result) {
                    if (result.viewerPass) viewerPassRef.current = result.viewerPass;
                    setState({ kind: 'ready', details: result });
                }
            } catch (error) {
                if (cancelled) return;
                if (error instanceof ShareApiError && (error.status === 410 || error.code === 'SHARE_EXPIRED')) {
                    setState({ kind: 'expired' });
                } else if (error instanceof ShareApiError && error.status === 404) {
                    setState({ kind: 'unavailable' });
                } else if (error instanceof ShareApiError && error.status === 429) {
                    retryAfter = Date.now() + (error.retryAfterMs ?? 60_000);
                }
                // Keep showing the most recently loaded data for transient
                // network failures and rate limits.
            } finally {
                refreshing = false;
            }
        };

        const onVisibilityChange = () => {
            if (!document.hidden) void refresh();
        };
        void refresh();
        const timer = window.setInterval(() => void refresh(), 10_000);
        window.addEventListener('focus', refresh);
        window.addEventListener('online', refresh);
        window.addEventListener('pageshow', refresh);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('online', refresh);
            window.removeEventListener('pageshow', refresh);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [token, shareKey, liveReady]);

    if (state.kind === 'loading') {
        return (
            <PublicShell>
                <div
                    className="flex min-h-[65vh] flex-col items-center justify-center px-6 text-center"
                    aria-live="polite"
                >
                    <Busy
                        size={24}
                        strokeWidth={1.5}
                        className="mb-4 animate-spin text-[var(--accent-ink)]"
                        aria-hidden="true"
                    />
                    <p className="text-sm text-muted">{copy.loading}</p>
                </div>
            </PublicShell>
        );
    }

    if (state.kind === 'locked') {
        const unlockMessage = unlockBlockedUntil
            ? copy.passwordLocked.replace('{time}', formatTime(unlockBlockedUntil))
            : passwordError;
        return (
            <PublicShell>
                <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-16">
                    <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-xs)]">
                        <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-subtle)] text-[var(--on-accent-subtle)]">
                            <LockKeyhole size={18} strokeWidth={1.75} />
                        </div>
                        <h1 className="text-xl font-semibold text-body">{copy.unlockTitle}</h1>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{copy.unlockDescription}</p>
                        <form onSubmit={handleUnlock} className="mt-6">
                            <label
                                htmlFor="shared-record-password"
                                className="mb-1.5 block text-xs font-medium text-muted"
                            >
                                {copy.passwordLabel}
                            </label>
                            <div className="relative">
                                <input
                                    id="shared-record-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={event => {
                                        setPassword(event.target.value);
                                        setPasswordError(null);
                                    }}
                                    className="input-base pr-11"
                                    autoComplete="current-password"
                                    minLength={8}
                                    maxLength={128}
                                    required
                                    autoFocus
                                    aria-invalid={!!passwordError}
                                    aria-describedby={unlockMessage ? 'share-password-error' : undefined}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(value => !value)}
                                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)]"
                                    aria-label={showPassword ? t('auth.hide_password') : t('auth.show_password')}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            {unlockMessage && (
                                <p id="share-password-error" className="mt-2 text-sm text-[var(--danger)]" role="alert">
                                    {unlockMessage}
                                </p>
                            )}
                            <button
                                type="submit"
                                className="btn-primary mt-4 w-full"
                                disabled={unlocking || password.length < 8 || unlockBlockedUntil > 0}
                            >
                                {unlocking ? copy.unlocking : copy.unlock}
                            </button>
                        </form>
                    </div>
                </main>
            </PublicShell>
        );
    }

    if (state.kind === 'rateLimited') {
        return (
            <PublicShell>
                <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-16 text-center">
                    <div className="w-full">
                        <Clock size={28} strokeWidth={1.5} className="mx-auto mb-4 text-muted" />
                        <h1 className="text-xl font-semibold text-body">{copy.rateLimitedTitle}</h1>
                        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                            {copy.rateLimitedDescription}
                        </p>
                        <p className="mt-2 text-sm text-muted" aria-live="polite">
                            {copy.rateLimitedRetry.replace('{time}', formatTime(state.retryAt))}
                        </p>
                    </div>
                </main>
            </PublicShell>
        );
    }

    if (state.kind === 'expired' || state.kind === 'unavailable' || state.kind === 'badKey') {
        const expired = state.kind === 'expired';
        return (
            <PublicShell>
                <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-16 text-center">
                    <div className="w-full">
                        <Alert size={28} strokeWidth={1.5} className="mx-auto mb-4 text-muted" />
                        <h1 className="text-xl font-semibold text-body">
                            {expired ? copy.expiredTitle : copy.unavailableTitle}
                        </h1>
                        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                            {expired
                                ? copy.expiredDescription
                                : state.kind === 'badKey'
                                  ? copy.keyInvalidDescription
                                  : copy.unavailableDescription}
                        </p>
                    </div>
                </main>
            </PublicShell>
        );
    }

    return <SharedRecord details={state.details} />;
};

const PublicShell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text)] selection:bg-[var(--accent-subtle)]">
        {children}
    </div>
);

const SharedRecord = ({ details }: { details: ShareDetails }) => {
    const { lang, t } = useTranslation();
    const copy = getShareCopy(lang);
    const { snapshot } = details;
    const locale = LOCALE_MAP[lang] || 'en-US';
    const timeZone = snapshot.timezone || 'UTC';

    const formatDateTime = (timestamp: number) =>
        new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone,
        }).format(new Date(timestamp));

    // Grouped as the History tab groups: one section per day in the record's
    // own time zone, keyed apart from its label, with the same short month.
    const groups = useMemo(() => {
        const label = new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone,
        });
        const dayKey = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone,
        });
        const grouped: { key: string; label: string; events: DoseEvent[] }[] = [];
        for (const event of [...snapshot.events].sort((a, b) => b.timeH - a.timeH)) {
            const at = new Date(event.timeH * 3_600_000);
            const key = dayKey.format(at);
            const current = grouped[grouped.length - 1];
            if (current?.key === key) current.events.push(event);
            else grouped.push({ key, label: label.format(at), events: [event] });
        }
        return grouped;
    }, [snapshot.events, locale, timeZone]);

    // How long each removed patch was worn, as the History tab says it.
    const wornBeforeRemoval = useMemo(() => {
        const wornH = new Map<DoseEvent, number>();
        const onSkin: DoseEvent[] = [];
        for (const event of [...snapshot.events].sort((a, b) => a.timeH - b.timeH)) {
            if (event.route === Route.patchApply) onSkin.push(event);
            else if (event.route === Route.patchRemove) {
                const applied = onSkin.shift();
                if (applied && event.timeH > applied.timeH) wornH.set(event, event.timeH - applied.timeH);
            }
        }
        return wornH;
    }, [snapshot.events]);

    const timeFormatter = useMemo(
        () =>
            new Intl.DateTimeFormat(locale, {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone,
            }),
        [locale, timeZone],
    );

    return (
        <PublicShell>
            <main className="mx-auto max-w-5xl px-6 pb-20 pt-10 md:px-8 md:pt-14">
                <section className="border-b border-[var(--border)] pb-8">
                    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                        <div>
                            <h1 className="text-3xl font-medium tracking-tight text-body md:text-4xl">
                                {copy.publicTitle}
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{copy.disclaimer}</p>
                        </div>
                        {details.passwordRequired && (
                            <div className="flex shrink-0 flex-wrap gap-2 text-xs text-muted">
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5">
                                    <LockKeyhole size={12} /> {copy.protected}
                                </span>
                            </div>
                        )}
                    </div>
                    <dl className="mt-6 flex flex-wrap gap-x-7 gap-y-2 text-xs tabular-nums text-muted">
                        <div className="flex items-center gap-1.5">
                            <Clock size={13} />
                            <dt>{copy.sharedOn}</dt>
                            <dd className="text-body">{formatDateTime(details.createdAt)}</dd>
                        </div>
                        {details.live && (
                            <div className="flex items-center gap-1.5 text-[var(--accent-ink)]">
                                <dt>{copy.liveBadge}</dt>
                                <dd>
                                    {copy.updatedOn} {formatDateTime(details.updatedAt)}
                                </dd>
                            </div>
                        )}
                    </dl>
                </section>

                <section className="pb-5 pt-8" aria-labelledby="shared-chart-title">
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <h2 id="shared-chart-title" className="text-lg font-semibold text-body">
                            {copy.chartTitle}
                        </h2>
                        <span className="text-xs text-muted">{timeZone}</span>
                    </div>
                    <ResultChart
                        sim={snapshot.simulation}
                        events={snapshot.events}
                        mode={snapshot.mode}
                        timeZone={timeZone}
                        title={t('chart.title')}
                    />
                </section>

                {/* One column, as the History tab has it: the old two columns
                    paired unrelated days side by side and left gaps under the
                    shorter one. On a wide screen the date moves into a gutter
                    of its own, so each day still reads as one line across. */}
                <section aria-labelledby="shared-history-title" className="max-w-3xl">
                    <div className="mb-4 flex items-end justify-between gap-4">
                        <h2 id="shared-history-title" className="text-lg font-semibold text-body">
                            {copy.historyTitle}
                        </h2>
                        <span className="text-xs tabular-nums text-muted">
                            {snapshot.events.length} {copy.records}
                        </span>
                    </div>

                    {groups.length === 0 ? (
                        <p className="py-12 text-center text-sm text-muted">{t('timeline.empty')}</p>
                    ) : (
                        <ol>
                            {groups.map(group => (
                                <li
                                    key={group.key}
                                    className="mb-6 last:mb-0 lg:mb-0 lg:grid lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-x-10 lg:border-t lg:border-[var(--border)]"
                                >
                                    <h3 className="pb-1 pt-2 text-xs font-semibold text-muted lg:pt-[1.1rem]">
                                        {group.label}
                                    </h3>
                                    <div>
                                        {group.events.map(event => (
                                            <DoseHistoryRow
                                                key={event.id}
                                                event={event}
                                                wornH={wornBeforeRemoval.get(event)}
                                                time={timeFormatter.format(new Date(event.timeH * 3_600_000))}
                                            />
                                        ))}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            </main>
        </PublicShell>
    );
};

/** A record as the History tab shows it, without the editing. */
const DoseHistoryRow = ({ event, time, wornH }: { event: DoseEvent; time: string; wornH?: number }) => {
    const { t } = useTranslation();
    const isRemoval = event.route === Route.patchRemove;
    const releaseRate = event.extras[ExtraKey.releaseRateUGPerDay];
    const wearHours = event.extras[ExtraKey.patchWearH];

    return (
        <div className="flex items-center gap-3 border-b border-[var(--border)] py-3.5 last:border-b-0">
            <Doodle name={event.route} size={1.75} />
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <p className="text-sm font-medium text-body [overflow-wrap:anywhere]">
                            {isRemoval ? t('route.patchRemove') : drugLabel(event.ester, t)}
                        </p>
                        {wornH !== undefined && (
                            <span className="shrink-0 text-xs text-muted">
                                {t('timeline.patch_worn').replace(
                                    '{d}',
                                    `${formatWearDays(wornH / 24)} ${t('unit.day_short')}`,
                                )}
                            </span>
                        )}
                    </div>
                    <time className="shrink-0 text-xs tabular-nums text-muted">{time}</time>
                </div>
                {/* A removal is the one line: its route is its name, and it
                    has no amount of its own. */}
                {!isRemoval && (
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-xs tabular-nums text-muted">
                        <span>{t(`route.${event.route}`)}</span>
                        {releaseRate ? (
                            <span className="text-body">{releaseRate} µg/d</span>
                        ) : (
                            <>
                                <span className="font-medium text-body">{event.doseMG.toFixed(2)} mg</span>
                                {event.ester !== Ester.E2 && isEstradiolEster(event.ester) && (
                                    <span className="opacity-70">
                                        ({t('label.e2')} eq: {(event.doseMG * getToE2Factor(event.ester)).toFixed(2)}{' '}
                                        mg)
                                    </span>
                                )}
                                {isTestosteroneEster(event.ester) && event.ester !== Ester.T && (
                                    <span className="opacity-70">
                                        ({t('label.t')} eq: {(event.doseMG * getToE2Factor(event.ester)).toFixed(2)} mg)
                                    </span>
                                )}
                            </>
                        )}
                        {event.route === Route.patchApply && typeof wearHours === 'number' && wearHours > 0 && (
                            <span className="text-body">
                                {formatWearDays(wearHours / 24)} {t('unit.day_short')}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PublicShare;
