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

describe.skipIf(!sqliteModule || !fsModule)('/api/tool/v1', () => {
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
