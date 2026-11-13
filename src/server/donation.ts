/**
 * Donation configuration and the Trocador trade ledger.
 *
 * Only Monero is held. The `monero_address` is the public direct-donation
 * subaddress; `monero_payout_address` is a different subaddress that Trocador
 * uses for swapped BTC/ETH/other coins. The payout address is never returned by
 * the public API.
 *
 * Stored in D1 so either address can be rotated without a deploy. The page only
 * asks for them after the vote closes, but the values are public either way.
 */

import { keccak_256 } from '@noble/hashes/sha3.js';

import type { TrocadorTrade } from './trocador';

export const DONATION_COLUMNS = 'monero_address, monero_payout_address, updated_at';
export const MAX_DONATION_ADDRESS = 128;

export interface DonationEnv {
    DB: D1Database;
}

export interface DonationRow {
    monero_address: string;
    monero_payout_address: string;
    updated_at: number;
}

export interface DonationAddresses {
    monero: string;
    moneroPayout: string;
    updatedAt: number;
}

export interface DonationDraft {
    monero: string;
    moneroPayout: string;
}

export interface PublicDonation {
    monero: string;
}

export interface PublicDonationBody {
    donation: PublicDonation | null;
    trocador: boolean;
}

export function serializeDonation(row: DonationRow): DonationAddresses {
    return {
        monero: row.monero_address,
        moneroPayout: row.monero_payout_address,
        updatedAt: row.updated_at,
    };
}

const MONERO_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
// Indexed by decoded byte count; the value is the encoded block length. The
// final block can only be 2, 3, 5, 6, 7, 9, 10 or 11 characters.
const MONERO_BLOCK_SIZES = [0, 2, 3, 5, 6, 7, 9, 10, 11];
const MAINNET_PREFIXES = new Set([18, 19, 42, 43]);

function decodeMoneroBase58(value: string): Uint8Array | null {
    const bytes: number[] = [];
    for (let offset = 0; offset < value.length; offset += 11) {
        const block = value.slice(offset, offset + 11);
        const size = MONERO_BLOCK_SIZES.indexOf(block.length);
        if (size < 1) return null;

        let number = 0n;
        for (const char of block) {
            const digit = MONERO_ALPHABET.indexOf(char);
            if (digit < 0) return null;
            number = number * 58n + BigInt(digit);
        }

        const chunk = new Uint8Array(size);
        for (let i = size - 1; i >= 0; i--) {
            chunk[i] = Number(number & 0xffn);
            number >>= 8n;
        }
        if (number !== 0n) return null;
        bytes.push(...chunk);
    }
    return Uint8Array.from(bytes);
}

/**
 * Full Monero address validation: Base58, mainnet prefix and Keccak-256
 * checksum. A typo must fail here rather than become a black-hole address.
 */
export function validateMoneroAddress(address: string): boolean {
    const value = address.trim();
    if (value.length !== 95 && value.length !== 106) return false;
    const decoded = decodeMoneroBase58(value);
    if (!decoded) return false;
    if (decoded.length !== 69 && decoded.length !== 77) return false;
    if (!MAINNET_PREFIXES.has(decoded[0])) return false;

    const payload = decoded.slice(0, -4);
    const checksum = decoded.slice(-4);
    const hash = keccak_256(payload);
    for (let i = 0; i < 4; i++) {
        if (hash[i] !== checksum[i]) return false;
    }
    return true;
}

export type DonationDraftResult = { ok: true; value: DonationDraft } | { ok: false; error: string };

/**
 * Validate an admin draft. Emptying both addresses clears the public card;
 * either address can be configured on its own. The two Monero addresses must be
 * different: reusing the direct address as the Trocador payout would link every
 * swap to the public donation address.
 */
