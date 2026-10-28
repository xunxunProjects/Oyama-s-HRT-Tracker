import {
    ADDITIONAL_CURRENCY_MAJORITY,
    ALWAYS_SUPPORTED_CURRENCY,
    buildVoteTally,
    COMMUNITY_VOTE_CLOSES_AT,
    COMMUNITY_VOTE_KEY,
    COMMUNITY_VOTE_OPENS_AT,
    isSplitOptionId,
    isVoteAcceptingBallots,
    MIN_ACCOUNT_AGE_DAYS,
    MIN_HRT_DAYS,
    normalizeAdditionalCurrencies,
    PROPOSED_SPLIT_ID,
    voteStatusAt,
    type AdditionalCurrencyId,
    type VoteBallot,
    type VoteMe,
    type VotePublic,
    type VoteSubmitResponse,
    type VoteTally,
} from './communityVote';
import { readSmallJsonBody } from './requestInput';

/** The only binding these handlers use; keeps this module independent of worker.ts. */
export interface VoteEnv {
    DB: D1Database;
}

export interface VoteHandlerResult {
    status: number;
    body: unknown;
}

interface BallotRow {
    split_choice: string;
    currencies: string;
    accept_donations: number;
    hrt_eligible: number;
    created_at: number;
    updated_at: number;
}

interface AccountRow {
    created_at: number | null;
}

const nowSeconds = (now?: number) => now ?? Math.floor(Date.now() / 1000);

/**
 * Bootstrap for the deploy-window failure where the Worker goes live before
 * migration 0013 is applied. This mirrors that migration exactly; the
 * migration remains the canonical schema. It is idempotent, so once the table
 * exists both statements are no-ops. Remove this block after operators have
 * applied 0013 everywhere.
 */
