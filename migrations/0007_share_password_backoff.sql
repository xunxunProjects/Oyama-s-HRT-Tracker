-- Persistent password-guessing backoff for shares. The rate-limit binding is
-- per-isolate memory, so a guesser could reset the in-memory budget by landing
-- on another isolate (or another colo). Lockout state that has to hold across
-- isolates lives with the share row instead. `failed_attempts` counts
-- consecutive wrong passwords; `locked_until` is a unix-seconds timestamp set
-- by exponential backoff once the count crosses the threshold.
ALTER TABLE dosage_shares ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dosage_shares ADD COLUMN locked_until INTEGER;
