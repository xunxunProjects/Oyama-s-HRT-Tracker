-- The two project donation addresses, one per supported currency.
--
-- A single row: the 30/30/40 split is an internal distribution promise, not
-- three separate wallets. Keeping the addresses in D1 rather than in the
-- client bundle lets the operator rotate the Bitcoin address (for donor
-- privacy) without shipping a new frontend. The values are public; the page
-- only asks for them after the vote closes.

CREATE TABLE IF NOT EXISTS donation_addresses (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    monero_address TEXT NOT NULL DEFAULT '',
    bitcoin_address TEXT NOT NULL DEFAULT '',
    bitcoin_updated_at TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO donation_addresses (id) VALUES (1);
