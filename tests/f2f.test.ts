import bcrypt from 'bcryptjs';
import * as openpgp from 'openpgp';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleF2fWeb, sweepF2fCohorts } from '../f2f';
import worker, { type Env } from '../worker';
import { d1, hasSqlite, migratedDatabase, type SqliteDatabase } from './sqliteD1';

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const PASSWORD = 'violet harbor tiny lantern';

interface TestKey {
    publicKey: string;
    fingerprint: string;
}

interface TestEscrowKey extends TestKey {
    privateKey: string;
}

const memberKeys: TestKey[] = [];
const escrowKeys = new Map<number, TestEscrowKey>();
const escrowValues = [201, 202, 203, 204, 205, 301];

function fingerprint(value: number): string {
    return memberKeys[value - 1].fingerprint;
}

function publicKey(value: number): string {
    return memberKeys[value - 1].publicKey;
}

function escrowKey(value: number): TestEscrowKey {
    const key = escrowKeys.get(value);
    if (!key) throw new Error(`no escrow fixture ${value}`);
    return key;
}

function escrowPublic(value: number): string {
    return escrowKey(value).publicKey;
}

function escrowFingerprint(value: number): string {
    return escrowKey(value).fingerprint;
}

const SERVICE_TOKEN = 'test-service-token-0123456789';

let db: SqliteDatabase;
let env: Env;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as Parameters<typeof worker.fetch>[2];

const call = async (
    path: string,
    init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
) => {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    const response = await worker.fetch(
        new Request(`https://example.com${path}`, {
            method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
            headers,
            ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        }),
        env,
        ctx,
    );
    const text = await response.text();
    return { response, body: text ? (JSON.parse(text) as Record<string, any>) : null };
};

const textCall = async (path: string, token: string) => {
    const response = await worker.fetch(
        new Request(`https://example.com${path}`, {
            headers: { Authorization: `Bearer ${token}` },
        }),
        env,
        ctx,
    );
    return { response, text: await response.text() };
};

const login = async (username: string) => {
    const result = await call('/api/login', { body: { username, password: PASSWORD } });
    return result.body?.token as string;
};

const upload = (token: string, value: number, key = publicKey(value), fpr = fingerprint(value)) =>
    call('/api/f2f/keys', { token, body: { public_key: key, fingerprint: fpr } });

const provisionEscrow = (value: number, token = SERVICE_TOKEN) =>
    call('/api/tool/v1/f2f/escrow/keys', {
        headers: { 'x-hrt-service': token },
        body: {
            public_key: escrowPublic(value),
            private_key: escrowKey(value).privateKey,
            fingerprint: escrowFingerprint(value),
        },
    });

const directUpload = async (userId: string, value: number) => {
    const url = new URL('https://example.com/api/f2f/keys');
    const request = new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_key: publicKey(value), fingerprint: fingerprint(value) }),
    });
    return handleF2fWeb(request, env, url, { userId, username: `user-${userId}` });
};

