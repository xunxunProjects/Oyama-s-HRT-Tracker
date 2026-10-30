import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { Check, Close, Info, Lock } from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { Lang } from '../i18n/translations';
import { apiEndpoint, apiErrorCode, apiErrorFrom, apiFetch } from '../services/apiClient';
import { countHrtDaysSince } from '../utils/communityVote';
import { fill } from '../utils/regimenText';
import {
    ADDITIONAL_CURRENCIES,
    ADDITIONAL_CURRENCY_MAJORITY,
    ALWAYS_SUPPORTED_CURRENCY,
    MIN_ACCOUNT_AGE_DAYS,
    MIN_HRT_DAYS,
    MIN_MAINTAINER_SHARE,
    PROPOSED_SPLIT_ID,
    resolveVoteOutcome,
    SPLIT_OPTIONS,
    type AdditionalCurrencyId,
    type SplitOptionId,
    type VoteMe,
    type VotePublic,
    type VoteSubmitResponse,
    type VoteTally,
} from '../../communityVote';

const REFRESH_INTERVAL_MS = 30_000;

const LOCALE: Record<Lang, string> = {
    zh: 'zh-CN',
    'zh-TW': 'zh-TW',
    yue: 'zh-HK',
    en: 'en',
    ja: 'ja',
    ko: 'ko',
    tr: 'tr',
};

const formatDateTime = (seconds: number, lang: Lang) =>
    new Date(seconds * 1000).toLocaleString(LOCALE[lang], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'UTC',
    });

const splitText = (option: (typeof SPLIT_OPTIONS)[number], t: (key: string) => string): string =>
    fill(t('vote.split.option'), {
        fantuan: option.fantuanmtf,
        smirnova: option.smirnovaoyama,
        project: option.project,
        project_label: t('vote.project'),
    });

const currencyLabel = (id: AdditionalCurrencyId | typeof ALWAYS_SUPPORTED_CURRENCY, t: (key: string) => string) => {
    if (id === 'monero') return t('vote.currency.monero');
    if (id === 'bitcoin') return t('vote.currency.bitcoin');
    if (id === 'ethereum') return t('vote.currency.ethereum');
    return t('vote.currency.bitcoin_cash');
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="border-t-(length:--hairline) border-[var(--border)] pt-7">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-[var(--text-muted)]">{children}</div>
    </section>
);

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`rounded-[var(--radius-lg)] border-(length:--hairline) border-[var(--border)] p-5 ${className}`}>
        {children}
    </div>
);

const Bar: React.FC<{ value: number; total: number }> = ({ value, total }) => (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div
            className="h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${total > 0 ? Math.round((value / total) * 100) : 0}%` }}
        />
    </div>
);

const TallySplit: React.FC<{ tally: VoteTally; t: (key: string) => string }> = ({ tally, t }) => (
    <div className="space-y-3">
        {SPLIT_OPTIONS.map(option => (
            <div key={option.id}>
                <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-[var(--text)]">{splitText(option, t)}</span>
                    <span className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
                        {tally.split[option.id]}
                    </span>
                </div>
                <Bar value={tally.split[option.id]} total={tally.ballots} />
            </div>
        ))}
    </div>
);

const TallyCurrencies: React.FC<{ tally: VoteTally; t: (key: string) => string }> = ({ tally, t }) => (
    <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-[var(--text)]">{currencyLabel(ALWAYS_SUPPORTED_CURRENCY, t)}</span>
            <span className="shrink-0 text-xs text-[var(--accent-ink)]">{t('vote.currency.always')}</span>
        </div>
        {ADDITIONAL_CURRENCIES.map(id => {
            const count = tally.currencies[id];
            const passed = tally.ballots > 0 && count / tally.ballots > ADDITIONAL_CURRENCY_MAJORITY;
            return (
                <div key={id}>
                    <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-[var(--text)]">{currencyLabel(id, t)}</span>
                        <span className="flex shrink-0 gap-3 text-xs tabular-nums text-[var(--text-muted)]">
                            {passed && <span className="text-[var(--accent-ink)]">{t('vote.tally.pass')}</span>}
                            {count > 0 && <span>{count}</span>}
                            <span>{tally.ballots > 0 ? `${Math.round((count / tally.ballots) * 100)}%` : '0%'}</span>
                        </span>
                    </div>
                    <Bar value={count} total={tally.ballots} />
                </div>
            );
        })}
    </div>
);

