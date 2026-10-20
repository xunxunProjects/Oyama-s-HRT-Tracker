-- One-time codes that let the web UI authorise the F2F CLI without copying a
-- full web session token to the command line host. Only the SHA-256 of each
-- code is stored. A code is valid for ten minutes and can be exchanged once;
-- the exchange mints a session JWT scoped to /api/f2f/* only.

CREATE TABLE IF NOT EXISTS f2f_cli_codes (
    code_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_f2f_cli_codes_user
    ON f2f_cli_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_f2f_cli_codes_expiry
    ON f2f_cli_codes (expires_at);
