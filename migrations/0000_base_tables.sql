-- The tables the worker always assumed were there.
--
-- Until this file existed they came from three places that disagreed with each
-- other: schema.sql (opened with DROP TABLE, so only ever true for a fresh
-- database), docker/schema.sql (a subset), and CREATE TABLE IF NOT EXISTS
-- statements the worker ran lazily on every cold isolate. This is the base
-- that migrations 0001+ build on, written so it is a no-op on any database
-- that already has them.
--
-- dosage_shares and site_notice are deliberately absent: 0001 and 0004 create
-- them, and 0002 ALTERs dosage_shares, which would fail on a table created here
-- with the columns already present.

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

-- Cloud backups: one encrypted full copy per row, pruned by backupPolicy.ts.
CREATE TABLE IF NOT EXISTS content (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    data TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    last_used_at INTEGER DEFAULT (unixepoch()),
    device_info TEXT,
    ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Anonymous deletion log for the public Transparency page. No user_id, no
-- username — only the reason and timestamps, for aggregate statistics.
CREATE TABLE IF NOT EXISTS deletion_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reason TEXT NOT NULL, -- 'self' | 'admin'
    user_created_at INTEGER,
    deleted_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_deletion_log_deleted_at ON deletion_log(deleted_at);
CREATE INDEX IF NOT EXISTS idx_deletion_log_reason ON deletion_log(reason);

-- WebAuthn / Passkey credentials. public_key_x / public_key_y are base64url
-- P-256 coordinates.
CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key_x TEXT NOT NULL,
    public_key_y TEXT NOT NULL,
    counter INTEGER DEFAULT 0,
    device_name TEXT,
    created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_cred_id ON passkeys(credential_id);

-- 2FA backup codes (single-use, HMAC-hashed).
CREATE TABLE IF NOT EXISTS backup_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    used_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_backup_codes_user_id ON backup_codes(user_id);

-- The D1-backed rate limiter this replaced. Limits now come from the Workers
-- Rate Limiting binding (wrangler.toml), so the table is dead weight.
DROP TABLE IF EXISTS rate_limits;
