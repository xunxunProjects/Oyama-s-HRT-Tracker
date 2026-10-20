-- F2F (face-to-face) cohort registry.
--
-- One cohort ("bus") has 100 numbered seats. A seat is assigned once and is
-- never reused, even after the account is deleted: the row remains as a
-- tombstone so numbering stays stable. A new cohort starts when all 100 seats
-- have rows. Member public keys are public data; private keys never reach the
-- server unless an operator enables the separate escrow mode.

CREATE TABLE IF NOT EXISTS f2f_cohorts (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'active'
        CHECK (state IN ('active', 'full', 'retired', 'revoked', 'archived', 'deleted')),
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    retired_at INTEGER,
    revoked_at INTEGER,
    -- Reserved for the optional cohort escrow key. The private-key column is
    -- an AES-GCM envelope under HRT_ESCROW_KEY, never plaintext.
    escrow_public_key TEXT,
    escrow_private_key_encrypted TEXT,
    escrow_fingerprint TEXT
);

CREATE INDEX IF NOT EXISTS idx_f2f_cohorts_state
    ON f2f_cohorts (state, created_at);

CREATE TABLE IF NOT EXISTS f2f_seats (
    cohort_id TEXT NOT NULL,
    seat INTEGER NOT NULL CHECK (seat BETWEEN 1 AND 100),
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deleted')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    PRIMARY KEY (cohort_id, seat),
    UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_f2f_seats_cohort_status
    ON f2f_seats (cohort_id, status, seat);

CREATE TABLE IF NOT EXISTS f2f_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    cohort_id TEXT NOT NULL,
    seat INTEGER NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'retired', 'revoked')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    retired_at INTEGER,
    revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_f2f_keys_user
    ON f2f_keys (user_id, status);
CREATE INDEX IF NOT EXISTS idx_f2f_keys_cohort
    ON f2f_keys (cohort_id, status, seat);
