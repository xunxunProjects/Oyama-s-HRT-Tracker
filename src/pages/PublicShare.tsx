import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Clock3, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import { DoseEvent, Ester, ExtraKey, getToE2Factor, isTestosteroneEster, Route } from '../../logic';
import ResultChart from '../components/ResultChart';
import { useTranslation } from '../contexts/LanguageContext';
import { getShareCopy } from '../i18n/share';
import { LOCALE_MAP } from '../utils/helpers';
import { LockedShare, ShareApiError, ShareDetails, sharingService } from '../services/sharing';

interface PublicShareProps {
    token: string | null;
}

type ShareState =
    | { kind: 'loading' }
    | { kind: 'locked'; meta: LockedShare }
    | { kind: 'ready'; details: ShareDetails }
    | { kind: 'expired' }
    | { kind: 'unavailable' };

const formatWearDays = (days: number): string =>
    (Math.round(days * 100) / 100).toString();

const PublicShare: React.FC<PublicShareProps> = ({ token }) => {
    const { lang, t } = useTranslation();
    const copy = getShareCopy(lang);
    const [state, setState] = useState<ShareState>({ kind: 'loading' });
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const unlockedPasswordRef = useRef('');

    const classifyError = (error: unknown): ShareState => {
        if (error instanceof ShareApiError && (error.status === 410 || error.code === 'SHARE_EXPIRED')) {
            return { kind: 'expired' };
        }
        return { kind: 'unavailable' };
    };

    useEffect(() => {
        document.title = `${copy.publicTitle} · HRT Tracker`;
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
            return () => { cancelled = true; };
        }

        setState({ kind: 'loading' });
        sharingService.open(token)
            .then(result => {
                if (cancelled) return;
                if ('snapshot' in result) setState({ kind: 'ready', details: result });
                else setState({ kind: 'locked', meta: result });
            })
            .catch(error => {
                if (!cancelled) setState(classifyError(error));
            });
        return () => { cancelled = true; };
        // classifyError contains no reactive state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const handleUnlock = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!token || unlocking) return;
        setUnlocking(true);
        setPasswordError(null);
        try {
            const details = await sharingService.unlock(token, password);
            unlockedPasswordRef.current = password;
            setState({ kind: 'ready', details });
            setPassword('');
        } catch (error) {
            if (error instanceof ShareApiError && error.code === 'INVALID_PASSWORD') {
                setPasswordError(copy.wrongPassword);
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
                const result = unlockedPasswordRef.current
                    ? await sharingService.unlock(token, unlockedPasswordRef.current)
                    : await sharingService.open(token);
                if (!cancelled && 'snapshot' in result) {
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
    }, [token, liveReady]);

    if (state.kind === 'loading') {
        return (
            <PublicShell>
                <div className="flex min-h-[65vh] flex-col items-center justify-center px-6 text-center" aria-live="polite">
                    <Loader2 size={24} strokeWidth={1.5} className="mb-4 animate-spin text-[var(--color-m3-primary)]" aria-hidden="true" />
                    <p className="text-sm text-muted">{copy.loading}</p>
                </div>
            </PublicShell>
        );
    }

    if (state.kind === 'locked') {
        return (
            <PublicShell>
                <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-16">
                    <div className="w-full rounded-xl border border-[var(--color-m3-outline-variant)] bg-[var(--color-m3-surface-bright)] p-6 shadow-[var(--shadow-m3-1)]">
                        <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-m3-primary-container)] text-[var(--color-m3-on-primary-container)]">
                            <LockKeyhole size={18} strokeWidth={1.75} />
                        </div>
                        <h1 className="text-xl font-semibold text-body">{copy.unlockTitle}</h1>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{copy.unlockDescription}</p>
                        <form onSubmit={handleUnlock} className="mt-6">
                            <label htmlFor="shared-record-password" className="mb-1.5 block text-xs font-medium text-muted">
                                {copy.passwordLabel}
                            </label>
                            <div className="relative">
                                <input
                                    id="shared-record-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(event) => {
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
                                    aria-describedby={passwordError ? 'share-password-error' : undefined}
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
                            {passwordError && (
                                <p id="share-password-error" className="mt-2 text-sm text-red-600" role="alert">{passwordError}</p>
                            )}
                            <button type="submit" className="btn-primary mt-4 w-full" disabled={unlocking || password.length < 8}>
                                {unlocking ? copy.unlocking : copy.unlock}
                            </button>
                        </form>
                    </div>
                </main>
            </PublicShell>
        );
    }

    if (state.kind === 'expired' || state.kind === 'unavailable') {
        const expired = state.kind === 'expired';
        return (
            <PublicShell>
                <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-16 text-center">
                    <div className="w-full">
                        <AlertCircle size={28} strokeWidth={1.5} className="mx-auto mb-4 text-muted" />
                        <h1 className="text-xl font-semibold text-body">
                            {expired ? copy.expiredTitle : copy.unavailableTitle}
                        </h1>
                        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                            {expired ? copy.expiredDescription : copy.unavailableDescription}
                        </p>
                    </div>
                </main>
            </PublicShell>
        );
    }

    return <SharedRecord details={state.details} />;
};

const PublicShell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-[100dvh] bg-[var(--color-m3-surface)] text-[var(--color-m3-on-surface)] selection:bg-[var(--color-m3-primary-container)]">
        {children}
    </div>
);

