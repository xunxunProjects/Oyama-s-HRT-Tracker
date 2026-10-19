import { beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import worker, { type Env } from '../worker';

// /api/tool/v1 contract tests. They run against a real SQLite engine
// (node:sqlite) with every migration applied, through the same thin
// D1-shaped adapter the login-lockout tests use.

interface SqliteDatabase {
    exec(sql: string): void;
    prepare(sql: string): {
        get(...values: unknown[]): unknown;
        run(...values: unknown[]): { changes: number | bigint };
        all(...values: unknown[]): unknown[];
    };
}

const sqliteSpecifier = 'node:sqlite';
const fsSpecifier = 'node:fs';
let sqliteModule: { DatabaseSync: new (path: string, options?: Record<string, unknown>) => SqliteDatabase } | null =
    null;
let fsModule: { readdirSync: (path: URL) => string[]; readFileSync: (path: URL, encoding: 'utf8') => string } | null =
    null;
try {
    sqliteModule = (await import(/* @vite-ignore */ sqliteSpecifier)) as typeof sqliteModule;
} catch {
    sqliteModule = null;
}
try {
    fsModule = (await import(/* @vite-ignore */ fsSpecifier)) as typeof fsModule;
} catch {
    fsModule = null;
}

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const PASSWORD = 'violet harbor tiny lantern';

function d1(db: SqliteDatabase) {
    return {
        prepare(sql: string) {
            let args: unknown[] = [];
            const statement = {
                bind(...values: unknown[]) {
                    args = values;
                    return statement;
                },
                async first() {
                    return db.prepare(sql).get(...args) ?? null;
                },
                async run() {
                    const result = db.prepare(sql).run(...args);
                    return { success: true, meta: { changes: Number(result.changes) } };
                },
                async all() {
                    return { success: true, results: db.prepare(sql).all(...args) };
                },
            };
            return statement;
        },
    };
}

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

const login = async (password = PASSWORD) => {
    const result = await call('/api/login', { body: { username: 'Alice', password } });
    return result;
};

describe('/api/tool/v1', () => {
    beforeEach(async () => {
        db = new sqliteModule!.DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
        const migrationDir = new URL('../migrations/', import.meta.url);
        for (const file of fsModule!
            .readdirSync(migrationDir)
            .filter(name => name.endsWith('.sql'))
            .sort()) {
            db.exec(fsModule!.readFileSync(new URL(file, migrationDir), 'utf8'));
        }
        db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
            'user-1',
            'Alice',
            bcrypt.hashSync(PASSWORD, 4),
        );
        env = { DB: d1(db), JWT_SECRET } as unknown as Env;
        token = ((await login()).body?.token as string) ?? '';
        expect(token).not.toBe('');
    });

    describe('public routes', () => {
        it('serves the version and transport advertisement without auth', async () => {
            const version = await call('/api/tool/v1/version');
            expect(version.response.status).toBe(200);
            expect(version.body).toEqual({
                apiVersion: 1,
                minToolVersion: '0.1.0',
                transport: ['tls'],
                serverTime: expect.any(String),
            });
            expect(Number.isNaN(Date.parse(version.body!.serverTime))).toBe(false);
        });

        it('logs in through the existing flow and adds the tool fields', async () => {
            const result = await call('/api/tool/v1/login', {
                body: { username: 'Alice', password: PASSWORD },
            });
            expect(result.response.status).toBe(200);
            expect(typeof result.body?.token).toBe('string');
            expect(result.body?.user).toEqual({ id: 'user-1', username: 'Alice', isAdmin: false });
            expect(typeof result.body?.devicePass).toBe('string');
            expect(result.body?.apiVersion).toBe(1);
            expect(result.body?.transport).toEqual(['tls']);
            expect(Number.isNaN(Date.parse(result.body!.serverTime))).toBe(false);
        });

        it('still rejects a wrong password with 401', async () => {
            const result = await call('/api/tool/v1/login', {
                body: { username: 'Alice', password: 'wrong password entirely' },
            });
            expect(result.response.status).toBe(401);
            expect(result.body?.code).toBe('INVALID_CREDENTIALS');
        });

        it('reserves server compute with 501', async () => {
            const result = await call('/api/tool/v1/compute', { body: {} });
            expect(result.response.status).toBe(501);
            expect(result.body?.code).toBe('NOT_IMPLEMENTED');
        });

        it('shares the website’s second-factor requirement', async () => {
            db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run('JBSWY3DPEHPK3PXP', 'user-1');
            const result = await call('/api/tool/v1/login', {
                body: { username: 'Alice', password: PASSWORD },
            });
            expect(result.response.status).toBe(401);
            expect(result.body?.code).toBe('TWO_FACTOR_REQUIRED');
        });
    });

    describe('protected routes', () => {
        const data = { cloud: 1, iv: 'aXY=', data: 'Y2lwaGVydGV4dA==' };
        const put = (body: unknown, ifMatch?: string) =>
            call('/api/tool/v1/snapshot', {
                method: 'PUT',
                body,
                token,
                headers: ifMatch ? { 'If-Match': ifMatch } : {},
            });

        it('reports the token owner', async () => {
            const result = await call('/api/tool/v1/me', { token });
            expect(result.response.status).toBe(200);
            expect(result.body?.user).toEqual({ id: 'user-1', username: 'Alice', isAdmin: false });
            expect(result.body?.apiVersion).toBe(1);
            expect(Number.isNaN(Date.parse(result.body!.serverTime))).toBe(false);
        });

        it('rejects a request with no token', async () => {
            const result = await call('/api/tool/v1/me');
            expect(result.response.status).toBe(401);
            expect(result.body?.code).toBe('SESSION_INVALID');
        });

        it('returns NO_SNAPSHOT before the first write', async () => {
            const result = await call('/api/tool/v1/snapshot', { token });
            expect(result.response.status).toBe(404);
            expect(result.body?.code).toBe('NO_SNAPSHOT');
        });

        it('stores and returns the opaque bundle', async () => {
            const saved = await put({ data });
            expect(saved.response.status).toBe(201);
            expect(typeof saved.body?.id).toBe('string');
            expect(typeof saved.body?.createdAt).toBe('number');

            const latest = await call('/api/tool/v1/snapshot', { token });
            expect(latest.response.status).toBe(200);
            expect(latest.body).toEqual({
                id: saved.body!.id,
                createdAt: saved.body!.createdAt,
                data,
            });

            const list = await call('/api/tool/v1/snapshots', { token });
            expect(list.body).toEqual([
                {
                    id: saved.body!.id,
                    createdAt: saved.body!.createdAt,
                    dataSize: JSON.stringify(data).length,
                },
            ]);

            const one = await call(`/api/tool/v1/snapshot/${saved.body!.id}`, { token });
            expect(one.body).toEqual({ id: saved.body!.id, createdAt: saved.body!.createdAt, data });
        });

        it('refuses a stale If-Match with the current revision', async () => {
            const first = await put({ data });
            const second = await put({ data: { ...data, data: 'bmV3' } });
            expect(second.response.status).toBe(201);

            const stale = await put({ data }, first.body!.id);
            expect(stale.response.status).toBe(409);
            expect(stale.body?.code).toBe('CONFLICT');
            expect(stale.body?.current).toEqual({ id: second.body!.id, createdAt: second.body!.createdAt });

            const accepted = await put({ data }, second.body!.id);
            expect(accepted.response.status).toBe(201);
        });

        it('accepts the alias header and treats * as “a revision must exist”', async () => {
            const empty = await call('/api/tool/v1/snapshot', {
                method: 'PUT',
                body: { data },
                token,
                headers: { 'If-Match': '*' },
            });
            expect(empty.response.status).toBe(409);
            expect(empty.body?.current).toBeNull();

            const first = await put({ data: { seq: 1 } });
            const alias = await call('/api/tool/v1/snapshot', {
                method: 'PUT',
                body: { data: { seq: 2 } },
                token,
                headers: { 'X-HRT-Base-Revision': first.body!.id },
            });
            expect(alias.response.status).toBe(201);

            const star = await call('/api/tool/v1/snapshot', {
                method: 'PUT',
                body: { data: { seq: 3 } },
                token,
                headers: { 'If-Match': '*' },
            });
            expect(star.response.status).toBe(201);
        });

        it('round-trips string, array and null data unchanged', async () => {
            for (const value of ['plain text', [1, 2, 3], null]) {
                const saved = await put({ data: value });
                expect(saved.response.status).toBe(201);
                const latest = await call('/api/tool/v1/snapshot', { token });
                expect(latest.body?.data).toEqual(value);
            }
        });

        it('answers a malformed revision id with 404, not 500', async () => {
            const result = await call('/api/tool/v1/snapshot/%E0%A4%A', { token });
            expect(result.response.status).toBe(404);
            expect(result.body?.code).toBe('NO_SNAPSHOT');
        });

        it('keeps one user out of another user’s snapshot', async () => {
            const saved = await put({ data });
            db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
                'user-2',
                'Bob',
                bcrypt.hashSync(PASSWORD, 4),
            );
            const bob = await call('/api/login', { body: { username: 'Bob', password: PASSWORD } });
            const bobToken = bob.body?.token as string;

            expect((await call(`/api/tool/v1/snapshot/${saved.body!.id}`, { token: bobToken })).response.status).toBe(
                404,
            );
            expect((await call('/api/tool/v1/snapshot', { token: bobToken })).response.status).toBe(404);
            const bobPut = await call('/api/tool/v1/snapshot', {
                method: 'PUT',
                body: { data },
                token: bobToken,
            });
            expect(bobPut.response.status).toBe(201);
            expect(bobPut.body?.id).not.toBe(saved.body!.id);
        });

        it('prunes to the retention policy and keeps the newest revision', async () => {
            let newestId = '';
            for (let i = 0; i < 6; i++) {
                const saved = await put({ data: { ...data, seq: i } });
                expect(saved.response.status).toBe(201);
                newestId = saved.body!.id;
            }
            const list = await call('/api/tool/v1/snapshots', { token });
            expect(list.body).toHaveLength(5);
            expect(list.body!.map((row: { id: string }) => row.id)).toContain(newestId);
            expect((await call('/api/tool/v1/snapshot', { token })).body?.id).toBe(newestId);
        });

        it('rejects malformed and oversized writes', async () => {
            const missing = await put({ nope: true });
            expect(missing.response.status).toBe(400);
            expect(missing.body?.code).toBe('INVALID_REQUEST');

            const huge = await put({ data: { cloud: 1, blob: 'x'.repeat(2 * 1024 * 1024) } });
            expect(huge.response.status).toBe(413);
            expect(huge.body?.code).toBe('TOO_LARGE');
        });

        it('rejects invalid JSON with 400', async () => {
            const response = await worker.fetch(
                new Request('https://example.com/api/tool/v1/snapshot', {
                    method: 'PUT',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: '{not json',
                }),
                env,
                ctx,
            );
            expect(response.status).toBe(400);
            expect(((await response.json()) as Record<string, unknown>).code).toBe('INVALID_REQUEST');
        });

        it('returns 429 when the content-write limiter refuses', async () => {
            env = {
                ...env,
                RL_PER_MINUTE_20: { limit: async () => ({ success: false }) },
            } as unknown as Env;
            const result = await put({ data });
            expect(result.response.status).toBe(429);
            expect(result.body?.code).toBe('RATE_LIMITED');
        });

        it('maps the D1 row-size limit to 413, not 500', async () => {
            const real = env.DB;
            env = {
                ...env,
                DB: {
                    prepare(sql: string) {
                        if (/INSERT INTO content/i.test(sql)) {
                            return {
                                bind() {
                                    return {
                                        run: async () => {
                                            throw new Error('string or blob too big: SQLITE_TOOBIG');
                                        },
                                    };
                                },
                            };
                        }
                        return real.prepare(sql);
                    },
                },
            } as unknown as Env;
            const result = await put({ data });
            expect(result.response.status).toBe(413);
            expect(result.body?.code).toBe('TOO_LARGE');
        });

        it('stops reading an oversized chunked body at the cap', async () => {
            const cap = 2 * 1024 * 1024;
            const chunk = new Uint8Array(64 * 1024).fill(120);
            let pulled = 0;
            const stream = new ReadableStream<Uint8Array>({
                pull(controller) {
                    pulled += chunk.byteLength;
                    if (pulled > cap + 4 * chunk.byteLength) {
                        controller.error(new Error('read past the cap'));
                        return;
                    }
                    controller.enqueue(chunk);
                },
            });
            const response = await worker.fetch(
                new Request('https://example.com/api/tool/v1/snapshot', {
                    method: 'PUT',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: stream,
                    duplex: 'half',
                } as RequestInit & { duplex: 'half' }),
                env,
                ctx,
            );
            expect(response.status).toBe(413);
        });

        it('logs out only the caller’s session', async () => {
            const other = await call('/api/tool/v1/login', {
                body: { username: 'Alice', password: PASSWORD },
            });
            const otherToken = other.body?.token as string;

            const out = await call('/api/tool/v1/logout', { method: 'POST', token });
            expect(out.response.status).toBe(200);
            expect(out.body).toEqual({ ok: true });

            const me = await call('/api/tool/v1/me', { token });
            expect(me.response.status).toBe(401);
            expect(me.response.headers.get('X-Session-Invalid')).toBe('1');

            expect((await call('/api/tool/v1/me', { token: otherToken })).response.status).toBe(200);
        });
    });

    describe('/api/content compatibility', () => {
        it('keeps the existing write and metadata responses', async () => {
            const data = { cloud: 1, iv: 'aXY=', data: 'ZGF0YQ==' };
            const saved = await call('/api/content', { body: { data }, token });
            expect(saved.response.status).toBe(201);
            expect(saved.body?.message).toBe('Content saved');
            expect(typeof saved.body?.id).toBe('string');

            const list = await call('/api/content', { token });
            expect(list.response.status).toBe(200);
            expect(list.body).toEqual([
                {
                    id: saved.body!.id,
                    created_at: expect.any(Number),
                    data_size: JSON.stringify(data).length,
                },
            ]);

            const one = await call(`/api/content/${saved.body!.id}`, { token });
            expect(one.response.status).toBe(200);
            expect(one.body?.id).toBe(saved.body!.id);
            expect(one.body?.data).toBe(JSON.stringify(data));
        });
    });
});
