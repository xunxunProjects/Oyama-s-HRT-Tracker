import { MIN_HRT_DAYS } from '../../communityVote';
import { toDayKey } from './helpers';

export type CommunityVotePromptState = 'hidden' | 'signin' | 'vote';

interface CommunityVotePromptInput {
    signedIn: boolean;
    acceptsBallots: boolean;
    hasBallot: boolean;
    accountEligible: boolean;
    hrtDays: number;
}

/**
 * What the Overview nudge should say, if anything. It disappears for anyone
 * who cannot act on it: ineligible accounts, people who already voted, and
 * after the deadline. A signed-out visitor only sees it while ballots are
 * still accepted, so the prompt never leads to a closed vote.
 */
export const communityVotePromptState = ({
    signedIn,
    acceptsBallots,
    hasBallot,
    accountEligible,
    hrtDays,
}: CommunityVotePromptInput): CommunityVotePromptState => {
    if (!acceptsBallots) return 'hidden';
    if (!signedIn) return 'signin';
    if (hasBallot || !accountEligible || hrtDays < MIN_HRT_DAYS) return 'hidden';
    return 'vote';
};

/**
 * Count the distinct local calendar days on which this account logged a dose,
 * from its registration time up to now, across both HRT modes.
 *
 * Dose records never leave the browser, so this is the only place the five-day
 * requirement can be checked. The server receives the yes/no result, not the
 * days or the records. It reads the same keys `useAppData` writes for a signed-in
 * account: `hrt-u<id>-events` and `hrt-u<id>-masc-events`.
 */
export const countHrtDaysSince = (userId: string, sinceSec: number, nowSec: number): number => {
    if (typeof localStorage === 'undefined' || !userId) return 0;

    const startMs = sinceSec * 1000;
    const endMs = nowSec * 1000;
    const days = new Set<string>();

    for (const suffix of ['events', 'masc-events']) {
        const raw = localStorage.getItem(`hrt-u${userId}-${suffix}`);
        if (!raw) continue;

        let events: unknown;
        try {
            events = JSON.parse(raw);
        } catch {
            continue;
        }
        if (!Array.isArray(events)) continue;

        for (const event of events) {
            if (!event || typeof event !== 'object') continue;
            const timeH = (event as { timeH?: unknown }).timeH;
            if (typeof timeH !== 'number' || !Number.isFinite(timeH)) continue;

            const ms = timeH * 3_600_000;
            if (ms < startMs || ms > endMs) continue;
            days.add(toDayKey(new Date(ms)));
        }
    }

    return days.size;
};
