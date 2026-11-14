-- Donations are held in Monero only.
--
-- `monero_address` (created by 0016) is the public direct-donation subaddress.
-- `monero_payout_address` is a different subaddress used only by Trocador for
-- invoices paid in BTC/ETH/other coins. It is never returned by the public API.
-- The old bitcoin_address columns stay for backwards compatibility but are no
-- longer read by the app.

ALTER TABLE donation_addresses ADD COLUMN monero_payout_address TEXT NOT NULL DEFAULT '';

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
