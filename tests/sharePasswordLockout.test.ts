import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import worker, { type Env } from '../worker';

// Lockout policy under test: the fifth consecutive miss locks for 15 minutes,
// every further miss doubles that, capped at a day; a successful unlock clears
// the run. The counting runs inside the storage engine (single UPDATE with
// `failed_attempts = failed_attempts + 1`), so concurrent misses must not lose
// each other's increments. The fake below executes the statements the handler
// really prepares (it throws on anything else, so drift is loud) and applies
// their SQL semantics, which is what lets the concurrency tests be adversarial:
// every racing request is released from the row read at the same moment.

const PASSWORD = 'Correct-Horse-9!x';
const WRONG = 'definitely-not-the-password';
const TOKEN = 'T'.repeat(43);
const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const T0 = 1_800_000_000_000;
const PASSWORD_HASH = await bcrypt.hash(PASSWORD, 4);

interface ShareRow {
    id: string;
    user_id: string;
    token_hash: string;
    snapshot_json: string;
    password_hash: string | null;
    expires_at: number | null;
    created_at: number;
    is_live: number;
    share_mode: string | null;
    updated_at: number | null;
    encrypted: number;
    key_wrapped: string | null;
    failed_attempts: number;
    locked_until: number | null;
}

async function hashToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

const TOKEN_HASH = await hashToken(TOKEN);

class FakeStatement {
    private params: unknown[] = [];

    constructor(
        private readonly db: FakeD1,
        private readonly sql: string,
    ) {}

    bind(...params: unknown[]): FakeStatement {
        this.params = params;
        return this;
    }

    async first<T = unknown>(): Promise<T | null> {
        await this.db.tick();
        if (this.sql.includes('SELECT password_hash')) {
            // Hold the read until every racing request has made it, so the tests
            // exercise the worst interleaving rather than a lucky serialization.
            await this.db.arriveAtSelectBarrier();
            return this.db.snapshot(this.params[0] as string) as T | null;
        }
        if (this.sql.includes('SELECT snapshot_json')) {
            const row = this.db.snapshot(this.params[0] as string);
            return row ? ({ snapshot_json: row.snapshot_json, encrypted: row.encrypted } as T) : null;
        }
        throw new Error(`Unsupported SELECT in test fake: ${this.sql}`);
    }

    async run(): Promise<{ success: boolean; meta: { changes: number } }> {
        await this.db.tick();
        if (this.sql.includes('failed_attempts = failed_attempts + 1')) {
            // Mirrors the SQL: increment and lock escalation are evaluated against
            // the current row at execution time, atomically.
            this.db.applyMiss(this.params[0] as number, this.params[1] as string);
            return { success: true, meta: { changes: 1 } };
        }
        if (this.sql.includes('failed_attempts = 0, locked_until = NULL')) {
            this.db.applyReset(this.params[0] as string);
            return { success: true, meta: { changes: 1 } };
        }
        throw new Error(`Unsupported UPDATE in test fake: ${this.sql}`);
    }
}

class FakeD1 {
    readonly rows = new Map<string, ShareRow>();
    readonly capturedSql: string[] = [];
    private barrierRemaining = 0;
    private barrierWaiters: Array<() => void> = [];

    prepare(sql: string): FakeStatement {
        this.capturedSql.push(sql);
        return new FakeStatement(this, sql);
    }

    tick(): Promise<void> {
        return Promise.resolve();
    }

    armSelectBarrier(count: number): void {
        this.barrierRemaining = count;
        this.barrierWaiters = [];
    }

    snapshot(tokenHash: string): ShareRow | null {
        const row = this.rows.get(tokenHash);
        return row ? { ...row } : null;
    }

    async arriveAtSelectBarrier(): Promise<void> {
        if (this.barrierRemaining <= 0) return;
        this.barrierRemaining -= 1;
        if (this.barrierRemaining === 0) {
            const waiters = this.barrierWaiters;
            this.barrierWaiters = [];
            for (const release of waiters) release();
            return;
        }
        await new Promise<void>(resolve => {
            this.barrierWaiters.push(resolve);
            setTimeout(resolve, 500);
        });
    }

    applyMiss(nowSeconds: number, tokenHash: string): void {
        const row = this.rows.get(tokenHash);
        if (!row) return;
        const previous = row.failed_attempts;
        row.failed_attempts = previous + 1;
        if (row.failed_attempts >= 5) {
            const lockSeconds = Math.min(900 * 2 ** Math.min(previous - 4, 7), 86400);
            row.locked_until = Math.max(row.locked_until ?? 0, nowSeconds + lockSeconds);
        }
    }

    applyReset(tokenHash: string): void {
        const row = this.rows.get(tokenHash);
        if (!row) return;
        row.failed_attempts = 0;
        row.locked_until = null;
    }
}

let fake: FakeD1;
let env: Env;
let ctx: Parameters<typeof worker.fetch>[2];

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function currentRow(): ShareRow {
    return fake.rows.get(TOKEN_HASH)!;
}

