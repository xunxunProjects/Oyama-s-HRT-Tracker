-- Opt-in F2F cohort escrow keys.
--
-- The operator provisions a pool of OpenPGP key pairs offline. The server
-- stores the public key and an AES-GCM envelope of the private key under
-- HRT_ESCROW_KEY, then assigns one available key to each new cohort. The
-- private key is never returned by an API and is not used by this service to
-- read member data; it exists so an audited recovery path can open escrowed
-- copies later.

CREATE TABLE IF NOT EXISTS f2f_escrow_keys (
    id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    private_key_encrypted TEXT NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL DEFAULT 'available'
        CHECK (state IN ('available', 'assigned', 'retired', 'deleted')),
    cohort_id TEXT,
    created_at INTEGER NOT NULL,
    assigned_at INTEGER,
    retired_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_f2f_escrow_keys_state
    ON f2f_escrow_keys (state, created_at);
