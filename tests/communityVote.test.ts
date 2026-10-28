import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    buildVoteTally,
    COMMUNITY_VOTE_CLOSES_AT,
    COMMUNITY_VOTE_KEY,
    COMMUNITY_VOTE_OPENS_AT,
    isVoteAcceptingBallots,
    MIN_HRT_DAYS,
    MIN_MAINTAINER_SHARE,
    normalizeAdditionalCurrencies,
    resolveVoteOutcome,
    SPLIT_OPTIONS,
    voteStatusAt,
    type VoteMe,
    type VotePublic,
    type VoteSubmitResponse,
} from '../communityVote';
import { handleCommunityVoteMe, handleCommunityVotePublic, handleCommunityVoteSubmit } from '../communityVoteServer';
import { communityVotePromptState, countHrtDaysSince } from '../src/utils/communityVote';

const DAY = 86_400;
const NOW = COMMUNITY_VOTE_OPENS_AT + 5 * DAY;
const USER_ID = 'user-1';

interface BallotRow {
    vote_key: string;
    user_id: string;
    split_choice: string;
    currencies: string;
    accept_donations: number;
    hrt_eligible: number;
    created_at: number;
    updated_at: number;
}

class FakeStatement {
    private params: unknown[] = [];

    constructor(
        private readonly db: FakeVoteDb,
        private readonly sql: string,
    ) {}

    bind(...params: unknown[]): FakeStatement {
        this.params = params;
        return this;
    }

    async all<T = unknown>(): Promise<{ success: true; results: T[] }> {
        if (this.sql.includes('SELECT split_choice, currencies, accept_donations')) {
            if (!this.db.schemaReady) throw new Error('D1_ERROR: no such table: community_vote_ballots');
            return { success: true, results: this.db.tallyRows() as T[] };
        }
        throw new Error(`Unsupported SELECT in test fake: ${this.sql}`);
    }

    async first<T = unknown>(): Promise<T | null> {
        if (this.sql.includes('SELECT created_at FROM users')) {
            const createdAt = this.db.users.get(this.params[0] as string);
            return (createdAt === undefined ? null : { created_at: createdAt }) as T | null;
        }
        if (this.sql.includes('SELECT split_choice, currencies, accept_donations, hrt_eligible')) {
            if (!this.db.schemaReady) throw new Error('D1_ERROR: no such table: community_vote_ballots');
            const ballot = this.db.ballots.get(`${this.params[0]}:${this.params[1]}`);
            return (ballot ? { ...ballot } : null) as T | null;
        }
        throw new Error(`Unsupported SELECT in test fake: ${this.sql}`);
    }

    async run(): Promise<{ success: true; meta: { changes: number } }> {
        if (this.sql.includes('CREATE TABLE IF NOT EXISTS community_vote_ballots')) {
            this.db.schemaStatements.push(this.sql);
            this.db.schemaReady = true;
            return { success: true, meta: { changes: 0 } };
        }
        if (this.sql.includes('CREATE INDEX IF NOT EXISTS idx_community_vote_ballots_user')) {
            this.db.schemaStatements.push(this.sql);
            return { success: true, meta: { changes: 0 } };
        }
        if (!this.sql.includes('INSERT INTO community_vote_ballots')) {
            throw new Error(`Unsupported write in test fake: ${this.sql}`);
        }
        const [voteKey, userId, splitChoice, currencies, acceptDonations, createdAt, updatedAt] = this.params as [
            string,
            string,
            string,
            string,
            number,
            number,
            number,
        ];
        const id = `${voteKey}:${userId}`;
        const previous = this.db.ballots.get(id);
        this.db.ballots.set(id, {
            vote_key: voteKey,
            user_id: userId,
            split_choice: splitChoice,
            currencies,
            accept_donations: acceptDonations,
            hrt_eligible: 1,
            created_at: previous?.created_at ?? createdAt,
            updated_at: updatedAt,
        });
        return { success: true, meta: { changes: 1 } };
    }
}

class FakeVoteDb {
    readonly users = new Map<string, number>();
    readonly ballots = new Map<string, BallotRow>();
    schemaReady = true;
    readonly schemaStatements: string[] = [];

