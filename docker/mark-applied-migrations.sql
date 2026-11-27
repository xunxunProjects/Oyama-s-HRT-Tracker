-- Reconcile a database that predates `wrangler d1 migrations apply`.
--
-- Older deployments got their schema from schema.sql plus DDL the worker ran
-- lazily at request time, never from the numbered migrations, so wrangler's
-- ledger is empty even though the effects of 0001-0005 are present, and
-- 0002 / 0005 are ALTER TABLE ADD COLUMN, which fail on a column that exists.
-- Each statement records a migration as applied only when its effect is
-- already in the database, or fills in the idempotent parts of an effect that
-- is only half present. Safe to run any number of times, on any database; a
-- fresh one matches nothing and every migration runs normally. Run it
-- through docker/reconcile.mjs, which first adds users.totp_last_step to a
-- database that has only half of 0005.
CREATE TABLE IF NOT EXISTS d1_migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO d1_migrations (name) SELECT '0001_add_dosage_shares.sql'
    WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dosage_shares');
INSERT OR IGNORE INTO d1_migrations (name) SELECT '0002_add_live_dosage_shares.sql'
    WHERE EXISTS (SELECT 1 FROM pragma_table_info('dosage_shares') WHERE name = 'updated_at');
INSERT OR IGNORE INTO d1_migrations (name) SELECT '0003_add_content_user_index.sql'
    WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_content_user_created');
INSERT OR IGNORE INTO d1_migrations (name) SELECT '0004_add_site_notice.sql'
    WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'site_notice');
INSERT OR IGNORE INTO d1_migrations (name) SELECT '0005_users_totp_columns.sql'
    WHERE EXISTS (SELECT 1 FROM pragma_table_info('users') WHERE name = 'totp_last_step');

-- 0017 can be half applied in the same way: the worker lazily creates
-- donation_addresses.monero_payout_address and donation_trades on the first
-- donation request (src/server/donation.ts) before the ledger records 0017.
-- Its ADD COLUMN is unconditional, so a database with that column would fail
-- the migration on every start. Recreate the idempotent parts first, then
-- record 0017; a fresh database matches nothing and 0017 still runs normally.
CREATE TABLE IF NOT EXISTS donation_trades (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    ticker_from TEXT,
    network_from TEXT,
    amount_from TEXT,
    amount_to TEXT,
    payload TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_donation_trades_created_at ON donation_trades(created_at);
INSERT OR IGNORE INTO d1_migrations (name) SELECT '0017_donation_trocador.sql'
    WHERE EXISTS (
        SELECT 1 FROM pragma_table_info('donation_addresses') WHERE name = 'monero_payout_address'
    );
