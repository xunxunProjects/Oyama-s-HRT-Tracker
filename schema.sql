DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

DROP TABLE IF EXISTS content;
CREATE TABLE content (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    slot TEXT DEFAULT 'default',
    data TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, slot)
);
