import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import worker, { type Env } from '../worker';

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const NOW = Math.floor(Date.now() / 1000);
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as Parameters<typeof worker.fetch>[2];

function envForSession(): Env {
    const prepare = (sql: string) => {
        const statement = {
            bind: () => statement,
            first: async () => {
                if (sql.includes('FROM sessions WHERE id')) return { last_used_at: NOW };
                throw new Error(`unexpected first() query: ${sql}`);
            },
            run: async () => ({ meta: { changes: 0 } }),
        };
        return statement;
    };
    return { DB: { prepare }, JWT_SECRET } as unknown as Env;
}

function sessionToken(alg: 'HS256' | 'HS384'): Promise<string> {
    return new SignJWT({ sid: 'sid-1', role: 'user', username: 'audit-user' })
        .setProtectedHeader({ alg })
        .setSubject('audit-user')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(JWT_SECRET));
}

const request = (path: string, token?: string) =>
    worker.fetch(
        new Request(`https://example.com${path}`, {
            ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        }),
        envForSession(),
        ctx,
    );

describe('session token algorithm', () => {
    it('still accepts the HS256 tokens this Worker issues', async () => {
        const response = await request('/api/tool/v1/me', await sessionToken('HS256'));
        expect(response.status).toBe(200);
    });

    it('rejects a token signed with another HMAC algorithm and the same secret', async () => {
        const response = await request('/api/tool/v1/me', await sessionToken('HS384'));
        expect(response.status).toBe(401);
    });
});

describe('response privacy headers', () => {
    it('sets referrer and opener isolation on every API response', async () => {
        const response = await request('/api/tool/v1/version');
        expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
        expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    });
});

describe('public avatar reads', () => {
    it('are rate limited before touching the database or R2', async () => {
        const env = {
            DB: {
                prepare: () => {
                    throw new Error('avatar lookup should not run when rate limited');
                },
            },
            JWT_SECRET,
            RL_PER_MINUTE_300: { limit: async () => ({ success: false }) },
        } as unknown as Env;
        const response = await worker.fetch(new Request('https://example.com/api/user/avatar/Alice'), env, ctx);
        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('60');
    });
});
