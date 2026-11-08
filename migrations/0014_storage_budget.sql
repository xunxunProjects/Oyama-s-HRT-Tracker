-- A global budget for user-supplied content. The worker checks the counter
-- before writes, and these triggers keep it exact across inserts, updates and
-- deletes (including retention pruning and expired-share scrubbing). The
-- default sits below D1's 10 GB database cap so a flood cannot turn every
-- write for every user into an outage.

CREATE TABLE IF NOT EXISTS storage_usage (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    bytes INTEGER NOT NULL DEFAULT 0,
    limit_bytes INTEGER NOT NULL DEFAULT 9663676416
);

INSERT OR IGNORE INTO storage_usage (id, bytes, limit_bytes) VALUES (1, 0, 9663676416);

UPDATE storage_usage
   SET bytes = COALESCE((SELECT SUM(LENGTH(CAST(data AS BLOB))) FROM content WHERE data IS NOT NULL), 0)
             + COALESCE((SELECT SUM(LENGTH(CAST(snapshot_json AS BLOB))) FROM dosage_shares WHERE snapshot_json IS NOT NULL), 0)
 WHERE id = 1;

CREATE TRIGGER IF NOT EXISTS storage_content_guard_insert
BEFORE INSERT ON content
WHEN (
    SELECT bytes + LENGTH(CAST(COALESCE(NEW.data, '') AS BLOB)) > limit_bytes
      FROM storage_usage WHERE id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'STORAGE_BUDGET_EXCEEDED');
END;

CREATE TRIGGER IF NOT EXISTS storage_content_guard_update
BEFORE UPDATE OF data ON content
WHEN (
    SELECT bytes - LENGTH(CAST(COALESCE(OLD.data, '') AS BLOB)) + LENGTH(CAST(COALESCE(NEW.data, '') AS BLOB)) > limit_bytes
      FROM storage_usage WHERE id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'STORAGE_BUDGET_EXCEEDED');
END;

CREATE TRIGGER IF NOT EXISTS storage_content_used_insert
AFTER INSERT ON content
BEGIN
    UPDATE storage_usage
       SET bytes = bytes + LENGTH(CAST(COALESCE(NEW.data, '') AS BLOB))
     WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS storage_content_used_update
AFTER UPDATE OF data ON content
BEGIN
    UPDATE storage_usage
       SET bytes = bytes - LENGTH(CAST(COALESCE(OLD.data, '') AS BLOB)) + LENGTH(CAST(COALESCE(NEW.data, '') AS BLOB))
     WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS storage_content_used_delete
AFTER DELETE ON content
BEGIN
    UPDATE storage_usage
       SET bytes = bytes - LENGTH(CAST(COALESCE(OLD.data, '') AS BLOB))
     WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS storage_share_guard_insert
BEFORE INSERT ON dosage_shares
WHEN (
    SELECT bytes + LENGTH(CAST(COALESCE(NEW.snapshot_json, '') AS BLOB)) > limit_bytes
      FROM storage_usage WHERE id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'STORAGE_BUDGET_EXCEEDED');
END;

CREATE TRIGGER IF NOT EXISTS storage_share_guard_update
BEFORE UPDATE OF snapshot_json ON dosage_shares
WHEN (
    SELECT bytes - LENGTH(CAST(COALESCE(OLD.snapshot_json, '') AS BLOB)) + LENGTH(CAST(COALESCE(NEW.snapshot_json, '') AS BLOB)) > limit_bytes
      FROM storage_usage WHERE id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'STORAGE_BUDGET_EXCEEDED');
END;

CREATE TRIGGER IF NOT EXISTS storage_share_used_insert
AFTER INSERT ON dosage_shares
BEGIN
    UPDATE storage_usage
       SET bytes = bytes + LENGTH(CAST(COALESCE(NEW.snapshot_json, '') AS BLOB))
     WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS storage_share_used_update
AFTER UPDATE OF snapshot_json ON dosage_shares
BEGIN
    UPDATE storage_usage
       SET bytes = bytes - LENGTH(CAST(COALESCE(OLD.snapshot_json, '') AS BLOB)) + LENGTH(CAST(COALESCE(NEW.snapshot_json, '') AS BLOB))
     WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS storage_share_used_delete
AFTER DELETE ON dosage_shares
BEGIN
    UPDATE storage_usage
       SET bytes = bytes - LENGTH(CAST(COALESCE(OLD.snapshot_json, '') AS BLOB))
     WHERE id = 1;
END;
