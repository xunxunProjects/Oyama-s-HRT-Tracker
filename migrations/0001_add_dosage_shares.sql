-- Non-destructive production migration for immutable dosage share snapshots.
CREATE TABLE IF NOT EXISTS dosage_shares (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    snapshot_json TEXT NOT NULL,
    password_hash TEXT,
    expires_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_dosage_shares_user_id ON dosage_shares(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dosage_shares_token_hash ON dosage_shares(token_hash);
CREATE INDEX IF NOT EXISTS idx_dosage_shares_expires_at ON dosage_shares(expires_at);
