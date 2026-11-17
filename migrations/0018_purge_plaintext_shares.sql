-- Shares are encrypted in the browser. Older rows were written before that
-- was mandatory, so expire and blank them rather than leave readable health
-- data in D1. The access endpoint also refuses any row that slips through.
UPDATE dosage_shares
SET snapshot_json = 'null',
    password_hash = NULL,
    key_wrapped = NULL,
    expires_at = unixepoch(),
    updated_at = unixepoch()
WHERE encrypted = 0;
