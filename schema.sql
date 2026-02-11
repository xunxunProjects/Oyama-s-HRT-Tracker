DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret TEXT,
    totp_enabled INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
);

DROP TABLE IF EXISTS content;
CREATE TABLE content (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    data TEXT,
    encrypted INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
