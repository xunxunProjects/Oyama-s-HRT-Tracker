import { beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import worker, { type Env } from '../worker';
import { d1, hasSqlite, migratedDatabase, type SqliteDatabase } from './sqliteD1';

// A global storage ceiling keeps one flood of accounts, backups or share
// ciphertext from filling D1 and turning every write for every user into an
// outage. The tests lower the ceiling through the deployment setting so they
// do not need to insert gigabytes.

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const PASSWORD = 'violet harbor tiny lantern';
const BUDGET = 4096;

let db: SqliteDatabase;
let env: Env;
let token = '';
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

describe.skipIf(!hasSqlite)('global storage budget', () => {
    beforeEach(async () => {
        db = migratedDatabase();
        db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
            'user-1',
            'Alice',
            bcrypt.hashSync(PASSWORD, 4),
        );
        env = {
            DB: d1(db),
            JWT_SECRET,
            MAX_STORED_CONTENT_BYTES: String(BUDGET),
        } as unknown as Env;
        const login = await call('/api/login', { body: { username: 'Alice', password: PASSWORD } });
        token = login.body?.token as string;
        expect(token).not.toBe('');
    });

    it('rejects a backup that would cross the ceiling while keeping existing data readable', async () => {
        const first = await call('/api/content', {
            token,
            body: { data: { note: 'x'.repeat(1000) } },
        });
        expect(first.response.status).toBe(201);

        const refused = await call('/api/content', {
            token,
            body: { data: { note: 'x'.repeat(5000) } },
        });
        expect(refused.response.status).toBe(507);
        expect(refused.body?.code).toBe('STORAGE_FULL');

        const listed = await call('/api/content', { token });
        expect(listed.response.status).toBe(200);
        expect(listed.body).toHaveLength(1);
    });

    it('rejects a share snapshot that would cross the ceiling', async () => {
        const first = await call('/api/content', {
            token,
            body: { data: { note: 'x'.repeat(1000) } },
        });
        expect(first.response.status).toBe(201);

        const refused = await call('/api/shares', {
            token,
            body: {
                live: false,
                encryptedSnapshot: {
                    e2ee: 1,
                    z: 0,
                    iv: 'AAAAAAAAAAAAAAAA',
                    data: 'A'.repeat(5000),
                },
                expiresAt: Date.now() + 60_000,
            },
        });
        expect(refused.response.status).toBe(507);
        expect(refused.body?.code).toBe('STORAGE_FULL');
        expect((db.prepare('SELECT COUNT(*) AS n FROM dosage_shares').get() as { n: number }).n).toBe(0);
    });

    it('keeps backups working when migration 0014 has not been applied yet', async () => {
        // A deploy does not run D1 migrations. Without the counter table the
        // budget check must not turn every backup into a server error.
        for (const name of (
            db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'storage_%'").all() as {
                name: string;
            }[]
        ).map(row => row.name)) {
            db.exec(`DROP TRIGGER ${name}`);
        }
        db.exec('DROP TABLE storage_usage');
        env = { ...env, MAX_STORED_CONTENT_BYTES: undefined } as unknown as Env;

        const saved = await call('/api/content', {
            token,
            body: { data: { note: 'x'.repeat(1000) } },
        });
        expect(saved.response.status).toBe(201);
    });
});
