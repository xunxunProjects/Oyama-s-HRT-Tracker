import React, { useEffect, useState } from 'react';
import { ChevronRight } from './icons';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { Lang } from '../i18n/translations';
import { apiEndpoint, apiFetch } from '../services/apiClient';
import { communityVotePromptState, countHrtDaysSince } from '../utils/communityVote';
import { fill } from '../utils/regimenText';
import type { VoteMe, VotePublic } from '../../communityVote';

const LOCALE: Record<Lang, string> = {
    zh: 'zh-CN',
    'zh-TW': 'zh-TW',
    yue: 'zh-HK',
    en: 'en',
    ja: 'ja',
    ko: 'ko',
    tr: 'tr',
};

const formatDay = (seconds: number, lang: Lang) =>
    new Date(seconds * 1000).toLocaleDateString(LOCALE[lang], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    });

interface CommunityVotePromptProps {
    /** Open the vote page (signed-in, eligible, no ballot yet). */
    onVote: () => void;
    /** Send a signed-out visitor through the existing sign-in flow. */
    onSignIn: () => void;
}

/**
 * The quiet nudge at the bottom of Overview. It is not a popup and has no
 * close button: it simply disappears once the account has a ballot, cannot
 * vote, or the deadline passes.
 */
const CommunityVotePrompt: React.FC<CommunityVotePromptProps> = ({ onVote, onSignIn }) => {
    const { t, lang } = useTranslation();
    const { user, token } = useAuth();
    const userId = user?.id;

    const [publicVote, setPublicVote] = useState<VotePublic | null>(null);
    const [me, setMe] = useState<VoteMe | null>(null);
    const [hrtDays, setHrtDays] = useState(0);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const res = await fetch(apiEndpoint('/api/vote'), { cache: 'no-store' });
                if (!res.ok) throw new Error('vote unavailable');
                const data = (await res.json()) as VotePublic;
                if (active) setPublicVote(data);
            } catch {
                if (active) setPublicVote(null);
            }
        };
        void load();
        const timer = window.setInterval(() => void load(), 60_000);
        const onFocus = () => void load();
        window.addEventListener('focus', onFocus);
        return () => {
            active = false;
            window.clearInterval(timer);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    useEffect(() => {
        if (!token || !userId) {
            setMe(null);
            setHrtDays(0);
            return;
        }

        let active = true;
        const load = async () => {
            try {
                const res = await apiFetch('/api/vote/me', {
                    cache: 'no-store',
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error('vote account unavailable');
                const data = (await res.json()) as VoteMe;
                if (!active) return;
                setMe(data);
                setHrtDays(
                    data.accountCreatedAt
                        ? countHrtDaysSince(userId, data.accountCreatedAt, Math.floor(Date.now() / 1000))
                        : 0,
                );
            } catch {
                if (active) {
                    setMe(null);
                    setHrtDays(0);
                }
            }
        };
        void load();
        const timer = window.setInterval(() => void load(), 60_000);
        const onFocus = () => void load();
        window.addEventListener('focus', onFocus);
        return () => {
            active = false;
            window.clearInterval(timer);
            window.removeEventListener('focus', onFocus);
        };
    }, [token, userId]);

    const prompt = publicVote
        ? communityVotePromptState({
              signedIn: !!token,
              acceptsBallots: publicVote.vote.acceptsBallots,
              hasBallot: !!me?.ballot,
              accountEligible: !!me?.accountEligible,
              hrtDays,
          })
        : 'hidden';

    if (prompt === 'hidden' || !publicVote) return null;

    const early = publicVote.vote.status === 'upcoming' && publicVote.vote.acceptsBallots;
    const title = prompt === 'signin' ? t('vote.prompt.signin') : t('vote.prompt.unvoted');

    return (
        <section
            aria-labelledby="community-vote-prompt-title"
            className="mt-10 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-5"
        >
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-[var(--accent-ink)]">{t('vote.prompt.title')}</p>
                {early && (
                    <span className="rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--accent-ink)]">
                        {t('vote.prompt.early')}
                    </span>
                )}
            </div>
            <h2 id="community-vote-prompt-title" className="mt-2 text-sm font-semibold text-[var(--text)]">
                {title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{t('vote.prompt.body')}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--text-muted)]">
                    {fill(t('vote.prompt.deadline'), { date: formatDay(publicVote.vote.closesAt, lang) })}
                </p>
                <button
                    type="button"
                    onClick={prompt === 'signin' ? onSignIn : onVote}
                    className="btn-primary inline-flex items-center gap-1"
                >
                    {t('vote.prompt.go')}
                    <ChevronRight size={15} />
                </button>
            </div>
        </section>
    );
};

export default CommunityVotePrompt;
