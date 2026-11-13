import { describe, expect, it } from 'vitest';
import { handleDonationPublic, parseDonationDraft, serializeDonation, type DonationRow } from '../src/server/donation';

const MONERO = '83cW4PFAGbjT1RiP1q5HG2gcKWqZXG4DRGcyXvPDBzUmVxMi6LgXZGjZn8hLp6CT6hCzysxyiS6H9Ss8JqQGqmKE9neYCm9';
const BITCOIN = 'bc1qfsa2jzt2f7p7xgjemycy03spxq375jm46u9su0';

class FakeStatement {
    private params: unknown[] = [];

    constructor(
        private readonly db: FakeDonationDb,
        private readonly sql: string,
    ) {}

    bind(...params: unknown[]): FakeStatement {
        this.params = params;
        return this;
    }

    async run(): Promise<{ success: true; meta: { changes: number } }> {
        if (this.sql.includes('CREATE TABLE IF NOT EXISTS donation_addresses')) {
            this.db.schemaReady = true;
            return { success: true, meta: { changes: 0 } };
        }
        throw new Error(`Unsupported write in test fake: ${this.sql}`);
    }

    async first<T = unknown>(): Promise<T | null> {
        if (this.sql.includes('SELECT monero_address')) {
            if (!this.db.schemaReady) throw new Error('D1_ERROR: no such table: donation_addresses');
            return this.db.row as T | null;
        }
        throw new Error(`Unsupported SELECT in test fake: ${this.sql}`);
    }
}

class FakeDonationDb {
    schemaReady = false;
    row: DonationRow | null = null;

    prepare(sql: string): FakeStatement {
        return new FakeStatement(this, sql);
    }
}

const env = (db: FakeDonationDb) => ({ DB: db as unknown as D1Database });

describe('parseDonationDraft', () => {
    it('accepts the current project addresses and normalises Bitcoin case', () => {
        const result = parseDonationDraft({
            monero: MONERO,
            bitcoin: BITCOIN.toUpperCase(),
            bitcoinUpdatedAt: '2026-11-09',
        });
        expect(result).toEqual({
            ok: true,
            value: { monero: MONERO, bitcoin: BITCOIN, bitcoinUpdatedAt: '2026-11-09' },
        });
    });

    it('clears both addresses when the draft is empty', () => {
        expect(parseDonationDraft({ monero: '', bitcoin: '', bitcoinUpdatedAt: null })).toEqual({
            ok: true,
            value: { monero: '', bitcoin: '', bitcoinUpdatedAt: null },
        });
    });

    it('rejects a half-configured pair', () => {
        const result = parseDonationDraft({ monero: MONERO, bitcoin: '' });
        expect(result.ok).toBe(false);
    });

    it('rejects a Monero address that is not base58', () => {
        const result = parseDonationDraft({ monero: 'not-a-monero-address', bitcoin: BITCOIN });
        expect(result.ok).toBe(false);
    });

    it('rejects a Bitcoin address with the wrong prefix', () => {
        const result = parseDonationDraft({ monero: MONERO, bitcoin: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT' });
        expect(result.ok).toBe(false);
    });

    it('rejects an impossible calendar date', () => {
        const result = parseDonationDraft({
            monero: MONERO,
            bitcoin: BITCOIN,
            bitcoinUpdatedAt: '2026-02-30',
        });
        expect(result.ok).toBe(false);
    });

    it('treats an empty updated date as null', () => {
        const result = parseDonationDraft({
            monero: MONERO,
            bitcoin: BITCOIN,
            bitcoinUpdatedAt: '  ',
        });
        expect(result).toEqual({
            ok: true,
            value: { monero: MONERO, bitcoin: BITCOIN, bitcoinUpdatedAt: null },
        });
    });
});

describe('serializeDonation', () => {
    it('maps database columns to the public shape', () => {
        expect(
            serializeDonation({
                monero_address: MONERO,
                bitcoin_address: BITCOIN,
                bitcoin_updated_at: '2026-11-09',
                updated_at: 1_791_590_400,
            }),
        ).toEqual({
            monero: MONERO,
            bitcoin: BITCOIN,
            bitcoinUpdatedAt: '2026-11-09',
            updatedAt: 1_791_590_400,
        });
    });
});

describe('handleDonationPublic', () => {
    it('returns null until both addresses are configured', async () => {
        const db = new FakeDonationDb();
        const result = await handleDonationPublic(env(db));
        expect(result).toEqual({ status: 200, body: { donation: null } });
        expect(db.schemaReady).toBe(true);
    });

    it('hides a row with only one address', async () => {
        const db = new FakeDonationDb();
        db.row = {
            monero_address: MONERO,
            bitcoin_address: '',
            bitcoin_updated_at: null,
            updated_at: 1_791_590_400,
        };
        const result = await handleDonationPublic(env(db));
        expect(result.body.donation).toBeNull();
    });

    it('returns both addresses once configured', async () => {
        const db = new FakeDonationDb();
        db.row = {
            monero_address: MONERO,
            bitcoin_address: BITCOIN,
            bitcoin_updated_at: '2026-11-09',
            updated_at: 1_791_590_400,
        };
        const result = await handleDonationPublic(env(db));
        expect(result.body.donation).toEqual({
            monero: MONERO,
            bitcoin: BITCOIN,
            bitcoinUpdatedAt: '2026-11-09',
            updatedAt: 1_791_590_400,
        });
    });
});
