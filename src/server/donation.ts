/**
 * The project's donation addresses.
 *
 * One address per currency: the 30/30/40 split is an internal distribution
 * promise, not three separate wallets. Stored in D1 so the Bitcoin address can
 * be rotated without a deploy; the page only asks for it after the vote closes,
 * but the values are public either way.
 */

export const DONATION_COLUMNS = 'monero_address, bitcoin_address, bitcoin_updated_at, updated_at';
export const MAX_DONATION_ADDRESS = 128;

export interface DonationEnv {
    DB: D1Database;
}

export interface DonationRow {
    monero_address: string;
    bitcoin_address: string;
    bitcoin_updated_at: string | null;
    updated_at: number;
}

export interface DonationAddresses {
    monero: string;
    bitcoin: string;
    bitcoinUpdatedAt: string | null;
    updatedAt: number;
}

export interface DonationDraft {
    monero: string;
    bitcoin: string;
    bitcoinUpdatedAt: string | null;
}

export function serializeDonation(row: DonationRow): DonationAddresses {
    return {
        monero: row.monero_address,
        bitcoin: row.bitcoin_address,
        bitcoinUpdatedAt: row.bitcoin_updated_at,
        updatedAt: row.updated_at,
    };
}

// Monero standard and subaddresses are 95 characters; integrated addresses are
// 106. The base58 alphabet excludes 0, O, I and l.
const MONERO_ADDRESS = /^[48][1-9A-HJ-NP-Za-km-z]{90,110}$/;
// Bech32, lower-case. The data part is alphanumeric here on purpose: this is a
// shape check, not a checksum, and rejecting a valid new prefix would be worse
// than accepting a malformed one the operator can see is wrong.
const BITCOIN_ADDRESS = /^(bc1|tb1)[a-z0-9]{11,71}$/;

export type DonationDraftResult = { ok: true; value: DonationDraft } | { ok: false; error: string };

/**
 * Validate and normalise an admin draft. Emptying both addresses clears the
 * public card; filling only one is a mistake, not a partial configuration.
 */
export function parseDonationDraft(body: unknown): DonationDraftResult {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'Invalid JSON body' };
    }
    const raw = body as Record<string, unknown>;
    const monero = typeof raw.monero === 'string' ? raw.monero.trim() : '';
    // Bech32 is case-insensitive and conventionally written lower-case.
    const bitcoin = typeof raw.bitcoin === 'string' ? raw.bitcoin.trim().toLowerCase() : '';

    const updatedRaw = raw.bitcoinUpdatedAt;
    if (updatedRaw != null && typeof updatedRaw !== 'string') {
        return { ok: false, error: 'bitcoinUpdatedAt must be a date or null' };
    }
    const updated = typeof updatedRaw === 'string' ? updatedRaw.trim() : '';

    if (!monero && !bitcoin) {
        return { ok: true, value: { monero: '', bitcoin: '', bitcoinUpdatedAt: null } };
    }
    if (!monero || !bitcoin) {
        return { ok: false, error: 'Both a Monero and a Bitcoin address are required' };
    }
    if (monero.length > MAX_DONATION_ADDRESS || bitcoin.length > MAX_DONATION_ADDRESS) {
        return { ok: false, error: 'Address is too long' };
    }
    if (!MONERO_ADDRESS.test(monero)) {
        return { ok: false, error: 'That does not look like a Monero address' };
    }
    if (!BITCOIN_ADDRESS.test(bitcoin)) {
        return { ok: false, error: 'That does not look like a Bitcoin address' };
    }
    if (updated) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) {
            return { ok: false, error: 'bitcoinUpdatedAt must be YYYY-MM-DD' };
        }
        const parsed = new Date(`${updated}T00:00:00Z`);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== updated) {
            return { ok: false, error: 'bitcoinUpdatedAt is not a real date' };
        }
    }

    return { ok: true, value: { monero, bitcoin, bitcoinUpdatedAt: updated || null } };
}

// Deploy-before-migration happens. Creating the table on first use keeps the
// public page working until the operator runs the migration, matching the
// community-vote bootstrap.
const schemaReady = new WeakSet<object>();

export async function ensureDonationSchema(env: DonationEnv): Promise<void> {
    if (schemaReady.has(env)) return;
    await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS donation_addresses (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            monero_address TEXT NOT NULL DEFAULT '',
            bitcoin_address TEXT NOT NULL DEFAULT '',
            bitcoin_updated_at TEXT,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )`,
    ).run();
    schemaReady.add(env);
}

/** Public read. Returns null until both addresses are configured. */
export async function handleDonationPublic(env: DonationEnv) {
    await ensureDonationSchema(env);
    const row = await env.DB.prepare(
        `SELECT ${DONATION_COLUMNS} FROM donation_addresses WHERE id = 1`,
    ).first<DonationRow>();
    const donation = row && row.monero_address && row.bitcoin_address ? serializeDonation(row) : null;
    return { status: 200, body: { donation } };
}
