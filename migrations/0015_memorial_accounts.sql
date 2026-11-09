-- An admin can keep an account as a memorial. While memorial_at is set, the
-- account keeps its backups and share links as they are, but nobody can sign
-- in to it or change it. Clearing it back to NULL makes it an ordinary
-- account again.
ALTER TABLE users ADD COLUMN memorial_at INTEGER;