function access(token: string, password?: string): Promise<Response> {
    return worker.fetch(
        new Request('https://example.com/api/shares/access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(password === undefined ? { token } : { token, password }),
        }),
        env,
        ctx,
    );
}

beforeEach(async () => {
    vi.setSystemTime(T0);
    fake = new FakeD1();
    env = { DB: fake, JWT_SECRET } as unknown as Env;
    ctx = {
        waitUntil: (promise: Promise<unknown>) => {
            void Promise.resolve(promise).catch(() => {});
        },
        passThroughOnException: () => {},
    } as unknown as Parameters<typeof worker.fetch>[2];
    const now = nowSeconds();
    fake.rows.set(TOKEN_HASH, {
        id: 'share-1',
        user_id: 'user-1',
        token_hash: TOKEN_HASH,
        snapshot_json: JSON.stringify({ mode: 'static', doses: [] }),
        password_hash: PASSWORD_HASH,
        expires_at: now + 3600,
        created_at: now,
        is_live: 0,
        share_mode: null,
        updated_at: now,
        encrypted: 0,
        key_wrapped: null,
        failed_attempts: 0,
        locked_until: null,
    });
});

describe('share password lockout', () => {
    it('counts misses on the row and leaves the share unlocked below the threshold', async () => {
        for (let i = 0; i < 4; i++) {
            const response = await access(TOKEN, WRONG);
            expect(response.status).toBe(403);
            expect(((await response.json()) as { code: string }).code).toBe('INVALID_PASSWORD');
        }
        expect(currentRow().failed_attempts).toBe(4);
        expect(currentRow().locked_until).toBeNull();
    });

    it('arms a 15 minute lock on the fifth consecutive miss', async () => {
        for (let i = 0; i < 5; i++) await access(TOKEN, WRONG);
        expect(currentRow().failed_attempts).toBe(5);
        expect(currentRow().locked_until).toBe(nowSeconds() + 900);
    });

    it('refuses even the correct password while the lock is armed, with Retry-After', async () => {
        for (let i = 0; i < 5; i++) await access(TOKEN, WRONG);
        const lockedUntil = currentRow().locked_until;

        const response = await access(TOKEN, PASSWORD);
        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('900');
        expect(((await response.json()) as { code: string }).code).toBe('RATE_LIMITED');
        expect(currentRow().failed_attempts).toBe(5);
        expect(currentRow().locked_until).toBe(lockedUntil);
    });

    it('doubles the lock for a miss after the lock has expired', async () => {
        for (let i = 0; i < 5; i++) await access(TOKEN, WRONG);
        vi.setSystemTime(T0 + 901_000);

        const response = await access(TOKEN, WRONG);
        expect(response.status).toBe(403);
        expect(currentRow().failed_attempts).toBe(6);
        expect(currentRow().locked_until).toBe(nowSeconds() + 1800);
    });

    it('caps the backoff at 24 hours', async () => {
        currentRow().failed_attempts = 11;
        currentRow().locked_until = nowSeconds() - 1;

        const response = await access(TOKEN, WRONG);
        expect(response.status).toBe(403);
        expect(currentRow().failed_attempts).toBe(12);
        expect(currentRow().locked_until).toBe(nowSeconds() + 24 * 60 * 60);
    });

    it('clears the failure run after a successful unlock', async () => {
        currentRow().failed_attempts = 3;

        const response = await access(TOKEN, PASSWORD);
        expect(response.status).toBe(200);
        expect(((await response.json()) as { passwordRequired: boolean }).passwordRequired).toBe(true);
        expect(currentRow().failed_attempts).toBe(0);
        expect(currentRow().locked_until).toBeNull();
    });

    it('accepts the password after the lock has expired and resets the state', async () => {
        currentRow().failed_attempts = 5;
        currentRow().locked_until = nowSeconds() - 1;

        const response = await access(TOKEN, PASSWORD);
        expect(response.status).toBe(200);
        expect(currentRow().failed_attempts).toBe(0);
        expect(currentRow().locked_until).toBeNull();
    });

    it('keeps every miss when wrong passwords race (no lost updates)', async () => {
        // The old read-modify-write version read failed_attempts into JavaScript
        // and wrote `attempts + 1`; with all four reads released together it wrote
        // the same successor four times. The atomic increment must keep all four.
        fake.armSelectBarrier(4);
        const responses = await Promise.all([1, 2, 3, 4].map(() => access(TOKEN, WRONG)));
        for (const response of responses) expect(response.status).toBe(403);
        expect(currentRow().failed_attempts).toBe(4);
        expect(currentRow().locked_until).toBeNull();
    });

    it('escalates monotonically when concurrent misses cross the threshold', async () => {
        fake.armSelectBarrier(6);
        const responses = await Promise.all([1, 2, 3, 4, 5, 6].map(() => access(TOKEN, WRONG)));
        for (const response of responses) expect(response.status).toBe(403);
        // Six increments must all land, and the longest lock any of them computed
        // (count 6 → 1800s) must survive the others thanks to MAX(COALESCE(...)).
        expect(currentRow().failed_attempts).toBe(6);
        expect(currentRow().locked_until).toBe(nowSeconds() + 1800);
    });

    it('keeps the atomic increment and reset statement shapes in the SQL', async () => {
        await access(TOKEN, WRONG);
        currentRow().failed_attempts = 2;
        await access(TOKEN, PASSWORD);

        const failureSql = fake.capturedSql.find(sql => sql.includes('failed_attempts = failed_attempts + 1'));
        expect(failureSql, 'failure counter statement').toBeDefined();
        expect(failureSql).toContain('CASE');
        expect(failureSql).toContain('1 << MIN(failed_attempts - 4, 7)');
        expect(failureSql).toContain('86400');
        expect(failureSql).toContain('MAX(COALESCE(locked_until, 0)');
        expect(failureSql).not.toContain('failed_attempts = ?');

        const resetSql = fake.capturedSql.find(sql => sql.includes('failed_attempts = 0'));
        expect(resetSql, 'reset statement').toBeDefined();
        expect(resetSql).toContain('locked_until = NULL');
    });
});

