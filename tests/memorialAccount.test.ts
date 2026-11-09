import { beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import worker, { type Env } from '../worker';
import { d1, hasSqlite, migratedDatabase, type SqliteDatabase } from './sqliteD1';

// An admin can keep an account as a memorial: every device is signed out,
// nobody can sign in again, and nothing in it can be changed or deleted until
// it is made an ordinary account again.

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const PASSWORD = 'violet harbor tiny lantern';
const ADMIN_PASSWORD = 'quiet maple orbit 73';

let db: SqliteDatabase;
let env: Env;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as Parameters<typeof worker.fetch>[2];

const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const response = await worker.fetch(
        new Request(`https://example.com${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        }),
        env,
        ctx,
    );
    return { response, body: (await response.json()) as Record<string, any> };
};

const login = (username: string, password: string) => call('POST', '/api/login', { username, password });

describe.skipIf(!hasSqlite)('memorial accounts', () => {
    let admin: string;

    beforeEach(async () => {
        db = migratedDatabase();
        db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
            'user-1',
            'Alice',
            bcrypt.hashSync(PASSWORD, 4),
        );
        db.prepare('INSERT INTO content (id, user_id, data) VALUES (?, ?, ?)').run('b-1', 'user-1', '{"a":1}');
        env = { DB: d1(db), JWT_SECRET, ADMIN_USERNAME: 'admin', ADMIN_PASSWORD } as unknown as Env;
        admin = (await login('admin', ADMIN_PASSWORD)).body.token;
    });

    it('signs out every device, refuses sign-in and keeps the data', async () => {
        const session = await login('Alice', PASSWORD);
        expect(session.response.status).toBe(200);

        const marked = await call('PUT', '/api/admin/users/user-1/memorial', { memorial: true }, admin);
        expect(marked.response.status).toBe(200);

        expect((await call('GET', '/api/user/sessions', undefined, session.body.token)).response.status).toBe(401);
        const refused = await login('Alice', PASSWORD);
        expect(refused.response.status).toBe(403);
        expect(refused.body.code).toBe('ACCOUNT_MEMORIAL');
        // A wrong password learns nothing about the account.
        expect((await login('Alice', 'not the password at all')).body.code).toBe('INVALID_CREDENTIALS');

        const list = await call('GET', '/api/admin/users', undefined, admin);
        expect(list.body.users.find((u: any) => u.id === 'user-1').memorial).toBe(true);

        expect((await call('DELETE', '/api/admin/users/user-1', undefined, admin)).response.status).toBe(409);
        expect((await call('DELETE', '/api/admin/users/user-1/backups', undefined, admin)).response.status).toBe(409);
        expect(db.prepare('SELECT COUNT(*) AS n FROM content WHERE user_id = ?').get('user-1')).toEqual({ n: 1 });
        expect(db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get('user-1')).toEqual({ n: 1 });
    });

    it('can be made an ordinary account again', async () => {
        await call('PUT', '/api/admin/users/user-1/memorial', { memorial: true }, admin);
        const unmarked = await call('PUT', '/api/admin/users/user-1/memorial', { memorial: false }, admin);
        expect(unmarked.response.status).toBe(200);
        expect((await login('Alice', PASSWORD)).response.status).toBe(200);
    });

    it('is only for admins', async () => {
        const user = (await login('Alice', PASSWORD)).body.token;
        const tried = await call('PUT', '/api/admin/users/user-1/memorial', { memorial: true }, user);
        expect(tried.response.status).toBe(403);
    });

    it('leaves sign-in and the user list working before migration 0015 is applied', async () => {
        db.exec('ALTER TABLE users DROP COLUMN memorial_at');
        expect((await login('Alice', PASSWORD)).response.status).toBe(200);
        expect((await call('GET', '/api/admin/users', undefined, admin)).response.status).toBe(200);
        const marked = await call('PUT', '/api/admin/users/user-1/memorial', { memorial: true }, admin);
        expect(marked.body.code).toBe('MIGRATION_REQUIRED');
    });
});