const TallyAccept: React.FC<{ tally: VoteTally; t: (key: string) => string }> = ({ tally, t }) => (
    <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-[var(--text)]">{t('vote.tally.yes')}</span>
            <span className="flex gap-3 tabular-nums text-[var(--text-muted)]">
                <span>{tally.accept.yes}</span>
                <span>{tally.ballots > 0 ? Math.round((tally.accept.yes / tally.ballots) * 100) : 0}%</span>
            </span>
        </div>
        <Bar value={tally.accept.yes} total={tally.ballots} />
        <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-[var(--text)]">{t('vote.tally.no')}</span>
            <span className="flex gap-3 tabular-nums text-[var(--text-muted)]">
                <span>{tally.accept.no}</span>
                <span>{tally.ballots > 0 ? Math.round((tally.accept.no / tally.ballots) * 100) : 0}%</span>
            </span>
        </div>
        <Bar value={tally.accept.no} total={tally.ballots} />
    </div>
);

interface CommunityVoteProps {
    onBack: () => void;
    onSignIn: () => void;
}

const CommunityVote: React.FC<CommunityVoteProps> = ({ onBack, onSignIn }) => {
    const { t, lang } = useTranslation();
    const { user, token } = useAuth();
    const userId = user?.id;

    const [vote, setVote] = useState<VotePublic | null>(null);
    const [me, setMe] = useState<VoteMe | null>(null);
    const [loading, setLoading] = useState(true);
    const [meLoading, setMeLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [meError, setMeError] = useState<string | null>(null);

    const [splitChoice, setSplitChoice] = useState<SplitOptionId | null>(null);
    const [currencies, setCurrencies] = useState<AdditionalCurrencyId[]>([]);
    const [acceptDonations, setAcceptDonations] = useState<boolean | null>(null);
    const [hrtDays, setHrtDays] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const seededBallot = useRef<number | null>(null);
    const publicRequest = useRef(0);
    const meRequest = useRef(0);

    const loadPublic = useCallback(
        async (signal?: AbortSignal) => {
            const request = ++publicRequest.current;
            if (signal) setLoading(true);
            try {
                const res = await fetch(apiEndpoint('/api/vote'), { signal, cache: 'no-store' });
                if (!res.ok) throw await apiErrorFrom(res);
                const data = (await res.json()) as VotePublic;
                if (request !== publicRequest.current) return;
                setVote(data);
                setError(null);
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') return;
                if (request !== publicRequest.current) return;
                setError(t('vote.error.load'));
            } finally {
                if (signal && request === publicRequest.current) setLoading(false);
            }
        },
        [t],
    );

    useEffect(() => {
        const ctrl = new AbortController();
        void loadPublic(ctrl.signal);
        const timer = window.setInterval(() => void loadPublic(), REFRESH_INTERVAL_MS);
        return () => {
            publicRequest.current++;
            ctrl.abort();
            window.clearInterval(timer);
        };
    }, [loadPublic]);

    const loadMe = useCallback(
        async (signal?: AbortSignal) => {
            const request = ++meRequest.current;
            if (!token) {
                setMe(null);
                setMeError(null);
                setMeLoading(false);
                return;
            }
            setMeLoading(true);
            try {
                const res = await apiFetch('/api/vote/me', {
                    signal,
                    cache: 'no-store',
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw await apiErrorFrom(res);
                const data = (await res.json()) as VoteMe;
                if (request !== meRequest.current) return;
                setMe(data);
                setMeError(null);
                setHrtDays(
                    userId && data.accountCreatedAt
                        ? countHrtDaysSince(userId, data.accountCreatedAt, Math.floor(Date.now() / 1000))
                        : 0,
                );
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') return;
                if (request !== meRequest.current) return;
                setMeError(t('vote.error.load'));
            } finally {
                if (request === meRequest.current) setMeLoading(false);
            }
        },
        [t, token, userId],
    );

    // Account eligibility can change while the page is open, and auto-sync can
    // add local dose days after the first fetch. Refresh both on the same
    // cadence as the public tally, and when the tab comes back into focus.
    useEffect(() => {
        if (!token) return;
        const ctrl = new AbortController();
        void loadMe(ctrl.signal);
        const timer = window.setInterval(() => void loadMe(), REFRESH_INTERVAL_MS);
        const onFocus = () => void loadMe();
        window.addEventListener('focus', onFocus);
        return () => {
            meRequest.current++;
            ctrl.abort();
            window.clearInterval(timer);
            window.removeEventListener('focus', onFocus);
        };
    }, [loadMe, token]);

    // A new sign-in is a new ballot. Do not carry the previous account's
    // choices across, even if the page stayed mounted through the switch.
    useEffect(() => {
        seededBallot.current = null;
        setMe(null);
        setMeError(null);
        setHrtDays(0);
        setSplitChoice(null);
        setCurrencies([]);
        setAcceptDonations(null);
        setSaved(false);
        setSubmitError(null);
    }, [token]);

    useEffect(() => {
        const ballot = me?.ballot;
        if (!ballot || seededBallot.current === ballot.updatedAt) return;
        seededBallot.current = ballot.updatedAt;
        setSplitChoice(ballot.splitChoice);
        setCurrencies(ballot.currencies);
        setAcceptDonations(ballot.acceptDonations);
    }, [me]);

    const status = vote?.vote.status ?? 'upcoming';
    const acceptsBallots = vote?.vote.acceptsBallots ?? false;
    const canEdit = acceptsBallots;
    const accountDaysLeft = Math.max(0, MIN_ACCOUNT_AGE_DAYS - (me?.accountAgeDays ?? 0));
    const hrtDaysLeft = Math.max(0, MIN_HRT_DAYS - hrtDays);
    const accountEligible = !!me?.accountEligible;
    const hrtEligible = hrtDays >= MIN_HRT_DAYS;
    const ballotComplete = splitChoice !== null && acceptDonations !== null;
    const canSubmit =
        !!token && !!me && acceptsBallots && accountEligible && hrtEligible && ballotComplete && !submitting;

    const voteMessage = (err: unknown): string => {
        const code = apiErrorCode(err);
        if (code === 'VOTE_NOT_OPEN') return t('vote.ballot.upcoming');
        if (code === 'VOTE_CLOSED') return t('vote.error.closed');
        if (code === 'HRT_INELIGIBLE') return fill(t('vote.error.hrt'), { min: MIN_HRT_DAYS });
        if (code === 'ACCOUNT_TOO_NEW') return fill(t('vote.error.account_age'), { days: MIN_ACCOUNT_AGE_DAYS });
        if (code === 'RATE_LIMITED') return t('vote.error.rate');
        if (code.startsWith('INVALID_')) return t('vote.error.schema');
        return t('vote.error.submit');
    };

    const submit = async () => {
        if (!token || !canSubmit || splitChoice === null || acceptDonations === null) return;
        setSubmitting(true);
        setSubmitError(null);
        setSaved(false);
        try {
            const res = await apiFetch('/api/vote', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    splitChoice,
                    currencies,
                    acceptDonations,
                    hrtEligible,
                }),
            });
            if (!res.ok) throw await apiErrorFrom(res);
            const result = (await res.json()) as VoteSubmitResponse;
            // A poll that started before this submit must not replace the
            // fresh ballot or tally with an older snapshot.
            publicRequest.current++;
            meRequest.current++;
            setMe(previous => (previous ? { ...previous, ballot: result.ballot } : previous));
            setVote(previous => (previous ? { ...previous, tally: result.tally } : previous));
            setSaved(true);
        } catch (e) {
            setSubmitError(voteMessage(e));
        } finally {
            setSubmitting(false);
        }
    };

    const toggleCurrency = (id: AdditionalCurrencyId) => {
        setSaved(false);
        setCurrencies(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]));
    };

    const final = useMemo(() => {
        if (!vote || status !== 'closed') return null;
        const outcome = resolveVoteOutcome(vote.tally);
        const split = SPLIT_OPTIONS.find(option => option.id === outcome.split) ?? SPLIT_OPTIONS[0];
        return { split, accepted: outcome.accepted, added: outcome.addedCurrencies };
    }, [status, vote]);

    if (loading && !vote) {
        return (
            <div className="md:pb-32">
                <PageHeader onBack={onBack} title={t('vote.title')} />
                <div className={`${PAGE_COLUMN} mt-3`}>
                    <p className="text-sm text-[var(--text-muted)]">{t('vote.loading')}</p>
                </div>
            </div>
        );
    }

    if (!vote) {
        return (
            <div className="md:pb-32">
                <PageHeader onBack={onBack} title={t('vote.title')} />
                <div className={`${PAGE_COLUMN} mt-3`}>
                    <p className="text-sm text-[var(--danger)]">{error ?? t('vote.error.load')}</p>
                    <button onClick={() => void loadPublic()} className="btn-secondary mt-4">
                        {t('vote.error.retry')}
                    </button>
                </div>
            </div>
        );
    }

    const { vote: proposal, tally } = vote;
    const early = proposal.status === 'upcoming' && proposal.acceptsBallots;
    const statusLabel = early ? t('vote.status.early') : t(`vote.status.${proposal.status}`);
    const dateRange = fill(t('vote.date_range'), {
        open: formatDateTime(proposal.opensAt, lang),
        close: formatDateTime(proposal.closesAt, lang),
    });

    return (
        <div className="md:pb-32">
            <PageHeader
                onBack={onBack}
                title={t('vote.title')}
                subtitle={dateRange}
                actions={
                    <span
                        className={`text-sm ${
                            proposal.acceptsBallots ? 'text-[var(--accent-ink)]' : 'text-[var(--text-muted)]'
                        }`}
                    >
                        {statusLabel}
                    </span>
                }
            />

            <div className={`${PAGE_COLUMN} mt-3 space-y-7`}>
                <p className="text-sm leading-relaxed text-[var(--text)]">{t('vote.intro')}</p>

                <Section title={t('vote.why.title')}>
                    <p>{t('vote.why.body')}</p>
                </Section>

                <Section title={t('vote.split.title')}>
                    <p>{t('vote.split.body')}</p>
                    <div className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-4">
                        <p className="text-sm font-medium text-[var(--text)]">{splitText(SPLIT_OPTIONS[0], t)}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">{t('vote.split.proposed')}</p>
                    </div>
                    <p className="text-xs">{t('vote.split.rule')}</p>
                    <p className="text-xs">{fill(t('vote.split.floor'), { min: MIN_MAINTAINER_SHARE })}</p>
                </Section>

                <Section title={t('vote.currency.title')}>
                    <p>{t('vote.currency.body')}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--accent-ink)]">
                            <Lock size={14} />
                            {currencyLabel(ALWAYS_SUPPORTED_CURRENCY, t)}
                        </span>
                        {ADDITIONAL_CURRENCIES.map(id => (
                            <span key={id} className="text-sm text-[var(--text-muted)]">
                                {currencyLabel(id, t)}
                            </span>
                        ))}
                    </div>
                    <p className="text-xs">{t('vote.currency.rule')}</p>
                </Section>

                <Section title={t('vote.transparency.title')}>
                    <p>{t('vote.transparency.body')}</p>
                </Section>

                <Section title={t('vote.how.title')}>
                    <ul className="list-disc space-y-2 ps-5 marker:text-[var(--border-strong)]">
                        <li>{fill(t('vote.how.account'), { days: MIN_ACCOUNT_AGE_DAYS })}</li>
                        <li>{fill(t('vote.how.hrt'), { days: MIN_HRT_DAYS })}</li>
                        <li>{t('vote.how.one')}</li>
                    </ul>
                    <p className="flex gap-2 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 text-xs">
                        <Info size={16} className="mt-0.5 shrink-0" />
                        <span>{t('vote.how.local')}</span>
                    </p>
                </Section>

                {!token && acceptsBallots ? (
                    <Card>
                        <h2 className="text-sm font-semibold text-[var(--text)]">{t('vote.signin.title')}</h2>
                        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
                            {t('vote.signin.body')}
                        </p>
                        <button onClick={onSignIn} className="btn-primary mt-4">
                            {t('vote.signin.button')}
                        </button>
                    </Card>
                ) : (
                    <Card>
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="text-sm font-semibold text-[var(--text)]">{t('vote.eligibility.title')}</h2>
                            {me && (
                                <span
                                    className={`text-xs font-medium ${
                                        accountEligible && hrtEligible
                                            ? 'text-[var(--accent-ink)]'
                                            : 'text-[var(--text-muted)]'
                                    }`}
                                >
                                    {accountEligible && hrtEligible
                                        ? t('vote.eligibility.eligible')
                                        : t('vote.eligibility.not_eligible')}
                                </span>
                            )}
                        </div>

                        {meLoading && !me && (
                            <p className="mt-3 text-sm text-[var(--text-muted)]">{t('vote.loading')}</p>
                        )}
                        {meError && !me && (
                            <div className="mt-3 flex items-center justify-between gap-4">
                                <p className="text-sm text-[var(--danger)]">{meError}</p>
                                <button onClick={() => void loadMe()} className="btn-secondary btn-sm shrink-0">
                                    {t('vote.error.retry')}
                                </button>
                            </div>
                        )}
                        {me && (
                            <div className="mt-4 space-y-3 text-sm">
                                <div className="flex items-start gap-2.5">
                                    {accountEligible ? (
                                        <Check size={17} className="mt-0.5 shrink-0 text-[var(--accent-ink)]" />
                                    ) : (
                                        <Close size={17} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                                    )}
                                    <div>
                                        <p className="text-[var(--text)]">
                                            {fill(t('vote.eligibility.account'), { days: me.accountAgeDays })}
                                        </p>
                                        {!accountEligible && (
                                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                                                {fill(t('vote.eligibility.account_too_new'), {
                                                    days: accountDaysLeft,
                                                })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-start gap-2.5">
                                    {hrtEligible ? (
                                        <Check size={17} className="mt-0.5 shrink-0 text-[var(--accent-ink)]" />
                                    ) : (
                                        <Close size={17} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                                    )}
                                    <div>
                                        <p className="text-[var(--text)]">
                                            {fill(t('vote.eligibility.hrt'), {
                                                days: hrtDays,
                                                min: MIN_HRT_DAYS,
                                            })}
                                        </p>
                                        {!hrtEligible && (
                                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                                                {fill(
                                                    t(
                                                        hrtDaysLeft === 1
                                                            ? 'vote.eligibility.hrt_too_low_one'
                                                            : 'vote.eligibility.hrt_too_low',
                                                    ),
                                                    { days: hrtDaysLeft },
                                                )}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                                    {t('vote.eligibility.local_note')}
                                </p>
                            </div>
                        )}
                    </Card>
                )}

                {token && me && (
                    <section className="border-t-(length:--hairline) border-[var(--border)] pt-7">
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="text-sm font-semibold text-[var(--text)]">{t('vote.ballot.title')}</h2>
                            {me.ballot && (
                                <span className="text-xs text-[var(--accent-ink)]">{t('vote.ballot.your_ballot')}</span>
                            )}
                        </div>

                        <fieldset disabled={!canEdit || submitting} className="mt-4 space-y-5">
                            <legend className="text-sm font-medium text-[var(--text)]">{t('vote.ballot.split')}</legend>
                            <div className="space-y-2">
                                {SPLIT_OPTIONS.map(option => {
                                    const selected = splitChoice === option.id;
                                    return (
                                        <label
                                            key={option.id}
                                            className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3.5 transition-colors ${
                                                selected
                                                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                                                    : 'border-[var(--border)] hover:bg-[var(--surface-hover)]'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="vote-split"
                                                value={option.id}
                                                checked={selected}
                                                onChange={() => {
                                                    setSplitChoice(option.id);
                                                    setSaved(false);
                                                }}
                                                className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-sm text-[var(--text)]">
                                                    {splitText(option, t)}
                                                </span>
                                                {option.id === PROPOSED_SPLIT_ID && (
                                                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                                                        {t('vote.split.proposed')}
                                                    </span>
                                                )}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>

                            <div>
                                <p className="text-sm font-medium text-[var(--text)]">{t('vote.ballot.currency')}</p>
                                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                                    {t('vote.ballot.currency_note')}
                                </p>
                                <div className="mt-2 space-y-2">
                                    <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent)] bg-[var(--accent-subtle)] p-3.5">
                                        <input
                                            type="checkbox"
                                            checked
                                            disabled
                                            readOnly
                                            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                                        />
                                        <span>
                                            <span className="block text-sm text-[var(--text)]">
                                                {currencyLabel(ALWAYS_SUPPORTED_CURRENCY, t)}
                                            </span>
                                            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                                                {t('vote.currency.monero_note')}
                                            </span>
                                        </span>
                                    </label>
                                    {ADDITIONAL_CURRENCIES.map(id => (
                                        <label
                                            key={id}
                                            className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border-(length:--hairline) border-[var(--border)] p-3.5 hover:bg-[var(--surface-hover)]"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={currencies.includes(id)}
                                                onChange={() => toggleCurrency(id)}
                                                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                                            />
                                            <span className="text-sm text-[var(--text)]">{currencyLabel(id, t)}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-medium text-[var(--text)]">{t('vote.ballot.accept')}</p>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    {[true, false].map(value => {
                                        const selected = acceptDonations === value;
                                        return (
                                            <label
                                                key={String(value)}
                                                className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3.5 transition-colors ${
                                                    selected
                                                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                                                        : 'border-[var(--border)] hover:bg-[var(--surface-hover)]'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="vote-accept"
                                                    checked={selected}
                                                    onChange={() => {
                                                        setAcceptDonations(value);
                                                        setSaved(false);
                                                    }}
                                                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                                                />
                                                <span className="text-sm text-[var(--text)]">
                                                    {value ? t('vote.ballot.accept_yes') : t('vote.ballot.accept_no')}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                                <p className="mt-2 text-xs text-[var(--text-muted)]">{t('vote.accept.rule')}</p>
                            </div>
                        </fieldset>

                        {!canEdit && (
                            <p className="mt-3 text-sm text-[var(--text-muted)]">
                                {status === 'closed' ? t('vote.ballot.closed') : t('vote.ballot.upcoming')}
                            </p>
                        )}
                        {canEdit && !ballotComplete && (
                            <p className="mt-3 text-xs text-[var(--text-muted)]">{t('vote.ballot.required')}</p>
                        )}
                        {submitError && <p className="mt-3 text-sm text-[var(--danger)]">{submitError}</p>}
                        {saved && (
                            <p role="status" className="mt-3 text-sm text-[var(--accent-ink)]">
                                {t('vote.ballot.saved')}
                            </p>
                        )}

                        <button onClick={() => void submit()} disabled={!canSubmit} className="btn-primary mt-4">
                            {submitting
                                ? t('vote.ballot.submitting')
                                : me.ballot
                                  ? t('vote.ballot.update')
                                  : t('vote.ballot.submit')}
                        </button>
                    </section>
                )}

                <section className="border-t-(length:--hairline) border-[var(--border)] pt-7">
                    <div className="flex items-baseline justify-between gap-4">
                        <h2 className="text-sm font-semibold text-[var(--text)]">{t('vote.tally.title')}</h2>
                        <span className="text-xs tabular-nums text-[var(--text-muted)]">
                            {fill(t(tally.ballots === 1 ? 'vote.tally.ballots_one' : 'vote.tally.ballots'), {
                                n: tally.ballots,
                            })}
                        </span>
                    </div>

                    {tally.ballots === 0 ? (
                        <p className="mt-3 text-sm text-[var(--text-muted)]">{t('vote.tally.none')}</p>
                    ) : (
                        <div className="mt-5 space-y-6">
                            <div>
                                <h3 className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
                                    {t('vote.tally.split')}
                                </h3>
                                <TallySplit tally={tally} t={t} />
                            </div>
                            <div>
                                <h3 className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
                                    {t('vote.tally.currencies')}
                                </h3>
                                <TallyCurrencies tally={tally} t={t} />
                                <p className="mt-2 text-xs text-[var(--text-muted)]">{t('vote.tally.threshold')}</p>
                            </div>
                            <div>
                                <h3 className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
                                    {t('vote.tally.accept')}
                                </h3>
                                <TallyAccept tally={tally} t={t} />
                                <p className="mt-2 text-xs text-[var(--text-muted)]">{t('vote.accept.rule')}</p>
                            </div>
                        </div>
                    )}

                    {status !== 'closed' && (
                        <p className="mt-5 text-xs text-[var(--text-muted)]">{t('vote.tally.not_final')}</p>
                    )}
                </section>

                {final && (
                    <Card className="bg-[var(--surface-muted)]">
                        <h2 className="text-sm font-semibold text-[var(--text)]">{t('vote.tally.final')}</h2>
                        {tally.ballots === 0 ? (
                            <p className="mt-2 text-sm text-[var(--text-muted)]">{t('vote.tally.none')}</p>
                        ) : (
                            <div className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--text)]">
                                <p>{splitText(final.split, t)}</p>
                                <p>
                                    {final.accepted
                                        ? t('vote.tally.final_accept_yes')
                                        : t('vote.tally.final_accept_no')}
                                </p>
                                {final.accepted && (
                                    <p>
                                        {fill(t('vote.tally.final_currencies'), {
                                            currencies: [
                                                currencyLabel(ALWAYS_SUPPORTED_CURRENCY, t),
                                                ...final.added.map(id => currencyLabel(id, t)),
                                            ].join(t('list.sep')),
                                        })}
                                    </p>
                                )}
                            </div>
                        )}
                        <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                            {t('vote.tally.final_note')}
                        </p>
                    </Card>
                )}

                <p className="border-t-(length:--hairline) border-[var(--border)] pt-5 text-xs leading-relaxed text-[var(--text-muted)]">
                    {t('vote.footer')}
                </p>
            </div>
        </div>
    );
};

export default CommunityVote;