const SharedRecord = ({ details }: { details: ShareDetails }) => {
    const { lang, t } = useTranslation();
    const copy = getShareCopy(lang);
    const { snapshot } = details;
    const locale = LOCALE_MAP[lang] || 'en-US';
    const timeZone = snapshot.timezone || 'UTC';

    const formatDateTime = (timestamp: number) => new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone,
    }).format(new Date(timestamp));

    const groups = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone,
        });
        const grouped: { label: string; events: DoseEvent[] }[] = [];
        for (const event of [...snapshot.events].sort((a, b) => b.timeH - a.timeH)) {
            const label = formatter.format(new Date(event.timeH * 3_600_000));
            const current = grouped[grouped.length - 1];
            if (current?.label === label) current.events.push(event);
            else grouped.push({ label, events: [event] });
        }
        return grouped;
    }, [snapshot.events, locale, timeZone]);

    const timeFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone,
    }), [locale, timeZone]);

    return (
        <PublicShell>
            <main className="mx-auto max-w-5xl px-6 pb-20 pt-10 md:px-8 md:pt-14">
                <section className="border-b border-[var(--color-m3-outline-variant)] pb-8">
                    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                        <div>
                            <h1 className="text-3xl font-medium tracking-tight text-body md:text-4xl">{copy.publicTitle}</h1>
                            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{copy.disclaimer}</p>
                        </div>
                        {details.passwordRequired && (
                            <div className="flex shrink-0 flex-wrap gap-2 text-xs text-muted">
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-m3-outline-variant)] px-2.5 py-1.5">
                                    <LockKeyhole size={12} /> {copy.protected}
                                </span>
                            </div>
                        )}
                    </div>
                    <dl className="mt-6 flex flex-wrap gap-x-7 gap-y-2 text-xs text-muted">
                        <div className="flex items-center gap-1.5">
                            <Clock3 size={13} />
                            <dt>{copy.sharedOn}</dt>
                            <dd className="text-body">{formatDateTime(details.createdAt)}</dd>
                        </div>
                        {details.live && (
                            <div className="flex items-center gap-1.5 text-[var(--color-m3-primary)]">
                                <dt>{copy.liveBadge}</dt>
                                <dd>{copy.updatedOn} {formatDateTime(details.updatedAt)}</dd>
                            </div>
                        )}
                    </dl>
                </section>

                <section className="pb-5 pt-8" aria-labelledby="shared-chart-title">
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <h2 id="shared-chart-title" className="text-lg font-semibold text-body">{copy.chartTitle}</h2>
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

                <section aria-labelledby="shared-history-title">
                    <div className="mb-6 flex items-end justify-between gap-4">
                        <h2 id="shared-history-title" className="text-lg font-semibold text-body">{copy.historyTitle}</h2>
                        <span className="text-xs tabular-nums text-muted">{snapshot.events.length} {copy.records}</span>
                    </div>

                    {groups.length === 0 ? (
                        <p className="py-12 text-center text-sm text-muted">{t('timeline.empty')}</p>
                    ) : (
                        <div className="grid gap-x-12 lg:grid-cols-2">
                            {groups.map(group => (
                                <div key={group.label} className="mb-7 break-inside-avoid">
                                    <h3 className="mb-1 border-b border-[var(--color-m3-outline-variant)] pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                                        {group.label}
                                    </h3>
                                    {group.events.map(event => (
                                        <DoseHistoryRow
                                            key={event.id}
                                            event={event}
                                            time={timeFormatter.format(new Date(event.timeH * 3_600_000))}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

            </main>
        </PublicShell>
    );
};

const DoseHistoryRow = ({ event, time }: { event: DoseEvent; time: string }) => {
    const { t } = useTranslation();
    const isRemoval = event.route === Route.patchRemove;
    const releaseRate = event.extras[ExtraKey.releaseRateUGPerDay];
    const wearHours = event.extras[ExtraKey.patchWearH];

    return (
        <div className="flex items-start gap-3 border-b border-[var(--color-m3-outline-variant)] py-3.5 last:border-b-0">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-m3-primary)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-medium text-body">
                        {isRemoval ? t('route.patchRemove') : t(`ester.${event.ester}`)}
                    </p>
                    <time className="shrink-0 text-xs tabular-nums text-muted">{time}</time>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                    <span>{t(`route.${event.route}`)}</span>
                    {releaseRate ? (
                        <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-body">{releaseRate} µg/d</span>
                        </>
                    ) : !isRemoval && (
                        <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-body">{event.doseMG.toFixed(2)} mg</span>
                            {event.ester !== Ester.E2 && event.ester !== Ester.CPA && !isTestosteroneEster(event.ester) && (
                                <span>({t('label.e2')} eq: {(event.doseMG * getToE2Factor(event.ester)).toFixed(2)} mg)</span>
                            )}
                            {isTestosteroneEster(event.ester) && event.ester !== Ester.T && (
                                <span>({t('label.t')} eq: {(event.doseMG * getToE2Factor(event.ester)).toFixed(2)} mg)</span>
                            )}
                        </>
                    )}
                    {event.route === Route.patchApply && typeof wearHours === 'number' && wearHours > 0 && (
                        <>
                            <span aria-hidden="true">·</span>
                            <span>{formatWearDays(wearHours / 24)} {t('unit.day_short')}</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PublicShare;
