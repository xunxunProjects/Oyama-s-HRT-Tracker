import { describe, expect, it } from 'vitest';
import worker, * as workerModule from '../worker';
import type { Env } from '../worker';
import { getClientIP } from '../requestInput';

// Request handling around the client address, the passkey origin and request
// bodies that parse as JSON but carry the wrong types. None of these paths
// should reach the database, so any query fails the test loudly.

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const noDb = new Proxy(
    {},
    {
        get() {
            throw new Error('unexpected database access');
        },
    },
);
const env = { DB: noDb, JWT_SECRET } as unknown as Env;
const ctx = {
    waitUntil: () => {},
    passThroughOnException: () => {},
} as unknown as Parameters<typeof worker.fetch>[2];

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    worker.fetch(
        new Request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
        }),
        env,
        ctx,
    );

describe('worker module', () => {
    // workerd treats every named export of the main module as an entrypoint and
    // refuses to start the Worker when one is a plain value. The build and the
    // type check both pass in that state, so this is the only early warning.
    it('exports nothing but entrypoints', () => {
        const values = Object.entries(workerModule).filter(
            ([name, value]) => name !== 'default' && typeof value !== 'function',
        );
        expect(values.map(([name]) => name)).toEqual([]);
    });
});

describe('getClientIP', () => {
    const withHeaders = (headers: Record<string, string>) => new Request('https://example.com/', { headers });

    it('takes the last X-Forwarded-For hop, the one the proxy appended', () => {
        const request = withHeaders({ 'X-Forwarded-For': '6.6.6.6, 203.0.113.7' });
        expect(getClientIP(request, { TRUSTED_IP_SOURCE: 'x-forwarded-for' } as Env)).toBe('203.0.113.7');
    });

    it('reads CF-Connecting-IP by default and nothing when set to none', () => {
        const request = withHeaders({ 'CF-Connecting-IP': '198.51.100.2', 'X-Forwarded-For': '6.6.6.6' });
        expect(getClientIP(request, {} as Env)).toBe('198.51.100.2');
        expect(getClientIP(request, { TRUSTED_IP_SOURCE: 'none' } as Env)).toBeNull();
    });
});

describe('passkey origin', () => {
    it('accepts the https form of the host when a TLS proxy forwards plain http', async () => {
        const response = await post(
            'http://hrt.example.com/api/auth/passkey-options',
            {},
            {
                Origin: 'https://hrt.example.com',
            },
        );
        expect(response.status).toBe(200);
    });

    it('still refuses an origin on another host', async () => {
        const response = await post(
            'http://hrt.example.com/api/auth/passkey-options',
            {},
            {
                Origin: 'https://attacker.example',
            },
        );
        expect(response.status).toBe(403);
    });
});

describe('forged session tokens', () => {
    const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

    it('answers an alg:none token with 401, not a crash', async () => {
        const token = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({
            sub: 'admin',
            role: 'admin',
            sid: 'forged',
        })}.`;
        const response = await worker.fetch(
            new Request('https://example.com/api/user/sessions', {
                headers: { Authorization: `Bearer ${token}` },
            }),
            env,
            ctx,
        );
        expect(response.status).toBe(401);
    });
});

describe('wrongly typed credentials', () => {
    it('answers a numeric password on register with 400, not a crash', async () => {
        const response = await post('https://example.com/api/register', {
            username: 'alice1',
            password: 123456789012,
        });
        expect(response.status).toBe(400);
    });

    it('answers a numeric username on login with 401, not a crash', async () => {
        const response = await post('https://example.com/api/login', { username: 12345, password: 'whatever-123' });
        expect(response.status).toBe(401);
    });
});
