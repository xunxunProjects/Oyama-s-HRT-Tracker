-- Site-wide announcement banner, shown to signed-out visitors too.
-- Single row, id 1. See schema.sql for why clearing blanks the body instead of
-- deleting the row.
CREATE TABLE IF NOT EXISTS site_notice (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    body TEXT NOT NULL,
    body_i18n TEXT,
    level TEXT NOT NULL DEFAULT 'info',
    starts_at INTEGER,
    expires_at INTEGER,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