describe.skipIf(!hasSqlite)('/f2f cohorts', () => {
    beforeAll(async () => {
        for (let value = 1; value <= 101; value++) {
            const pair = await openpgp.generateKey({
                type: 'ecc',
                curve: 'curve25519Legacy',
                userIDs: [{ name: `Member ${value}`, email: `member${value}@example.invalid` }],
                format: 'armored',
            });
            const key = await openpgp.readKey({ armoredKey: pair.publicKey });
            memberKeys[value - 1] = {
                publicKey: pair.publicKey,
                fingerprint: key.getFingerprint().toLowerCase(),
            };
        }
        for (const value of escrowValues) {
            const passphrase = 'escrow-test-passphrase';
            const pair = await openpgp.generateKey({
                type: 'ecc',
                curve: 'curve25519Legacy',
                userIDs: [{ name: `Escrow ${value}`, email: `escrow${value}@example.invalid` }],
                passphrase,
                format: 'armored',
            });
            const key = await openpgp.readKey({ armoredKey: pair.publicKey });
            escrowKeys.set(value, {
                publicKey: pair.publicKey,
                privateKey: pair.privateKey,
                fingerprint: key.getFingerprint().toLowerCase(),
            });
        }
    }, 120_000);

    beforeEach(async () => {
        db = migratedDatabase();
        for (const [id, name] of [
            ['user-1', 'Alice'],
            ['user-2', 'Bob'],
            ['user-3', 'Carol'],
        ]) {
            db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
                id,
                name,
                bcrypt.hashSync(PASSWORD, 4),
            );
        }
        env = {
            DB: d1(db),
            JWT_SECRET,
            PUBLIC_APP_ORIGIN: 'https://example.com',
            HRT_SERVICE_TOKEN: SERVICE_TOKEN,
            HRT_ESCROW_KEY: Buffer.alloc(32, 9).toString('base64'),
        } as unknown as Env;
    });

    it('reports no cohort before a key is registered', async () => {
        const token = await login('Alice');
        const status = await call('/api/f2f/status', { token });
        expect(status.response.status).toBe(200);
        expect(status.body?.registered).toBe(false);
    });

    it('says the database needs a migration when the F2F tables are missing', async () => {
        const token = await login('Alice');
        db.exec('DROP TABLE f2f_keys; DROP TABLE f2f_seats; DROP TABLE f2f_cohorts;');
        const status = await call('/api/f2f/status', { token });
        expect(status.response.status).toBe(503);
        expect(status.body?.code).toBe('SCHEMA_OUTDATED');
    });

    it('assigns the lowest free seat and stores the public key', async () => {
        const token = await login('Alice');
        const result = await upload(token, 1);
        expect(result.response.status).toBe(200);
        expect(result.body?.seat).toBe(1);
        expect(result.body?.fingerprint).toBe(fingerprint(1));
        expect(typeof result.body?.cohort_id).toBe('string');

        const status = await call('/api/f2f/status', { token });
        expect(status.body?.registered).toBe(true);
        expect(status.body?.seat).toBe(1);
        expect(status.body?.key?.fingerprint).toBe(fingerprint(1));
        expect(status.body?.cohort?.memberCount).toBe(1);
    });

    it('puts the next member in the same cohort and exposes public keys to members', async () => {
        const alice = await login('Alice');
        const bob = await login('Bob');
        const first = await upload(alice, 1);
        const second = await upload(bob, 2);
        expect(second.body?.cohort_id).toBe(first.body?.cohort_id);
        expect(second.body?.seat).toBe(2);

        const members = await call(`/api/f2f/cohorts/${first.body?.cohort_id}/members`, {
            token: alice,
        });
        expect(members.response.status).toBe(200);
        expect(members.body?.members).toHaveLength(2);
        expect(members.body?.members[0]).toMatchObject({
            seat: 1,
            username: 'Alice',
        });
        expect(members.body?.members[0].keys[0].fingerprint).toBe(fingerprint(1));
        expect(members.body?.members[1].keys[0].publicKey).toContain('BEGIN PGP PUBLIC KEY BLOCK');
    });

    it('rotates to a new key without moving the seat and keeps the old key retired', async () => {
        const token = await login('Alice');
        const first = await upload(token, 1);
        const second = await upload(token, 11);
        expect(second.body?.seat).toBe(first.body?.seat);
        expect(second.body?.cohort_id).toBe(first.body?.cohort_id);

        const status = await call('/api/f2f/status', { token });
        expect(status.body?.key?.fingerprint).toBe(fingerprint(11));
        const rows = db
            .prepare('SELECT fingerprint, status FROM f2f_keys WHERE user_id = ? ORDER BY created_at')
            .all('user-1') as Array<{ fingerprint: string; status: string }>;
        expect(rows).toHaveLength(2);
        expect(rows).toEqual(
            expect.arrayContaining([
                { fingerprint: fingerprint(1), status: 'retired' },
                { fingerprint: fingerprint(11), status: 'active' },
            ]),
        );

        const members = await call(`/api/f2f/cohorts/${first.body?.cohort_id}/members`, {
            token,
        });
        expect(members.body?.members[0].keys).toHaveLength(2);
    });

    it('rejects a malformed key or fingerprint', async () => {
        const token = await login('Alice');
        const badArmor = await upload(token, 1, 'not a key', fingerprint(1));
        expect(badArmor.response.status).toBe(400);
        const badFingerprint = await upload(token, 1, publicKey(1), 'xyz');
        expect(badFingerprint.response.status).toBe(400);
        expect(db.prepare('SELECT COUNT(*) AS n FROM f2f_keys').get()).toEqual({ n: 0 });
    });

    it('rejects a structurally valid but fake public key', async () => {
        const token = await login('Alice');
        const fake =
            '-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n' + 'A'.repeat(160) + '\n-----END PGP PUBLIC KEY BLOCK-----';
        const result = await upload(token, 1, fake, fingerprint(1));
        expect(result.response.status).toBe(400);
        expect(db.prepare('SELECT COUNT(*) AS n FROM f2f_keys').get()).toEqual({ n: 0 });
    });

    it("does not let a member retire another member's key", async () => {
        const alice = await login('Alice');
        const bob = await login('Bob');
        const key = await upload(alice, 1);
        await upload(bob, 2);
        const result = await call('/api/f2f/keys/retire', {
            token: bob,
            body: { key_id: key.body?.key_id },
        });
        expect(result.response.status).toBe(404);
        const status = await call('/api/f2f/status', { token: alice });
        expect(status.body?.key?.fingerprint).toBe(fingerprint(1));
    });

    it('turns a deleted seat into a permanent tombstone that is not reused', async () => {
        const alice = await login('Alice');
        const bob = await login('Bob');
        const carol = await login('Carol');
        const first = await upload(alice, 1);
        await upload(bob, 2);

        const deleted = await call('/api/user/me', {
            token: alice,
            method: 'DELETE',
            body: { password: PASSWORD },
        });
        expect(deleted.response.status).toBe(200);
        const seat = db.prepare('SELECT status, deleted_at FROM f2f_seats WHERE user_id = ?').get('user-1') as {
            status: string;
            deleted_at: number | null;
        };
        expect(seat.status).toBe('deleted');
        expect(seat.deleted_at).not.toBeNull();
        const key = db.prepare('SELECT status, public_key FROM f2f_keys WHERE user_id = ?').get('user-1') as {
            status: string;
            public_key: string;
        };
        expect(key.status).toBe('revoked');
        expect(key.public_key).toBe('');

        const next = await upload(carol, 3);
        expect(next.body?.cohort_id).toBe(first.body?.cohort_id);
        expect(next.body?.seat).toBe(3);
    });

    it('starts a new cohort when all 100 seats have been assigned', async () => {
        for (let i = 0; i < 100; i++) {
            const userId = `bulk-${i}`;
            db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
                userId,
                `bulk-${i}`,
                'x',
            );
            const response = await directUpload(userId, i + 1);
            expect(response?.status).toBe(200);
        }
        const firstCohort = db.prepare('SELECT id, state FROM f2f_cohorts ORDER BY created_at LIMIT 1').get() as {
            id: string;
            state: string;
        };
        expect(firstCohort.state).toBe('full');

        const carol = await login('Carol');
        const next = await upload(carol, 101);
        expect(next.response.status).toBe(200);
        expect(next.body?.cohort_id).not.toBe(firstCohort.id);
        expect(next.body?.seat).toBe(1);
    });

    it('retires a cohort after 180 idle days and keeps a newly active cohort', async () => {
        const token = await login('Alice');
        const first = await upload(token, 1);
        const old = Math.floor(Date.now() / 1000) - 181 * 24 * 60 * 60;
        db.prepare('UPDATE f2f_cohorts SET last_used_at = ? WHERE id = ?').run(old, first.body?.cohort_id);

        await sweepF2fCohorts(env);
        const retired = db.prepare('SELECT state FROM f2f_cohorts WHERE id = ?').get(first.body?.cohort_id) as {
            state: string;
        };
        expect(retired.state).toBe('retired');

        /* The retired cohort takes no new members, so Bob starts a new one. */
        const bob = await login('Bob');
        const second = await upload(bob, 2);
        expect(second.body?.cohort_id).not.toBe(first.body?.cohort_id);
        await sweepF2fCohorts(env);
        const active = db.prepare('SELECT state FROM f2f_cohorts WHERE id = ?').get(second.body?.cohort_id) as {
            state: string;
        };
        expect(active.state).toBe('active');
    });

    it('exports an importable keyring of active member keys and the escrow key', async () => {
        env.HRT_F2F_ESCROW = '1';
        await provisionEscrow(301);
        const alice = await login('Alice');
        const bob = await login('Bob');
        const carol = await login('Carol');
        const first = await upload(alice, 1);
        await upload(bob, 2);
        expect(first.response.status).toBe(200);

        const keyring = await textCall(`/api/f2f/cohorts/${first.body?.cohort_id}/keyring`, alice);
        expect(keyring.response.status).toBe(200);
        expect(keyring.response.headers.get('content-type')).toContain('text/plain');
        expect(keyring.response.headers.get('content-disposition')).toContain('hrt-f2f-');
        expect(keyring.text).toContain(publicKey(1));
        expect(keyring.text).toContain(publicKey(2));
        expect(keyring.text).toContain(escrowPublic(301));
        expect(keyring.text).not.toContain('PRIVATE KEY');
        expect(keyring.text).not.toContain('B'.repeat(160));

        const outsider = await textCall(`/api/f2f/cohorts/${first.body?.cohort_id}/keyring`, carol);
        expect(outsider.response.status).toBe(403);

        await call('/api/f2f/keys/revoke', { token: alice, body: { key_id: first.body?.key_id } });
        const afterRevoke = await textCall(`/api/f2f/cohorts/${first.body?.cohort_id}/keyring`, bob);
        expect(afterRevoke.text).not.toContain(publicKey(1));
        expect(afterRevoke.text).toContain(publicKey(2));
    });

    it('provisions an escrow key without storing its plaintext', async () => {
        const result = await provisionEscrow(201);
        expect(result.response.status).toBe(200);
        expect(result.body?.state).toBe('available');

        const row = db
            .prepare('SELECT private_key_encrypted, state FROM f2f_escrow_keys WHERE fingerprint = ?')
            .get(escrowFingerprint(201)) as { private_key_encrypted: string; state: string };
        expect(row.state).toBe('available');
        expect(row.private_key_encrypted).toMatch(/^v1\./);
        expect(row.private_key_encrypted).not.toContain('PRIVATE KEY');
        expect(row.private_key_encrypted).not.toContain('B'.repeat(160));

        const status = await call('/api/tool/v1/f2f/escrow/status', {
            headers: { 'x-hrt-service': SERVICE_TOKEN },
        });
        expect(status.response.status).toBe(200);
        expect(status.body?.counts.available).toBe(1);
        expect(JSON.stringify(status.body)).not.toContain('private_key_encrypted');
    });

    it('assigns one escrow key to a new cohort and exposes only its public half', async () => {
        env.HRT_F2F_ESCROW = '1';
        const provisioned = await provisionEscrow(202);
        const token = await login('Alice');
        const joined = await upload(token, 1);
        expect(joined.response.status).toBe(200);

        const status = await call('/api/f2f/status', { token });
        expect(status.body?.escrow?.fingerprint).toBe(escrowFingerprint(202));
        expect(status.body?.escrow?.publicKey).toContain('BEGIN PGP PUBLIC KEY BLOCK');
        expect(status.body?.escrow?.privateKey).toBeUndefined();

        const escrow = db
            .prepare('SELECT state, cohort_id FROM f2f_escrow_keys WHERE id = ?')
            .get(provisioned.body?.id) as { state: string; cohort_id: string };
        expect(escrow.state).toBe('assigned');
        expect(escrow.cohort_id).toBe(joined.body?.cohort_id);

        const members = await call(`/api/f2f/cohorts/${joined.body?.cohort_id}/members`, { token });
        expect(members.body?.cohort?.escrow?.fingerprint).toBe(escrowFingerprint(202));
    });

    it('refuses a new cohort when escrow is enabled without an available key', async () => {
        env.HRT_F2F_ESCROW = '1';
        const token = await login('Alice');
        const result = await upload(token, 1);
        expect(result.response.status).toBe(503);
        expect(result.body?.code).toBe('ESCROW_UNAVAILABLE');
        expect(db.prepare('SELECT COUNT(*) AS n FROM f2f_seats').get()).toEqual({ n: 0 });
    });

    it('requires the service token to provision escrow keys', async () => {
        const result = await provisionEscrow(203, 'wrong-service-token-0000');
        expect(result.response.status).toBe(401);
        expect(db.prepare('SELECT COUNT(*) AS n FROM f2f_escrow_keys').get()).toEqual({ n: 0 });
    });

    it('rejects a duplicate escrow fingerprint', async () => {
        expect((await provisionEscrow(204)).response.status).toBe(200);
        const again = await provisionEscrow(204);
        expect(again.response.status).toBe(409);
    });

    it('releases an escrow key whose cohort disappeared', async () => {
        const provisioned = await provisionEscrow(205);
        db.prepare("UPDATE f2f_escrow_keys SET state = 'assigned', cohort_id = ?, assigned_at = ? WHERE id = ?").run(
            '00000000-0000-0000-0000-000000000000',
            Math.floor(Date.now() / 1000),
            provisioned.body?.id,
        );

        await sweepF2fCohorts(env);
        const row = db
            .prepare('SELECT state, cohort_id, assigned_at FROM f2f_escrow_keys WHERE id = ?')
            .get(provisioned.body?.id) as { state: string; cohort_id: string | null; assigned_at: number | null };
        expect(row.state).toBe('available');
        expect(row.cohort_id).toBeNull();
        expect(row.assigned_at).toBeNull();
    });

    it('leaves escrow off unless the operator enables it', async () => {
        const token = await login('Alice');
        await upload(token, 1);
        const status = await call('/api/f2f/status', { token });
        expect(status.body?.escrow).toBeNull();
    });

    it('rate-limits F2F key writes per account', async () => {
        const token = await login('Alice');
        env = {
            ...env,
            RL_PER_MINUTE_10: { limit: async () => ({ success: false }) },
        } as unknown as Env;
        const result = await upload(token, 1);
        expect(result.response.status).toBe(429);
        expect(result.body?.code).toBe('RATE_LIMITED');
    });

    it('issues a one-time CLI registration code and exchanges it for a scoped token', async () => {
        const token = await login('Alice');
        const created = await call('/api/f2f/cli/codes', { method: 'POST', token });
        expect(created.response.status).toBe(200);
        const code = created.body?.code as string;
        expect(code).toMatch(/^[0-9a-f]{32}$/);
        expect(created.body?.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
        const stored = db.prepare('SELECT code_hash FROM f2f_cli_codes').get() as { code_hash: string };
        expect(stored.code_hash).not.toBe(code);

        const exchanged = await call('/api/f2f/cli/token', { body: { code } });
        expect(exchanged.response.status).toBe(200);
        const cliToken = exchanged.body?.token as string;
        expect(cliToken.length).toBeGreaterThan(32);

        const status = await call('/api/f2f/status', { token: cliToken });
        expect(status.response.status).toBe(200);

        const me = await call('/api/user/me', { token: cliToken });
        expect(me.response.status).toBe(403);

        const more = await call('/api/f2f/cli/codes', { method: 'POST', token: cliToken });
        expect(more.response.status).toBe(403);

        const reuse = await call('/api/f2f/cli/token', { body: { code } });
        expect(reuse.response.status).toBe(401);
        expect(reuse.body?.code).toBe('INVALID_CODE');
    });

    it('rejects an expired CLI registration code', async () => {
        const token = await login('Alice');
        const created = await call('/api/f2f/cli/codes', { method: 'POST', token });
        db.prepare('UPDATE f2f_cli_codes SET expires_at = ?').run(Math.floor(Date.now() / 1000) - 1);
        const exchanged = await call('/api/f2f/cli/token', { body: { code: created.body?.code } });
        expect(exchanged.response.status).toBe(401);
        expect(exchanged.body?.code).toBe('INVALID_CODE');
    });

    it('rate-limits CLI registration code exchange', async () => {
        env = {
            ...env,
            TRUSTED_IP_SOURCE: 'cf',
            RL_PER_MINUTE_10: { limit: async () => ({ success: false }) },
        } as unknown as Env;
        const result = await call('/api/f2f/cli/token', {
            body: { code: 'a'.repeat(32) },
            headers: { 'CF-Connecting-IP': '203.0.113.9' },
        });
        expect(result.response.status).toBe(429);
        expect(result.body?.code).toBe('RATE_LIMITED');
    });
});
