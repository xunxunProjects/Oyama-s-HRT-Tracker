DROP TABLE IF EXISTS dosage_shares;
DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret TEXT,
    created_at INTEGER DEFAULT (unixepoch())
);

DROP TABLE IF EXISTS content;
CREATE TABLE content (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    data TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
-- Composite so `WHERE user_id = ? ORDER BY created_at DESC` is served entirely
-- from the index, with no temp B-tree sort. See migrations/0003.
CREATE INDEX idx_content_user_created ON content(user_id, created_at);

DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    last_used_at INTEGER DEFAULT (unixepoch()),
    device_info TEXT,
    ip TEXT
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Anonymous deletion log for the public Transparency page.
-- We intentionally DO NOT store user_id, username, or any other PII —
-- only the reason and timestamps, for aggregate statistics.
DROP TABLE IF EXISTS deletion_log;
CREATE TABLE deletion_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reason TEXT NOT NULL, -- 'self' | 'admin'
    user_created_at INTEGER,
    deleted_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_deletion_log_deleted_at ON deletion_log(deleted_at);
CREATE INDEX idx_deletion_log_reason ON deletion_log(reason);

-- WebAuthn / Passkey credentials for passwordless login.
-- public_key_x / public_key_y are base64url-encoded EC P-256 coordinates.
DROP TABLE IF EXISTS passkeys;
CREATE TABLE passkeys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,  -- base64url authenticator credential ID
    public_key_x TEXT NOT NULL,          -- base64url P-256 x coordinate
    public_key_y TEXT NOT NULL,          -- base64url P-256 y coordinate
    counter INTEGER DEFAULT 0,           -- sign counter for clone detection
    device_name TEXT,                    -- user-agent hint stored at registration
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_passkeys_user_id ON passkeys(user_id);
CREATE INDEX idx_passkeys_cred_id ON passkeys(credential_id);

-- 2FA backup codes (single-use, HMAC-hashed).
DROP TABLE IF EXISTS backup_codes;
CREATE TABLE backup_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,  -- HMAC-SHA256 hex of normalized code (lowercased, dashes removed)
    used_at INTEGER,          -- NULL = unused
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_backup_codes_user_id ON backup_codes(user_id);

-- Privacy-minimized dosage snapshots shared through high-entropy bearer links.
-- Static snapshots are immutable; live snapshots can be refreshed by owners.
-- Only the token digest is stored; passwords use bcrypt hashes.
CREATE TABLE dosage_shares (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    snapshot_json TEXT NOT NULL,
    password_hash TEXT,
    expires_at INTEGER,
    is_live INTEGER NOT NULL DEFAULT 0,
    share_mode TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_dosage_shares_user_id ON dosage_shares(user_id);
CREATE UNIQUE INDEX idx_dosage_shares_token_hash ON dosage_shares(token_hash);
CREATE INDEX idx_dosage_shares_expires_at ON dosage_shares(expires_at);

-- The operator's one site-wide banner. A single row, id 1.
-- Taking a notice down blanks `body` rather than deleting the row: clients
-- remember the `revision` they dismissed, so the counter has to stay monotonic
-- for the life of the table or a fresh notice would inherit an old dismissal.
-- `body_i18n` is an optional JSON map of locale -> text; clients fall back to
-- `body` for any locale it does not cover.
DROP TABLE IF EXISTS site_notice;
CREATE TABLE site_notice (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    body TEXT NOT NULL,
    body_i18n TEXT,
    level TEXT NOT NULL DEFAULT 'info', -- 'info' | 'warn'
    starts_at INTEGER,                  -- NULL = live as soon as it is saved
    expires_at INTEGER,                 -- NULL = until an admin clears it
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
