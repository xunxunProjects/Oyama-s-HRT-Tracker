-- Reconcile a database that predates `wrangler d1 migrations apply`.
--
-- Older deployments got their schema from schema.sql plus DDL the worker ran
-- lazily at request time, never from the numbered migrations — so wrangler's
-- ledger is empty even though the effects of 0001–0005 are all present, and
-- 0002 / 0005 are ALTER TABLE ADD COLUMN, which fail on a column that exists.
-- Each statement records a migration as applied only when its effect is
-- already in the database. Safe to run any number of times, on any database;
-- a fresh one matches nothing and every migration runs normally.
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
