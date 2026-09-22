-- TOTP state on the user row. The worker used to add these with a try/catch
-- ALTER on first use; a fresh database now gets them here, after 0000 has
-- created the table. An existing database already has them — see
-- docker/mark-applied-migrations.sql for how it is told this migration is done.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
-- Highest TOTP step already accepted, so a code cannot be replayed inside its
-- validity window. See consumeTOTP in worker.ts.
ALTER TABLE users ADD COLUMN totp_last_step INTEGER;
