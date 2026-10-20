-- Persistent sign-in backoff, the account-side twin of 0007's share lock. The
-- rate-limit bindings are per-isolate memory, so a guesser could outlast them
-- by landing on another isolate or colo; this count lives in the database.
-- `account` is the lowercased username (the env-managed admin included), so
-- a row exists only for names that have had a failed sign-in. `failed_attempts`
-- counts consecutive misses; `locked_until` is a unix-seconds timestamp set by
-- exponential backoff once the count reaches five.
CREATE TABLE IF NOT EXISTS login_backoff (
    account TEXT PRIMARY KEY,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER
);
