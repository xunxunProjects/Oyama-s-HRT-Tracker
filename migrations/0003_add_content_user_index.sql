-- The hot path. `content` was the only table whose indexes were never created
-- in production: every other table gets its indexes from an ensure*() call in
-- worker.ts, while content relied on schema.sql — which opens with DROP TABLE
-- and so is only ever run against a fresh local database.
--
-- Without this, `WHERE user_id = ? ORDER BY created_at DESC` was a full SCAN of
-- the whole table plus a temp B-tree sort: ~10,300 rows read to return the ~10
-- backups belonging to one user, on every backup-list and every backup-save.
-- Those two queries alone accounted for over 99% of the database's rows read.
--
-- The pair (user_id, created_at) satisfies the filter and the ordering together,
-- so the sort disappears as well; SQLite walks the index backwards for DESC.
CREATE INDEX IF NOT EXISTS idx_content_user_created ON content(user_id, created_at);

-- Superseded by the composite above, whose leftmost column is user_id.
-- Dropped where it exists so writes don't maintain two indexes for one lookup.
DROP INDEX IF EXISTS idx_content_user_id;