export function parseDonationDraft(body: unknown): DonationDraftResult {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'Invalid JSON body' };
    }
    const raw = body as Record<string, unknown>;
    if (raw.monero != null && typeof raw.monero !== 'string') {
        return { ok: false, error: 'monero must be a string' };
    }
    if (raw.moneroPayout != null && typeof raw.moneroPayout !== 'string') {
        return { ok: false, error: 'moneroPayout must be a string' };
    }
    const monero = typeof raw.monero === 'string' ? raw.monero.trim() : '';
    const moneroPayout = typeof raw.moneroPayout === 'string' ? raw.moneroPayout.trim() : '';

    if (monero.length > MAX_DONATION_ADDRESS || moneroPayout.length > MAX_DONATION_ADDRESS) {
        return { ok: false, error: 'Address is too long' };
    }
    if (monero && !validateMoneroAddress(monero)) {
        return { ok: false, error: 'That does not look like a Monero address' };
    }
    if (moneroPayout && !validateMoneroAddress(moneroPayout)) {
        return { ok: false, error: 'The Trocador payout address is not a valid Monero address' };
    }
    if (monero && moneroPayout && monero === moneroPayout) {
        return { ok: false, error: 'Use a different subaddress for the Trocador payout' };
    }
    return { ok: true, value: { monero, moneroPayout } };
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
            monero_payout_address TEXT NOT NULL DEFAULT '',
            monero_payout_updated_at TEXT,
            bitcoin_address TEXT NOT NULL DEFAULT '',
            bitcoin_updated_at TEXT,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )`,
    ).run();
    // Existing deployments already have the 0016 table without this column.
    await env.DB.prepare(`ALTER TABLE donation_addresses ADD COLUMN monero_payout_address TEXT NOT NULL DEFAULT ''`)
        .run()
        .catch(() => undefined);
    await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS donation_trades (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            ticker_from TEXT,
            network_from TEXT,
            amount_from TEXT,
            amount_to TEXT,
            payload TEXT,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )`,
    ).run();
    schemaReady.add(env);
}

/** Public read. Returns only the direct address; the payout stays private. */
export async function handleDonationPublic(env: DonationEnv): Promise<{
    status: number;
    body: PublicDonationBody;
}> {
    await ensureDonationSchema(env);
    const row = await env.DB.prepare(
        `SELECT ${DONATION_COLUMNS} FROM donation_addresses WHERE id = 1`,
    ).first<DonationRow>();
    return {
        status: 200,
        body: {
            donation: row?.monero_address ? { monero: row.monero_address } : null,
            trocador: Boolean(row?.monero_payout_address),
        },
    };
}

/** Read the payout address for invoice creation. Never expose this result. */
export async function readDonationPayout(env: DonationEnv): Promise<string | null> {
    await ensureDonationSchema(env);
    const row = await env.DB.prepare(
        `SELECT ${DONATION_COLUMNS} FROM donation_addresses WHERE id = 1`,
    ).first<DonationRow>();
    return row?.monero_payout_address || null;
}

/**
 * Webhook idempotency: a retried event updates the same row. The raw body is
 * kept because Trocador only retains trade data for about fourteen days.
 */
export async function upsertDonationTrade(env: DonationEnv, trade: TrocadorTrade, payload: unknown): Promise<void> {
    await ensureDonationSchema(env);
    let serialized: string;
    try {
        serialized = JSON.stringify(payload).slice(0, 8_000);
    } catch {
        serialized = '';
    }
    await env.DB.prepare(
        `INSERT INTO donation_trades
            (id, status, ticker_from, network_from, amount_from, amount_to, payload, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, unixepoch())
         ON CONFLICT(id) DO UPDATE SET
            status = ?2, ticker_from = ?3, network_from = ?4,
            amount_from = ?5, amount_to = ?6, payload = ?7, updated_at = unixepoch()`,
    )
        .bind(trade.id, trade.status, trade.tickerFrom, trade.networkFrom, trade.amountFrom, trade.amountTo, serialized)
        .run();
}
