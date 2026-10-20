-- hrt:// pairing state. The raw TLS adapter is only a transport: these rows
-- belong to the web app so accounts, sessions, and the existing auth stack
-- stay in one place. Pairing rows expire after 12 hours; device rows are
-- revoked or expire on their own schedule.

CREATE TABLE IF NOT EXISTS hrt_pair_requests (
    id TEXT PRIMARY KEY,
    username_key TEXT NOT NULL,
    user_id TEXT,
    device_fingerprint TEXT NOT NULL,
    device_name TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    poll_secret_hash TEXT NOT NULL,
    ip_encrypted TEXT,
    country TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    approved_at INTEGER,
    denied_at INTEGER,
    session_id TEXT,
    token_issued_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hrt_pair_requests_user_time
    ON hrt_pair_requests (username_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hrt_pair_requests_expiry
    ON hrt_pair_requests (expires_at);

CREATE TABLE IF NOT EXISTS hrt_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hrt_devices_user
    ON hrt_devices (user_id, revoked_at);

CREATE TABLE IF NOT EXISTS hrt_holds (
    username_key TEXT PRIMARY KEY,
    hold_until INTEGER NOT NULL,
    blocked_count INTEGER NOT NULL DEFAULT 0,
    first_blocked_at INTEGER,
    last_blocked_at INTEGER
);

CREATE TABLE IF NOT EXISTS hrt_trusted_ips (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ip_encrypted TEXT NOT NULL,
    family INTEGER NOT NULL,
    prefix INTEGER NOT NULL,
    label TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hrt_trusted_ips_user
    ON hrt_trusted_ips (user_id);
