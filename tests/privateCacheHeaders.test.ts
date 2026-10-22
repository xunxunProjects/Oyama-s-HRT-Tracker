import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import worker, { type Env } from '../worker';

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const NOW = Math.floor(Date.now() / 1000);

function fakeEnv(): Env {
    // Only the queries these three routes need are answered; anything else is
    // a test bug and should fail loudly rather than hit a real database.
    const prepare = (sql: string) => {
        const statement = {
            bind: () => statement,
            first: async () => {
                if (sql.includes('FROM sessions WHERE id')) return { last_used_at: NOW };
                if (sql.includes('totp_secret')) return { totp_secret: null };
                if (sql.includes('COUNT(*) as cnt')) return { cnt: 0 };
                throw new Error(`unexpected first() query: ${sql}`);
            },
            all: async () => {
                if (sql.includes('FROM sessions WHERE user_id')) return { results: [] };
                if (sql.includes('FROM passkeys WHERE user_id')) return { results: [] };
                throw new Error(`unexpected all() query: ${sql}`);
            },
            run: async () => ({ meta: { changes: 0 } }),
        };
        return statement;
    };
    return { DB: { prepare }, JWT_SECRET } as unknown as Env;
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

async function token(): Promise<string> {
    return new SignJWT({ sid: 'sid-1', role: 'user', username: 'audit-user' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('audit-user')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(JWT_SECRET));
}

async function get(path: string): Promise<Response> {
    return worker.fetch(
        new Request(`https://example.com${path}`, {
            headers: { Authorization: `Bearer ${await token()}` },
        }),
        fakeEnv(),
        ctx as unknown as ExecutionContext,
    );
}

describe('private GET responses are not cacheable', () => {
    for (const path of ['/api/user/sessions', '/api/user/2fa/status', '/api/user/passkeys']) {
        it(`${path} sends no-store cache headers`, async () => {
            const response = await get(path);
            expect(response.status).toBe(200);
            expect(response.headers.get('Cache-Control')).toBe('no-store');
            expect(response.headers.get('Pragma')).toBe('no-cache');
            expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
        });
    }
});
