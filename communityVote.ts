/**
 * The community funding vote, in one place.
 *
 * The Worker and the page import these constants, so the option ids, the
 * window and the tally rules cannot drift apart between what the server
 * accepts and what the ballot shows.
 *
 * This is deliberately a one-off vote keyed by `COMMUNITY_VOTE_KEY`: a later
 * vote can use a new key without rewriting old ballots.
 */

export const COMMUNITY_VOTE_KEY = 'funding-2026-11';

/** 2026-10-29 00:00:00 UTC. */
export const COMMUNITY_VOTE_OPENS_AT = Math.floor(Date.UTC(2026, 9, 29, 0, 0, 0) / 1000);
/** 2026-11-19 23:59:59 UTC. */
export const COMMUNITY_VOTE_CLOSES_AT = Math.floor(Date.UTC(2026, 10, 19, 23, 59, 59) / 1000);

export const MIN_ACCOUNT_AGE_DAYS = 10;
export const MIN_HRT_DAYS = 5;

/** The split the maintainers propose. A tie falls back to this option. */
export const PROPOSED_SPLIT_ID = '30-30-40';

/**
 * Monero is not part of the currency question. It is always supported, so
 * there is a privacy-preserving way to give even if the vote adds nothing
 * else. The other currencies need more than half of the ballots to be added.
 */
export const ALWAYS_SUPPORTED_CURRENCY = 'monero';

export const SPLIT_OPTIONS = [
    { id: '30-30-40', fantuanmtf: 30, smirnovaoyama: 30, project: 40 },
    { id: '25-25-50', fantuanmtf: 25, smirnovaoyama: 25, project: 50 },
    { id: '40-40-20', fantuanmtf: 40, smirnovaoyama: 40, project: 20 },
    { id: '0-0-100', fantuanmtf: 0, smirnovaoyama: 0, project: 100 },
] as const;

export type SplitOptionId = (typeof SPLIT_OPTIONS)[number]['id'];

export const ADDITIONAL_CURRENCIES = ['bitcoin', 'ethereum', 'bitcoin-cash'] as const;

export type AdditionalCurrencyId = (typeof ADDITIONAL_CURRENCIES)[number];

/** A question passes only with more than half of all ballots. */
export const VOTE_MAJORITY = 0.5;

/** A currency has to be chosen on more than half of all ballots to be added. */
export const ADDITIONAL_CURRENCY_MAJORITY = VOTE_MAJORITY;

export type CommunityVoteStatus = 'upcoming' | 'open' | 'closed';

export const voteStatusAt = (nowSec: number): CommunityVoteStatus => {
    if (nowSec < COMMUNITY_VOTE_OPENS_AT) return 'upcoming';
    if (nowSec > COMMUNITY_VOTE_CLOSES_AT) return 'closed';
    return 'open';
};

export const isSplitOptionId = (value: unknown): value is SplitOptionId =>
    typeof value === 'string' && SPLIT_OPTIONS.some(option => option.id === value);

export const isAdditionalCurrencyId = (value: unknown): value is AdditionalCurrencyId =>
    typeof value === 'string' && (ADDITIONAL_CURRENCIES as readonly string[]).includes(value);

/**
 * Validate the optional currency list from a request. `null` means the value
 * was not a list of known ids. Duplicates are collapsed, so a client cannot
 * make one ballot count twice for the same currency.
 */
export const normalizeAdditionalCurrencies = (value: unknown): AdditionalCurrencyId[] | null => {
    if (!Array.isArray(value)) return null;
    const out: AdditionalCurrencyId[] = [];
    for (const item of value) {
        if (!isAdditionalCurrencyId(item)) return null;
        if (!out.includes(item)) out.push(item);
    }
    return out;
};

export interface VoteBallot {
    splitChoice: SplitOptionId;
    currencies: AdditionalCurrencyId[];
    acceptDonations: boolean;
    /** The client's local HRT check. The server cannot verify this by design. */
    hrtEligible: boolean;
    createdAt: number;
    updatedAt: number;
}

/** A row as the tally needs it, already parsed out of the database. */
export interface VoteTallyRow {
    splitChoice: string;
    currencies: readonly string[];
    acceptDonations: boolean;
}

export interface VoteTally {
    ballots: number;
    split: Record<SplitOptionId, number>;
    currencies: Record<AdditionalCurrencyId, number>;
    accept: { yes: number; no: number };
}

/** Count a set of ballots into the shape the page and API return. */
export const buildVoteTally = (rows: readonly VoteTallyRow[]): VoteTally => {
    const split = Object.fromEntries(SPLIT_OPTIONS.map(option => [option.id, 0])) as Record<SplitOptionId, number>;
    const currencies = Object.fromEntries(ADDITIONAL_CURRENCIES.map(id => [id, 0])) as Record<
        AdditionalCurrencyId,
        number
    >;
    const accept = { yes: 0, no: 0 };

    for (const row of rows) {
        if (isSplitOptionId(row.splitChoice)) split[row.splitChoice]++;

        const seen = new Set<string>();
        for (const currency of row.currencies) {
            if (isAdditionalCurrencyId(currency) && !seen.has(currency)) {
                seen.add(currency);
                currencies[currency]++;
            }
        }

        if (row.acceptDonations) accept.yes++;
        else accept.no++;
    }

    return { ballots: rows.length, split, currencies, accept };
};

export interface VoteOutcome {
    split: SplitOptionId;
    accepted: boolean;
    addedCurrencies: AdditionalCurrencyId[];
}

/**
 * Turn a tally into the result the maintainers act on. The split is a
 * plurality with a tie falling back to the proposed split; the other two
 * questions need a strict majority of all ballots. With no ballots nothing
 * passes, and the split falls back to the proposal.
 */
export const resolveVoteOutcome = (tally: VoteTally): VoteOutcome => {
    const most = Math.max(...SPLIT_OPTIONS.map(option => tally.split[option.id]));
    const leaders = SPLIT_OPTIONS.filter(option => tally.split[option.id] === most);
    const split = leaders.length === 1 ? leaders[0].id : PROPOSED_SPLIT_ID;
    const passes = (count: number) => tally.ballots > 0 && count > tally.ballots * VOTE_MAJORITY;

    return {
        split,
        accepted: passes(tally.accept.yes),
        addedCurrencies: ADDITIONAL_CURRENCIES.filter(id => passes(tally.currencies[id])),
    };
};

export interface VotePublic {
    vote: {
        key: string;
        opensAt: number;
        closesAt: number;
        status: CommunityVoteStatus;
        serverTime: number;
        minAccountAgeDays: number;
        minHrtDays: number;
        proposedSplit: SplitOptionId;
        alwaysSupportedCurrency: typeof ALWAYS_SUPPORTED_CURRENCY;
        additionalCurrencyMajority: number;
    };
    tally: VoteTally;
}

export interface VoteMe {
    accountCreatedAt: number | null;
    accountAgeDays: number;
    accountEligible: boolean;
    ballot: VoteBallot | null;
}

export interface VoteSubmitResponse {
    ballot: VoteBallot;
    tally: VoteTally;
}
