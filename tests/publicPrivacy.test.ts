import { beforeEach, describe, expect, it } from 'vitest';
import worker, { type Env } from '../worker';
import { d1, hasSqlite, migratedDatabase, type SqliteDatabase } from './sqliteD1';

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as Parameters<typeof worker.fetch>[2];

let db: SqliteDatabase;
let env: Env;

const call = async (path: string) => {
    const response = await worker.fetch(new Request(`https://example.com${path}`), env, ctx);
    const text = await response.text();
    return { response, body: text ? (JSON.parse(text) as Record<string, any>) : null };
};

describe.skipIf(!hasSqlite)('public privacy surface', () => {
    beforeEach(() => {
        db = migratedDatabase();
        db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
            'user-1',
            'Alice',
            'hash',
            1_700_000_000,
        );
        env = {
            DB: d1(db),
            JWT_SECRET,
            AVATAR_BUCKET: { get: async () => null },
        } as unknown as Env;
    });

    it('returns the same 404 for an unknown user and a user with no avatar', async () => {
        const existing = await call('/api/user/avatar/Alice');
        const unknown = await call('/api/user/avatar/Nobody');

        expect(existing.response.status).toBe(404);
        expect(unknown.response.status).toBe(404);
        expect(existing.body?.code).toBe('NOT_FOUND');
        expect(unknown.body?.code).toBe('NOT_FOUND');
    });

    it('publishes registration times without a UUID-derived identifier', async () => {
        const result = await call('/api/transparency');

        expect(result.response.status).toBe(200);
        expect(Array.isArray(result.body?.recent_registrations)).toBe(true);
        for (const value of result.body?.recent_registrations ?? []) {
            expect(typeof value).toBe('number');
            expect(value % 3600).toBe(0);
        }
        expect(result.body).not.toHaveProperty('recent_registrations.0.anon_id');
        expect(JSON.stringify(result.body)).not.toContain('anon_id');
    });
});
