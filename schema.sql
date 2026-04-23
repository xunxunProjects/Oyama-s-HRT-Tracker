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
CREATE INDEX idx_content_user_id ON content(user_id);

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
