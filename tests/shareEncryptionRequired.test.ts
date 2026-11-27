import { beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import worker, { type Env } from '../worker';
import { d1, hasSqlite, migratedDatabase, type SqliteDatabase } from './sqliteD1';

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const PASSWORD = 'violet harbor tiny lantern';
const RAW_TOKEN = 'T'.repeat(43);

let db: SqliteDatabase;
let env: Env;
let token = '';
let pending: Promise<unknown>[] = [];
const ctx = {
    waitUntil: (promise: Promise<unknown>) => {
        pending.push(Promise.resolve(promise));
    },
    passThroughOnException: () => {},
} as unknown as Parameters<typeof worker.fetch>[2];

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

const hashToken = async (raw: string) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
};

describe.skipIf(!hasSqlite)('share encryption is mandatory', () => {
    beforeEach(async () => {
        pending = [];
        db = migratedDatabase();
        db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
            'user-1',
            'Alice',
            bcrypt.hashSync(PASSWORD, 4),
        );
        env = { DB: d1(db), JWT_SECRET } as unknown as Env;
        token =
            ((await call('/api/login', { body: { username: 'Alice', password: PASSWORD } })).body?.token as string) ??
            '';
        expect(token).not.toBe('');
    });

    it('rejects a new share that only has a plaintext snapshot', async () => {
        const result = await call('/api/shares', {
            token,
            body: {
                snapshot: { version: 1, mode: 'transfem', timezone: 'UTC', createdAt: 1, events: [] },
                expiresAt: Date.now() + 60_000,
            },
        });
        expect(result.response.status).toBe(400);
        expect(result.body?.code).toBe('ENCRYPTION_REQUIRED');
        expect((db.prepare('SELECT COUNT(*) AS n FROM dosage_shares').get() as { n: number }).n).toBe(0);
    });

    it('rejects a plaintext live update', async () => {
        const result = await call('/api/shares/live', {
            method: 'PUT',
            token,
            body: {
                snapshot: { version: 1, mode: 'transfem', timezone: 'UTC', createdAt: 1, events: [] },
            },
        });
        expect(result.response.status).toBe(400);
        expect(result.body?.code).toBe('ENCRYPTION_REQUIRED');
    });

    it('requires the owner password before rotating live-share wrapped keys', async () => {
        const envelope = { e2ee: 1, z: 0, iv: 'AAAAAAAAAAAAAAAA', data: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' };
        const wrappedKey = { cloud: 1, iv: 'AAAAAAAAAAAAAAAA', data: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' };
        const created = await call('/api/shares', {
            token,
            body: {
                encryptedSnapshot: envelope,
                live: true,
                wrappedKey,
                expiresAt: Date.now() + 3_600_000,
            },
        });
        expect(created.response.status).toBe(201);
        const id = created.body?.id as string;
        expect(id).toBeTruthy();
        const original = (
            db.prepare('SELECT key_wrapped FROM dosage_shares WHERE id = ?').get(id) as {
                key_wrapped: string;
            }
        ).key_wrapped;

        const replacement = { cloud: 1, iv: 'BBBBBBBBBBBBBBBB', data: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' };
        const withoutPassword = await call('/api/shares/keys', {
            method: 'PUT',
            token,
            body: { keys: [{ id, wrappedKey: replacement }] },
        });
        expect(withoutPassword.response.status).toBe(401);

        const wrongPassword = await call('/api/shares/keys', {
            method: 'PUT',
            token,
            body: { password: 'wrong password here', keys: [{ id, wrappedKey: replacement }] },
        });
        expect(wrongPassword.response.status).toBe(401);

        const rotated = await call('/api/shares/keys', {
            method: 'PUT',
            token,
            body: { password: PASSWORD, keys: [{ id, wrappedKey: replacement }] },
        });
        expect(rotated.response.status).toBe(200);
        expect(rotated.body?.updated).toBe(1);
        const updated = (
            db.prepare('SELECT key_wrapped FROM dosage_shares WHERE id = ?').get(id) as {
                key_wrapped: string;
            }
        ).key_wrapped;
        expect(updated).not.toBe(original);
    });

    it('uses the shared password bucket for live-share key rotation', async () => {
        for (let index = 0; index < 10; index += 1) {
            const attempt = await call('/api/shares/keys', {
                method: 'PUT',
                token,
                body: { password: 'wrong password here', keys: [] },
            });
            expect(attempt.response.status).toBe(401);
        }
        const denied = await call('/api/shares/keys', {
            method: 'PUT',
            token,
            body: { password: PASSWORD, keys: [] },
        });
        expect(denied.response.status).toBe(429);
        expect(denied.body?.code).toBe('RATE_LIMITED');
    });

    it('refuses and scrubs a legacy plaintext row', async () => {
        const tokenHash = await hashToken(RAW_TOKEN);
        const now = Math.floor(Date.now() / 1000);
        db.prepare(
            `INSERT INTO dosage_shares
             (id, user_id, token_hash, snapshot_json, password_hash, expires_at, created_at, is_live, share_mode, updated_at, encrypted, key_wrapped)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, 0, NULL)`,
        ).run(
            'share-1',
            'user-1',
            tokenHash,
            JSON.stringify({ version: 1, mode: 'transfem', timezone: 'UTC', createdAt: 1, events: [] }),
            null,
            now + 3600,
            now,
            now,
        );

        const result = await call('/api/shares/access', { body: { token: RAW_TOKEN } });
        expect(result.response.status).toBe(410);
        expect(result.body?.code).toBe('SHARE_EXPIRED');
        await Promise.all(pending);

        const row = db
            .prepare('SELECT snapshot_json, password_hash, key_wrapped FROM dosage_shares WHERE token_hash = ?')
            .get(tokenHash) as { snapshot_json: string; password_hash: string | null; key_wrapped: string | null };
        expect(row.snapshot_json).toBe('null');
        expect(row.password_hash).toBeNull();
        expect(row.key_wrapped).toBeNull();
    });
});
