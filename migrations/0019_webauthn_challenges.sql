CREATE TABLE IF NOT EXISTS webauthn_challenges (
    challenge_hash TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    user_id TEXT,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expiry ON webauthn_challenges (expires_at);
