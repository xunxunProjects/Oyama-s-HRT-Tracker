-- One ballot per account for a one-off community funding vote.
--
-- The row keeps the account id so a voter can change their ballot and so a
-- deleted account takes its ballot with it. No endpoint returns voter ids:
-- the public tally is aggregate only. `currencies` is a JSON array of the
-- optional currency ids chosen; Monero is always supported and is not stored
-- here. `hrt_eligible` records the client's local check (the Worker cannot
-- read encrypted dose records), not a server-verified health fact.

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
);

-- Deletion paths delete by account; the primary key starts with vote_key, so
-- this index keeps that lookup from scanning every ballot.
CREATE INDEX IF NOT EXISTS idx_community_vote_ballots_user
    ON community_vote_ballots (user_id);
