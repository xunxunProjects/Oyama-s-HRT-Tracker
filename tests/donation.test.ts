import { describe, expect, it } from 'vitest';
import { handleDonationPublic, parseDonationDraft, serializeDonation, type DonationRow } from '../src/server/donation';

const MONERO = '83cW4PFAGbjT1RiP1q5HG2gcKWqZXG4DRGcyXvPDBzUmVxMi6LgXZGjZn8hLp6CT6hCzysxyiS6H9Ss8JqQGqmKE9neYCm9';
const PAYOUT = '86fnX9pg9VqD5SjJNDjbxKemf5wEvHz7mDojKztJyov8PVKCGVeC7QKijLQrb9QT7KabaXhXFn3HoPbDvWAk6dYrUBgB9p5';

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
        if (this.sql.includes('ALTER TABLE donation_addresses ADD COLUMN monero_payout_address')) {
            this.db.payoutColumnReady = true;
            return { success: true, meta: { changes: 0 } };
        }
        if (this.sql.includes('CREATE TABLE IF NOT EXISTS donation_trades')) {
            this.db.tradesReady = true;
            return { success: true, meta: { changes: 0 } };
        }
        if (this.sql.includes('INSERT INTO donation_trades')) {
            this.db.trades.push(this.params);
            return { success: true, meta: { changes: 1 } };
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
    payoutColumnReady = false;
    tradesReady = false;
    row: DonationRow | null = null;
    trades: unknown[][] = [];

    prepare(sql: string): FakeStatement {
        return new FakeStatement(this, sql);
    }
}

const env = (db: FakeDonationDb) => ({ DB: db as unknown as D1Database });

describe('parseDonationDraft', () => {
    it('accepts two distinct Monero addresses', () => {
        expect(parseDonationDraft({ monero: MONERO, moneroPayout: PAYOUT })).toEqual({
            ok: true,
            value: { monero: MONERO, moneroPayout: PAYOUT },
        });
    });

    it('accepts only the direct address', () => {
        expect(parseDonationDraft({ monero: MONERO, moneroPayout: '' })).toEqual({
            ok: true,
            value: { monero: MONERO, moneroPayout: '' },
        });
    });

    it('accepts only the Trocador payout address', () => {
        expect(parseDonationDraft({ monero: '', moneroPayout: PAYOUT })).toEqual({
            ok: true,
            value: { monero: '', moneroPayout: PAYOUT },
        });
    });

    it('clears both addresses when the draft is empty', () => {
        expect(parseDonationDraft({ monero: '', moneroPayout: '' })).toEqual({
            ok: true,
            value: { monero: '', moneroPayout: '' },
        });
    });

    it('rejects using the same address for both purposes', () => {
        const result = parseDonationDraft({ monero: MONERO, moneroPayout: MONERO });
        expect(result.ok).toBe(false);
    });

    it('rejects a Monero address with a broken checksum', () => {
        const broken = `${MONERO.slice(0, -1)}${MONERO.endsWith('9') ? '8' : '9'}`;
        const result = parseDonationDraft({ monero: broken, moneroPayout: '' });
        expect(result.ok).toBe(false);
    });

    it('rejects a non-base58 Monero address', () => {
        expect(parseDonationDraft({ monero: 'not-a-monero-address', moneroPayout: '' }).ok).toBe(false);
    });

    it('rejects an address longer than the storage limit', () => {
        expect(parseDonationDraft({ monero: MONERO.repeat(2), moneroPayout: '' }).ok).toBe(false);
    });
});

describe('serializeDonation', () => {
    it('maps database columns to the admin shape', () => {
        expect(
            serializeDonation({
                monero_address: MONERO,
                monero_payout_address: PAYOUT,
                updated_at: 1_791_590_400,
            }),
        ).toEqual({
            monero: MONERO,
            moneroPayout: PAYOUT,
            updatedAt: 1_791_590_400,
        });
    });
});

describe('handleDonationPublic', () => {
    it('returns no donation and no Trocador flag until anything is configured', async () => {
        const db = new FakeDonationDb();
        const result = await handleDonationPublic(env(db));
        expect(result).toEqual({ status: 200, body: { donation: null, trocador: false } });
        expect(db.schemaReady).toBe(true);
    });

    it('shows only the direct address and never leaks the payout address', async () => {
        const db = new FakeDonationDb();
        db.row = {
            monero_address: MONERO,
            monero_payout_address: PAYOUT,
            updated_at: 1_791_590_400,
        };
        const result = await handleDonationPublic(env(db));
        expect(result.body).toEqual({ donation: { monero: MONERO }, trocador: true });
        expect(JSON.stringify(result.body)).not.toContain(PAYOUT);
    });

    it('enables Trocador when only the payout address is set', async () => {
        const db = new FakeDonationDb();
        db.row = {
            monero_address: '',
            monero_payout_address: PAYOUT,
            updated_at: 1_791_590_400,
        };
        const result = await handleDonationPublic(env(db));
        expect(result.body).toEqual({ donation: null, trocador: true });
    });
});