const COMMUNITY_VOTE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS community_vote_ballots (
    vote_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    split_choice TEXT NOT NULL CHECK (split_choice IN ('30-30-40', '25-25-50', '40-40-20', '10-10-80')),
    currencies TEXT NOT NULL DEFAULT '[]',
    accept_donations INTEGER NOT NULL CHECK (accept_donations IN (0, 1)),
    hrt_eligible INTEGER NOT NULL CHECK (hrt_eligible IN (0, 1)),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (vote_key, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`;

const COMMUNITY_VOTE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_community_vote_ballots_user
    ON community_vote_ballots (user_id)`;

const schemaPromises = new WeakMap<object, Promise<void>>();

async function bootstrapCommunityVoteSchema(env: VoteEnv): Promise<void> {
    const key = env.DB as unknown as object;
    const pending = schemaPromises.get(key);
    if (pending) return pending;

    const promise = (async () => {
        await env.DB.prepare(COMMUNITY_VOTE_TABLE_SQL).run();
        await env.DB.prepare(COMMUNITY_VOTE_INDEX_SQL).run();
    })();
    schemaPromises.set(key, promise);
    try {
        await promise;
    } catch (err) {
        // A transient D1 failure should be retried by the next request rather
        // than cached for the lifetime of the isolate.
        schemaPromises.delete(key);
        throw err;
    }
}

/**
 * Best-effort schema preparation. If it fails, the caller's real query still
 * surfaces the usual SCHEMA_OUTDATED response; a transient bootstrap failure
 * must not turn into a 500.
 */
export async function ensureCommunityVoteSchema(env: VoteEnv): Promise<void> {
    try {
        await bootstrapCommunityVoteSchema(env);
    } catch (err) {
        console.error('Community vote schema bootstrap failed:', err);
    }
}

const response = (status: number, body: unknown): VoteHandlerResult => ({ status, body });

const error = (status: number, code: string, message: string): VoteHandlerResult => response(status, { code, message });

const parseCurrencies = (raw: unknown): AdditionalCurrencyId[] => {
    if (typeof raw !== 'string') return [];
    try {
        return normalizeAdditionalCurrencies(JSON.parse(raw)) ?? [];
    } catch {
        return [];
    }
};

const ballotFromRow = (row: BallotRow | null): VoteBallot | null => {
    if (!row || !isSplitOptionId(row.split_choice)) return null;
    return {
        splitChoice: row.split_choice,
        currencies: parseCurrencies(row.currencies),
        acceptDonations: row.accept_donations === 1,
        hrtEligible: row.hrt_eligible === 1,
        createdAt: Number(row.created_at) || 0,
        updatedAt: Number(row.updated_at) || 0,
    };
};

async function readTally(env: VoteEnv): Promise<VoteTally> {
    const { results } = await env.DB.prepare(
        `SELECT split_choice, currencies, accept_donations
           FROM community_vote_ballots
          WHERE vote_key = ?`,
    )
        .bind(COMMUNITY_VOTE_KEY)
        .all<Pick<BallotRow, 'split_choice' | 'currencies' | 'accept_donations'>>();

    return buildVoteTally(
        (results ?? []).map(row => ({
            splitChoice: row.split_choice,
            currencies: parseCurrencies(row.currencies),
            acceptDonations: row.accept_donations === 1,
        })),
    );
}

interface AccountState {
    found: boolean;
    createdAt: number | null;
    ageDays: number;
    eligible: boolean;
}

async function readAccount(env: VoteEnv, userId: string, now: number): Promise<AccountState> {
    const row = (await env.DB.prepare('SELECT created_at FROM users WHERE id = ?')
        .bind(userId)
        .first<AccountRow>()) as AccountRow | null;
    const createdAt =
        row && typeof row.created_at === 'number' && Number.isFinite(row.created_at) && row.created_at > 0
            ? row.created_at
            : null;
    const ageDays = createdAt === null ? 0 : Math.max(0, Math.floor((now - createdAt) / 86400));
    return {
        found: !!row,
        createdAt,
        ageDays,
        eligible: createdAt !== null && now - createdAt >= MIN_ACCOUNT_AGE_DAYS * 86400,
    };
}

async function readMyBallot(env: VoteEnv, userId: string): Promise<VoteBallot | null> {
    const row = (await env.DB.prepare(
        `SELECT split_choice, currencies, accept_donations, hrt_eligible, created_at, updated_at
           FROM community_vote_ballots
          WHERE vote_key = ? AND user_id = ?`,
    )
        .bind(COMMUNITY_VOTE_KEY, userId)
        .first<BallotRow>()) as BallotRow | null;
    return ballotFromRow(row);
}

/** Public proposal status and aggregate tally. No account information. */
export async function handleCommunityVotePublic(env: VoteEnv, now = nowSeconds()): Promise<VoteHandlerResult> {
    await ensureCommunityVoteSchema(env);
    const tally = await readTally(env);
    const body: VotePublic = {
        vote: {
            key: COMMUNITY_VOTE_KEY,
            opensAt: COMMUNITY_VOTE_OPENS_AT,
            closesAt: COMMUNITY_VOTE_CLOSES_AT,
            status: voteStatusAt(now),
            acceptsBallots: isVoteAcceptingBallots(now),
            serverTime: now,
            minAccountAgeDays: MIN_ACCOUNT_AGE_DAYS,
            minHrtDays: MIN_HRT_DAYS,
            proposedSplit: PROPOSED_SPLIT_ID,
            alwaysSupportedCurrency: ALWAYS_SUPPORTED_CURRENCY,
            additionalCurrencyMajority: ADDITIONAL_CURRENCY_MAJORITY,
        },
        tally,
    };
    return response(200, body);
}

/** The signed-in account's age and existing ballot. */
export async function handleCommunityVoteMe(
    env: VoteEnv,
    userId: string,
    now = nowSeconds(),
): Promise<VoteHandlerResult> {
    await ensureCommunityVoteSchema(env);
    const account = await readAccount(env, userId, now);
    if (!account.found) return error(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const ballot = await readMyBallot(env, userId);
    const body: VoteMe = {
        accountCreatedAt: account.createdAt,
        accountAgeDays: account.ageDays,
        accountEligible: account.eligible,
        ballot,
    };
    return response(200, body);
}

/**
 * Record or replace one account's ballot.
 *
 * The HRT check runs in the browser because the Worker cannot read encrypted
 * dose records. The request carries only the yes/no result; the server checks
 * that it is true, not how many days were counted.
 */
export async function handleCommunityVoteSubmit(
    request: Request,
    env: VoteEnv,
    userId: string,
    now = nowSeconds(),
): Promise<VoteHandlerResult> {
    await ensureCommunityVoteSchema(env);
    if (!isVoteAcceptingBallots(now)) return error(409, 'VOTE_CLOSED', 'Voting has closed');

    const parsed = await readSmallJsonBody(request);
    if (!parsed.ok) {
        return parsed.tooLarge
            ? error(413, 'TOO_LARGE', 'Request body is too large')
            : error(400, 'INVALID_REQUEST', 'Invalid JSON body');
    }
    const body = parsed.value as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return error(400, 'INVALID_REQUEST', 'Invalid ballot');
    }

    if (!isSplitOptionId(body.splitChoice)) {
        return error(400, 'INVALID_SPLIT', 'Unknown split option');
    }
    const currencies = normalizeAdditionalCurrencies(body.currencies);
    if (currencies === null) {
        return error(400, 'INVALID_CURRENCIES', 'Unknown currency option');
    }
    if (typeof body.acceptDonations !== 'boolean') {
        return error(400, 'INVALID_ACCEPT', 'Choose whether to accept donations');
    }
    if (body.hrtEligible !== true) {
        return error(403, 'HRT_INELIGIBLE', 'The local HRT requirement is not met');
    }

    const account = await readAccount(env, userId, now);
    if (!account.found) return error(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    if (!account.eligible) {
        return error(403, 'ACCOUNT_TOO_NEW', `An account must be at least ${MIN_ACCOUNT_AGE_DAYS} days old to vote`);
    }

    await env.DB.prepare(
        `INSERT INTO community_vote_ballots
             (vote_key, user_id, split_choice, currencies, accept_donations, hrt_eligible, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(vote_key, user_id) DO UPDATE SET
             split_choice = excluded.split_choice,
             currencies = excluded.currencies,
             accept_donations = excluded.accept_donations,
             hrt_eligible = excluded.hrt_eligible,
             updated_at = excluded.updated_at`,
    )
        .bind(
            COMMUNITY_VOTE_KEY,
            userId,
            body.splitChoice,
            JSON.stringify(currencies),
            body.acceptDonations ? 1 : 0,
            now,
            now,
        )
        .run();

    const ballot = await readMyBallot(env, userId);
    if (!ballot) return error(500, 'INTERNAL', 'Ballot was not stored');

    const tally = await readTally(env);
    const result: VoteSubmitResponse = { ballot, tally };
    return response(200, result);
}