    prepare(sql: string): FakeStatement {
        return new FakeStatement(this, sql);
    }

    tallyRows(): Array<Pick<BallotRow, 'split_choice' | 'currencies' | 'accept_donations'>> {
        return [...this.ballots.values()]
            .filter(row => row.vote_key === COMMUNITY_VOTE_KEY)
            .map(row => ({
                split_choice: row.split_choice,
                currencies: row.currencies,
                accept_donations: row.accept_donations,
            }));
    }
}

const envFor = (db: FakeVoteDb) => ({ DB: db as unknown as D1Database });

const submit = (body: unknown) =>
    new Request('https://example.com/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

const validBallot = {
    splitChoice: '30-30-40',
    currencies: ['bitcoin'],
    acceptDonations: true,
    hrtEligible: true,
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('community vote rules', () => {
    it('starts at 08:00 UTC on 29 October and closes at the end of 20 November', () => {
        expect(COMMUNITY_VOTE_OPENS_AT).toBe(Date.UTC(2026, 9, 29, 8) / 1000);
        expect(COMMUNITY_VOTE_CLOSES_AT).toBe(Date.UTC(2026, 10, 20, 23, 59, 59) / 1000);
        expect(voteStatusAt(COMMUNITY_VOTE_OPENS_AT - 1)).toBe('upcoming');
        expect(voteStatusAt(COMMUNITY_VOTE_OPENS_AT)).toBe('open');
        expect(voteStatusAt(COMMUNITY_VOTE_CLOSES_AT)).toBe('open');
        expect(voteStatusAt(COMMUNITY_VOTE_CLOSES_AT + 1)).toBe('closed');
    });

    it('accepts ballots early and stops exactly after the deadline', () => {
        expect(isVoteAcceptingBallots(COMMUNITY_VOTE_OPENS_AT - 1)).toBe(true);
        expect(isVoteAcceptingBallots(COMMUNITY_VOTE_OPENS_AT)).toBe(true);
        expect(isVoteAcceptingBallots(COMMUNITY_VOTE_CLOSES_AT)).toBe(true);
        expect(isVoteAcceptingBallots(COMMUNITY_VOTE_CLOSES_AT + 1)).toBe(false);
    });

    it('keeps every split at one hundred percent and gives each maintainer at least ten percent', () => {
        for (const option of SPLIT_OPTIONS) {
            expect(option.fantuanmtf + option.smirnovaoyama + option.project).toBe(100);
            expect(option.fantuanmtf).toBeGreaterThanOrEqual(MIN_MAINTAINER_SHARE);
            expect(option.smirnovaoyama).toBeGreaterThanOrEqual(MIN_MAINTAINER_SHARE);
        }
    });

    it('normalizes optional currencies and rejects unknown ids', () => {
        expect(normalizeAdditionalCurrencies(['bitcoin', 'bitcoin', 'ethereum'])).toEqual(['bitcoin', 'ethereum']);
        expect(normalizeAdditionalCurrencies([])).toEqual([]);
        expect(normalizeAdditionalCurrencies(['bitcoin', 'dogecoin'])).toBeNull();
        expect(normalizeAdditionalCurrencies('bitcoin')).toBeNull();
        expect(normalizeAdditionalCurrencies([1])).toBeNull();
    });

    it('counts one ballot per row and one currency per ballot', () => {
        const tally = buildVoteTally([
            { splitChoice: '30-30-40', currencies: ['bitcoin', 'bitcoin', 'ethereum'], acceptDonations: true },
            { splitChoice: 'not-an-option', currencies: ['ethereum'], acceptDonations: false },
            { splitChoice: '25-25-50', currencies: ['unknown'], acceptDonations: true },
        ]);

        expect(tally.ballots).toBe(3);
        expect(tally.split).toEqual({ '30-30-40': 1, '25-25-50': 1, '40-40-20': 0, '10-10-80': 0 });
        expect(tally.currencies).toEqual({ bitcoin: 1, ethereum: 2, 'bitcoin-cash': 0 });
        expect(tally.accept).toEqual({ yes: 2, no: 1 });
    });
});

describe('community vote outcome', () => {
    const outcomeFor = (rows: Array<{ splitChoice: string; currencies?: string[]; acceptDonations?: boolean }>) =>
        resolveVoteOutcome(
            buildVoteTally(
                rows.map(row => ({
                    splitChoice: row.splitChoice,
                    currencies: row.currencies ?? [],
                    acceptDonations: row.acceptDonations ?? false,
                })),
            ),
        );

    it('uses the proposed split when every option has the same count', () => {
        expect(
            outcomeFor([{ splitChoice: '25-25-50' }, { splitChoice: '40-40-20' }, { splitChoice: '10-10-80' }]).split,
        ).toBe('30-30-40');
    });

    it('falls back to the proposed split when it is not one of the tied leaders', () => {
        expect(
            outcomeFor([
                { splitChoice: '25-25-50' },
                { splitChoice: '25-25-50' },
                { splitChoice: '40-40-20' },
                { splitChoice: '40-40-20' },
            ]).split,
        ).toBe('30-30-40');
    });

    it('uses a strict majority for donations and currencies', () => {
        const tied = outcomeFor([
            { splitChoice: '30-30-40', currencies: ['bitcoin'], acceptDonations: true },
            { splitChoice: '30-30-40', currencies: ['ethereum'], acceptDonations: false },
        ]);
        expect(tied.accepted).toBe(false);
        expect(tied.addedCurrencies).toEqual([]);

        const passed = outcomeFor([
            { splitChoice: '30-30-40', currencies: ['bitcoin', 'ethereum'], acceptDonations: true },
            { splitChoice: '30-30-40', currencies: ['bitcoin', 'ethereum'], acceptDonations: true },
            { splitChoice: '30-30-40', currencies: ['bitcoin-cash'], acceptDonations: false },
        ]);
        expect(passed.accepted).toBe(true);
        expect(passed.addedCurrencies).toEqual(['bitcoin', 'ethereum']);
    });

    it('passes nothing and falls back to the proposal with no ballots', () => {
        const empty = resolveVoteOutcome(buildVoteTally([]));
        expect(empty).toEqual({ split: '30-30-40', accepted: false, addedCurrencies: [] });
    });
});

describe('home page vote prompt', () => {
    const eligible = {
        signedIn: true,
        acceptsBallots: true,
        hasBallot: false,
        accountEligible: true,
        hrtDays: MIN_HRT_DAYS,
    };

    it('asks signed-out visitors to sign in while ballots are accepted', () => {
        expect(communityVotePromptState({ ...eligible, signedIn: false })).toBe('signin');
    });

    it('asks an eligible signed-in account without a ballot to vote', () => {
        expect(communityVotePromptState(eligible)).toBe('vote');
    });

    it('hides after a ballot, when ballots are closed, and for ineligible accounts', () => {
        expect(communityVotePromptState({ ...eligible, hasBallot: true })).toBe('hidden');
        expect(communityVotePromptState({ ...eligible, acceptsBallots: false })).toBe('hidden');
        expect(communityVotePromptState({ ...eligible, accountEligible: false })).toBe('hidden');
        expect(communityVotePromptState({ ...eligible, hrtDays: MIN_HRT_DAYS - 1 })).toBe('hidden');
    });
});

describe('local HRT day counting', () => {
    const hourAt = (month: number, day: number, hour: number) => Date.UTC(2026, month - 1, day, hour) / 3_600_000;

    it('counts distinct eligible days across both modes and skips bad records', () => {
        const since = Date.UTC(2026, 0, 1) / 1000;
        const now = Date.UTC(2026, 0, 6) / 1000;
        const storage = new Map<string, string>([
            [
                `hrt-u${USER_ID}-events`,
                JSON.stringify([
                    { id: 'before', timeH: hourAt(1, 1, -1) - 0.1 },
                    { id: 'one', timeH: hourAt(1, 1, 9) },
                    { id: 'same-day', timeH: hourAt(1, 1, 21) },
                    { id: 'two', timeH: hourAt(1, 2, 12) },
                    { id: 'future', timeH: hourAt(1, 6, 1) },
                    { id: 'bad', timeH: 'yesterday' },
                    null,
                ]),
            ],
            [
                `hrt-u${USER_ID}-masc-events`,
                JSON.stringify([
                    { id: 'three', timeH: hourAt(1, 4, 8) },
                    { id: 'four', timeH: hourAt(1, 5, 8) },
                ]),
            ],
        ]);
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => storage.get(key) ?? null,
        });

        expect(countHrtDaysSince(USER_ID, since, now)).toBe(4);
    });

    it('returns zero without storage or a user id', () => {
        expect(countHrtDaysSince('', 0, NOW)).toBe(0);
        vi.stubGlobal('localStorage', { getItem: () => null });
        expect(countHrtDaysSince(USER_ID, 0, NOW)).toBe(0);
    });
});

