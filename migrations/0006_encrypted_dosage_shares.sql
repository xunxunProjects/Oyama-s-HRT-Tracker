-- End-to-end encrypted dosage shares. `encrypted = 1` rows hold ciphertext the
-- server cannot read; the key lives only in the link's fragment. Existing rows
-- keep `encrypted = 0` and their plaintext snapshot until they expire.
-- `key_wrapped` holds a live share's link key sealed with the owner's cloud
-- backup key, so their other devices can keep the link updated.
ALTER TABLE dosage_shares ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dosage_shares ADD COLUMN key_wrapped TEXT;
