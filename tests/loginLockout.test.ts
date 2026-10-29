import { beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import worker, { type Env } from '../worker';
import { d1, hasSqlite, migratedDatabase, type SqliteDatabase } from './sqliteD1';

// Sign-in lock policy under test: the fifth consecutive miss on an account
// (wrong password or wrong second factor) locks it for 15 minutes, further
// misses double that up to an hour, and a successful sign-in clears the run.
// A device that signed in before carries a pass that is not held back by the
// lock. The handler runs against a real SQLite engine (node:sqlite) with every
// migration applied, through a thin D1-shaped adapter: this checks the SQL and
// the flow, not D1's deployment behavior.

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const PASSWORD = 'violet harbor tiny lantern';
const WRONG = 'not the password at all';

let db: SqliteDatabase;
let env: Env;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as Parameters<typeof worker.fetch>[2];

const post = async (path: string, body: Record<string, unknown>) => {
    const response = await worker.fetch(
        new Request(`https://example.com${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
        env,
        ctx,
    );
    return { response, body: (await response.json()) as Record<string, unknown> };
};

const login = (username: string, password: string, extra: Record<string, unknown> = {}) =>
    post('/api/login', { username, password, ...extra });

const backoffRow = (account: string) =>
    db.prepare('SELECT failed_attempts, locked_until FROM login_backoff WHERE account = ?').get(account) as
        { failed_attempts: number; locked_until: number | null } | undefined;

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe.skipIf(!hasSqlite)('sign-in lock', () => {
    beforeEach(() => {
        db = migratedDatabase();
        db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
            'user-1',
            'Alice',
            bcrypt.hashSync(PASSWORD, 4),
        );
        env = {
            DB: d1(db),
            JWT_SECRET,
            ADMIN_USERNAME: 'admin',
            ADMIN_PASSWORD: 'quiet maple orbit 73',
        } as unknown as Env;
    });

    it('locks the account on the fifth miss and refuses even the right password', async () => {
        for (let i = 0; i < 4; i++) expect((await login('Alice', WRONG)).response.status).toBe(401);
        expect(backoffRow('alice')).toEqual({ failed_attempts: 4, locked_until: null });

        expect((await login('Alice', WRONG)).response.status).toBe(401);
        expect(backoffRow('alice')!.locked_until).toBeGreaterThanOrEqual(nowSeconds() + 899);

        const locked = await login('Alice', PASSWORD);
        expect(locked.response.status).toBe(429);
        expect(locked.body.code).toBe('ACCOUNT_LOCKED');
        expect(Number(locked.response.headers.get('Retry-After'))).toBeGreaterThan(890);
    });

    it('caps the lock at an hour', async () => {
        db.prepare('INSERT INTO login_backoff (account, failed_attempts, locked_until) VALUES (?, ?, ?)').run(
            'alice',
            40,
            nowSeconds() - 1,
        );
        await login('Alice', WRONG);
        expect(backoffRow('alice')!.locked_until).toBe(nowSeconds() + 3600);
    });

    it('lets a device that signed in before through the lock, and clears the run', async () => {
        const first = await login('Alice', PASSWORD);
        expect(first.response.status).toBe(200);
        const devicePass = first.body.devicePass as string;
        expect(devicePass).toEqual(expect.any(String));

        for (let i = 0; i < 5; i++) await login('Alice', WRONG);
        expect((await login('Alice', PASSWORD)).response.status).toBe(429);

        const trusted = await login('Alice', PASSWORD, { device_pass: devicePass });
        expect(trusted.response.status).toBe(200);
        expect(backoffRow('alice')).toBeUndefined();
    });

    it('ends device passes when the password changes', async () => {
        const { devicePass } = (await login('Alice', PASSWORD)).body;
        for (let i = 0; i < 5; i++) await login('Alice', WRONG);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
            bcrypt.hashSync('a new password 4 alice', 4),
            'user-1',
        );
        const response = await login('Alice', 'a new password 4 alice', { device_pass: devicePass });
        expect(response.response.status).toBe(429);
    });

    it('counts a wrong second factor as a miss', async () => {
        db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run('JBSWY3DPEHPK3PXP', 'user-1');
        const response = await login('Alice', PASSWORD, { backup_code: 'not-a-code' });
        expect(response.response.status).toBe(401);
        expect(response.body.code).toBe('TWO_FACTOR_INVALID');
        expect(backoffRow('alice')!.failed_attempts).toBe(1);
    });

    it('keeps no record for names nobody owns', async () => {
        for (let i = 0; i < 6; i++) expect((await login('nobody-here', WRONG)).response.status).toBe(401);
        expect(backoffRow('nobody-here')).toBeUndefined();
    });

    it('locks the env-managed admin the same way, and its device pass gets through', async () => {
        const first = await login('Admin', 'quiet maple orbit 73');
        expect(first.response.status).toBe(200);
        const devicePass = first.body.devicePass as string;

        for (let i = 0; i < 5; i++) await login('admin', WRONG);
        expect(backoffRow('admin')!.failed_attempts).toBe(5);
        const locked = await login('admin', 'quiet maple orbit 73');
        expect(locked.body.code).toBe('ACCOUNT_LOCKED');

        expect((await login('admin', 'quiet maple orbit 73', { device_pass: devicePass })).response.status).toBe(200);
    });

    it('flags a weak existing password at sign-in, and only then', async () => {
        db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
            'user-2',
            'bob',
            bcrypt.hashSync('12345678', 4),
        );
        expect((await login('bob', '12345678')).body.passwordWeak).toBe(true);
        expect((await login('Alice', PASSWORD)).body.passwordWeak).toBeUndefined();
    });

    it('gives a new account a device pass and drops a stale lock on its name', async () => {
        db.prepare('INSERT INTO login_backoff (account, failed_attempts, locked_until) VALUES (?, ?, ?)').run(
            'carol',
            9,
            nowSeconds() + 3600,
        );
        const registered = await post('/api/register', { username: 'carol', password: PASSWORD });
        expect(registered.response.status).toBe(201);
        expect(registered.body.devicePass).toEqual(expect.any(String));
        expect(backoffRow('carol')).toBeUndefined();
    });
});