describe('community vote handlers', () => {
    it('returns the public proposal and an empty tally', async () => {
        const db = new FakeVoteDb();
        const result = await handleCommunityVotePublic(envFor(db), NOW);
        const body = result.body as VotePublic;

        expect(result.status).toBe(200);
        expect(body.vote.key).toBe(COMMUNITY_VOTE_KEY);
        expect(body.vote.status).toBe('open');
        expect(body.vote.serverTime).toBe(NOW);
        expect(body.vote.proposedSplit).toBe('30-30-40');
        expect(body.vote.alwaysSupportedCurrency).toBe('monero');
        expect(body.vote.acceptsBallots).toBe(true);
        expect(body.tally.ballots).toBe(0);
    });

    it('reports early voting before the official opening', async () => {
        const result = await handleCommunityVotePublic(envFor(new FakeVoteDb()), COMMUNITY_VOTE_OPENS_AT - 1);
        const body = result.body as VotePublic;
        expect(body.vote.status).toBe('upcoming');
        expect(body.vote.acceptsBallots).toBe(true);
    });

    it('bootstraps the missing ballot table before serving the public tally', async () => {
        const db = new FakeVoteDb();
        db.schemaReady = false;

        const result = await handleCommunityVotePublic(envFor(db), NOW);

        expect(result.status).toBe(200);
        expect(db.schemaReady).toBe(true);
        expect(db.schemaStatements[0]).toContain('CREATE TABLE IF NOT EXISTS community_vote_ballots');
        expect(db.schemaStatements[1]).toContain('CREATE INDEX IF NOT EXISTS idx_community_vote_ballots_user');
    });

    it('bootstraps the missing ballot table before reading or writing a ballot', async () => {
        const meDb = new FakeVoteDb();
        meDb.schemaReady = false;
        meDb.users.set(USER_ID, NOW - 30 * DAY);
        const me = await handleCommunityVoteMe(envFor(meDb), USER_ID, NOW);
        expect(me.status).toBe(200);
        expect(meDb.schemaReady).toBe(true);

        const submitDb = new FakeVoteDb();
        submitDb.schemaReady = false;
        submitDb.users.set(USER_ID, NOW - 30 * DAY);
        const saved = await handleCommunityVoteSubmit(submit(validBallot), envFor(submitDb), USER_ID, NOW);
        expect(saved.status).toBe(200);
        expect(submitDb.schemaReady).toBe(true);
    });

    it('reports a missing account', async () => {
        const result = await handleCommunityVoteMe(envFor(new FakeVoteDb()), 'missing', NOW);
        expect(result.status).toBe(404);
        expect(result.body).toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
    });

    it('reports account age at the ten-day boundary', async () => {
        const db = new FakeVoteDb();
        const env = envFor(db);

        db.users.set(USER_ID, NOW - 9 * DAY);
        const young = await handleCommunityVoteMe(env, USER_ID, NOW);
        expect((young.body as VoteMe).accountAgeDays).toBe(9);
        expect((young.body as VoteMe).accountEligible).toBe(false);

        db.users.set(USER_ID, NOW - 10 * DAY);
        const old = await handleCommunityVoteMe(env, USER_ID, NOW);
        const body = old.body as VoteMe;
        expect(body.accountCreatedAt).toBe(NOW - 10 * DAY);
        expect(body.accountAgeDays).toBe(10);
        expect(body.accountEligible).toBe(true);
        expect(body.ballot).toBeNull();
    });

    it('accepts early ballots, refuses late ballots, and refuses ineligible accounts', async () => {
        const db = new FakeVoteDb();
        const env = envFor(db);
        db.users.set(USER_ID, NOW - 30 * DAY);

        const early = await handleCommunityVoteSubmit(submit(validBallot), env, USER_ID, COMMUNITY_VOTE_OPENS_AT - 1);
        expect(early.status).toBe(200);
        expect(db.ballots.size).toBe(1);

        const late = await handleCommunityVoteSubmit(submit(validBallot), env, USER_ID, COMMUNITY_VOTE_CLOSES_AT + 1);
        expect(late.status).toBe(409);
        expect(late.body).toMatchObject({ code: 'VOTE_CLOSED' });

        const noHrt = await handleCommunityVoteSubmit(
            submit({ ...validBallot, hrtEligible: false }),
            env,
            USER_ID,
            NOW,
        );
        expect(noHrt.status).toBe(403);
        expect(noHrt.body).toMatchObject({ code: 'HRT_INELIGIBLE' });

        db.users.set(USER_ID, NOW - 9 * DAY);
        const tooNew = await handleCommunityVoteSubmit(submit(validBallot), env, USER_ID, NOW);
        expect(tooNew.status).toBe(403);
        expect(tooNew.body).toMatchObject({ code: 'ACCOUNT_TOO_NEW' });
    });

    it('validates every ballot field', async () => {
        const db = new FakeVoteDb();
        const env = envFor(db);
        db.users.set(USER_ID, NOW - 30 * DAY);

        const cases: Array<[unknown, string]> = [
            [{ ...validBallot, splitChoice: '50-50-0' }, 'INVALID_SPLIT'],
            [{ ...validBallot, currencies: ['dogecoin'] }, 'INVALID_CURRENCIES'],
            [{ ...validBallot, acceptDonations: 'yes' }, 'INVALID_ACCEPT'],
        ];

        for (const [body, code] of cases) {
            const result = await handleCommunityVoteSubmit(submit(body), env, USER_ID, NOW);
            expect(result.status).toBe(400);
            expect(result.body).toMatchObject({ code });
        }

        const malformed = await handleCommunityVoteSubmit(
            new Request('https://example.com/api/vote', { method: 'POST', body: '{' }),
            env,
            USER_ID,
            NOW,
        );
        expect(malformed.status).toBe(400);
        expect(malformed.body).toMatchObject({ code: 'INVALID_REQUEST' });
    });

    it('stores one ballot and replaces it on a later vote', async () => {
        const db = new FakeVoteDb();
        const env = envFor(db);
        db.users.set(USER_ID, NOW - 30 * DAY);

        const first = await handleCommunityVoteSubmit(submit(validBallot), env, USER_ID, NOW);
        expect(first.status).toBe(200);
        const firstBody = first.body as VoteSubmitResponse;
        expect(firstBody.ballot).toMatchObject({
            splitChoice: '30-30-40',
            currencies: ['bitcoin'],
            acceptDonations: true,
            hrtEligible: true,
        });
        expect(firstBody.tally.ballots).toBe(1);
        expect(firstBody.tally.split['30-30-40']).toBe(1);

        const second = await handleCommunityVoteSubmit(
            submit({
                splitChoice: '25-25-50',
                currencies: [],
                acceptDonations: false,
                hrtEligible: true,
            }),
            env,
            USER_ID,
            NOW + 60,
        );
        const secondBody = second.body as VoteSubmitResponse;
        expect(secondBody.tally.ballots).toBe(1);
        expect(secondBody.tally.split['30-30-40']).toBe(0);
        expect(secondBody.tally.split['25-25-50']).toBe(1);
        expect(secondBody.tally.currencies.bitcoin).toBe(0);
        expect(secondBody.tally.accept).toEqual({ yes: 0, no: 1 });
        expect(secondBody.ballot.createdAt).toBe(NOW);
        expect(secondBody.ballot.updatedAt).toBe(NOW + 60);

        const me = await handleCommunityVoteMe(env, USER_ID, NOW + 60);
        expect((me.body as VoteMe).ballot).toEqual(secondBody.ballot);
    });
});