// ---------------------------------------------------------------------------
// Cross-check the statements the handler actually prepared against a real
// SQLite engine (the same one node ships). This is NOT workerd/D1, so it
// verifies syntax and arithmetic semantics, not D1's deployment behavior; if
// node:sqlite is unavailable the block is skipped rather than pretended.
// ---------------------------------------------------------------------------
const sqliteSpecifier = 'node:sqlite';
const fsSpecifier = 'node:fs';
let sqliteModule: { DatabaseSync: new (path: string, options?: Record<string, unknown>) => any } | null = null;
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

describe.skipIf(!sqliteModule || !fsModule)('generated SQL on a real SQLite engine (node:sqlite, not D1)', () => {
    it('migrations apply and the lockout statements enforce the policy', async () => {
        const db = new sqliteModule!.DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
        db.exec('PRAGMA foreign_keys = OFF');
        const migrationDir = new URL('../migrations/', import.meta.url);
        const migrationFiles = fsModule!
            .readdirSync(migrationDir)
            .filter(name => name.endsWith('.sql'))
            .sort();
        for (const file of migrationFiles) {
            db.exec(fsModule!.readFileSync(new URL(file, migrationDir), 'utf8'));
        }

        const now = nowSeconds();
        db.prepare(
            'INSERT INTO dosage_shares (id, user_id, token_hash, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run('share-1', 'user-1', TOKEN_HASH, '{}', now);

        // Capture the exact statements the handler prepares: a wrong password
        // prepares the counter statement, a following correct one prepares the
        // reset statement.
        const capturingFake = new FakeD1();
        const capturingEnv = { DB: capturingFake, JWT_SECRET: env.JWT_SECRET } as unknown as Env;
        capturingFake.rows.set(TOKEN_HASH, { ...currentRow() });
        const capturingRequest = (password: string) =>
            new Request('https://example.com/api/shares/access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: TOKEN, password }),
            });
        await worker.fetch(capturingRequest(WRONG), capturingEnv, ctx);
        await worker.fetch(capturingRequest(PASSWORD), capturingEnv, ctx);
        const failureSql = capturingFake.capturedSql.find(sql => sql.includes('failed_attempts = failed_attempts + 1'));
        const resetSql = capturingFake.capturedSql.find(sql => sql.includes('failed_attempts = 0'));
        expect(failureSql, 'captured failure statement').toBeDefined();
        expect(resetSql, 'captured reset statement').toBeDefined();

        const miss = db.prepare(failureSql!);
        for (let i = 0; i < 6; i++) miss.run(now, TOKEN_HASH);
        const afterSix = db
            .prepare('SELECT failed_attempts, locked_until FROM dosage_shares WHERE token_hash = ?')
            .get(TOKEN_HASH) as { failed_attempts: number; locked_until: number | null };
        expect(afterSix.failed_attempts).toBe(6);
        expect(afterSix.locked_until).toBe(now + 1800);

        // A miss long after the cap is reached keeps the lock at the cap.
        db.prepare('UPDATE dosage_shares SET failed_attempts = 99, locked_until = ? WHERE token_hash = ?').run(
            now - 1,
            TOKEN_HASH,
        );
        miss.run(now, TOKEN_HASH);
        const atCap = db
            .prepare('SELECT failed_attempts, locked_until FROM dosage_shares WHERE token_hash = ?')
            .get(TOKEN_HASH) as { failed_attempts: number; locked_until: number | null };
        expect(atCap.failed_attempts).toBe(100);
        expect(atCap.locked_until).toBe(now + 86400);

        db.prepare(resetSql!).run(TOKEN_HASH);
        const afterReset = db
            .prepare('SELECT failed_attempts, locked_until FROM dosage_shares WHERE token_hash = ?')
            .get(TOKEN_HASH) as { failed_attempts: number; locked_until: number | null };
        expect(afterReset.failed_attempts).toBe(0);
        expect(afterReset.locked_until).toBeNull();

        db.close();
    });
});
