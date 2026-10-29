import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import worker, { type Env } from '../worker';
import { d1, migratedDatabase, type SqliteDatabase } from './sqliteD1';

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const PASSWORD = 'violet harbor tiny lantern';
const SERVICE_TOKEN = 'test-service-token-0123456789';
const CLIENT_IP = '203.0.113.7';
const CODE = 'a'.repeat(128);
const CODE_HASH = createHash('sha256').update(CODE).digest('hex');
const DEVICE_CERT = `-----BEGIN CERTIFICATE-----
MIIBijCCAS+gAwIBAgIUBmZzy0FhDHk8VFs/im9Xq3RlZG4wCgYIKoZIzj0EAwIw
GjEYMBYGA1UEAwwPaHJ0LXRlc3QtZGV2aWNlMB4XDTI2MTAyMDA3MDU0MloXDTI2
MTAyMjA3MDU0MlowGjEYMBYGA1UEAwwPaHJ0LXRlc3QtZGV2aWNlMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAEaimENcnVVNufn6U29tGIrHBIy6OQkDfycrgYMHMU
BeUKc54Bkdxr2oamSFFj+DPDXaTNZkLkgBB7sUCCLz4PzaNTMFEwHQYDVR0OBBYE
FJI+vwqItvpvG8h2IJpIOL/fVdNyMB8GA1UdIwQYMBaAFJI+vwqItvpvG8h2IJpI
OL/fVdNyMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhAO5qg7p0
l/2HfFZy1LwKZ2TSuRUhBaP7MN/ha4ABp7XdAiEA3vBPL2gAbm1hCf/Pca9FBsMO
Y8q1/TJg/CgLucvI9Jo=
-----END CERTIFICATE-----`;

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

const service = (path: string, body: unknown, options: { token?: string; ip?: string; country?: string } = {}) =>
    call(path, {
        body,
        headers: {
            'x-hrt-service': options.token ?? SERVICE_TOKEN,
            'x-hrt-client-ip': options.ip ?? CLIENT_IP,
            ...(options.country ? { 'x-hrt-client-country': options.country } : {}),
        },
    });

const startPairing = async (ip = CLIENT_IP, username = 'Alice') =>
    service(
        '/api/tool/v1/hrt/pair/start',
        {
            username,
            code_hash: CODE_HASH,
            device_certificate: DEVICE_CERT,
            device_name: 'Test device',
            client_version: 'hrt-tool/0.1.0',
        },
        { ip },
    );

const login = async () => {
    const result = await call('/api/login', { body: { username: 'Alice', password: PASSWORD } });
    return result.body?.token as string;
};

describe('/hrt pairing', () => {
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
            HRT_RAW_ENABLED: '1',
            HRT_SERVICE_TOKEN: SERVICE_TOKEN,
            HRT_IP_KEY: Buffer.alloc(32, 7).toString('base64'),
            PUBLIC_APP_ORIGIN: 'https://example.com',
        } as unknown as Env;
        token = await login();
        expect(token).not.toBe('');
    });

    it('advertises hrt support only when the transport is enabled', async () => {
        const version = await call('/api/tool/v1/version');
        expect(version.response.status).toBe(200);
        expect(version.body?.hrt).toEqual({ supported: true, version: 1 });
    });

    it('stores the code hash and an encrypted IP, and shows the request to the owner', async () => {
        const started = await startPairing();
        expect(started.response.status).toBe(200);
        expect(started.body?.request_id).toMatch(/^[0-9a-f]{32}$/);
        expect(started.body?.poll_secret).toMatch(/^[0-9a-f]{64}$/);
        expect(started.body?.verification_url).toContain('hrtPair=');

        const row = db
            .prepare('SELECT code_hash, ip_encrypted, status FROM hrt_pair_requests WHERE id = ?')
            .get(started.body!.request_id) as { code_hash: string; ip_encrypted: string; status: string };
        expect(row.code_hash).toBe(CODE_HASH);
        expect(row.status).toBe('pending');
        expect(row.ip_encrypted).not.toContain(CLIENT_IP);

        const listed = await call('/api/hrt/requests', { token });
        expect(listed.response.status).toBe(200);
        expect(listed.body?.requests).toHaveLength(1);
        expect(listed.body?.requests[0]).toMatchObject({
            id: started.body!.request_id,
            ip: CLIENT_IP,
            status: 'pending',
            deviceName: 'Test device',
        });
        expect(JSON.stringify(listed.body)).not.toContain(CODE);
        expect(JSON.stringify(listed.body)).not.toContain('code_hash');
    });

    it('issues a device-bound token after web approval', async () => {
        const started = await startPairing();
        const requestId = started.body!.request_id as string;
        const wrong = await call(`/api/hrt/requests/${requestId}/approve`, {
            token,
            body: { code: 'b'.repeat(128) },
        });
        expect(wrong.response.status).toBe(401);

        const approved = await call(`/api/hrt/requests/${requestId}/approve`, {
            token,
            body: { code: CODE },
        });
        expect(approved.response.status).toBe(200);

        const status = await service('/api/tool/v1/hrt/pair/status', {
            request_id: requestId,
            poll_secret: started.body!.poll_secret,
        });
        expect(status.response.status).toBe(200);
        expect(status.body?.status).toBe('approved');
        expect(status.body?.user).toEqual({ id: 'user-1', username: 'Alice' });
        const pairedToken = status.body!.token as string;
        expect(pairedToken).not.toBe('');

        const device = db.prepare('SELECT id, fingerprint FROM hrt_devices WHERE user_id = ?').get('user-1') as {
            id: string;
            fingerprint: string;
        };
        expect(device.fingerprint).toMatch(/^[0-9a-f]{64}$/);

        const me = await call('/api/tool/v1/me', {
            token: pairedToken,
            headers: { 'x-hrt-device-fingerprint': device.fingerprint },
        });
        expect(me.response.status).toBe(200);
        const mismatch = await call('/api/tool/v1/me', {
            token: pairedToken,
            headers: { 'x-hrt-device-fingerprint': 'a'.repeat(64) },
        });
        expect(mismatch.response.status).toBe(401);
        const authorize = await service('/api/tool/v1/hrt/device/authorize', {
            fingerprint: device.fingerprint,
        });
        expect(authorize.response.status).toBe(200);

        const revoked = await call(`/api/hrt/devices/${device.id}/revoke`, {
            token,
            method: 'POST',
        });
        expect(revoked.response.status).toBe(200);
        const after = await service('/api/tool/v1/hrt/device/authorize', {
            fingerprint: device.fingerprint,
        });
        expect(after.response.status).toBe(401);
        const rawAfter = await call('/api/tool/v1/me', {
            token: pairedToken,
            headers: { 'x-hrt-device-fingerprint': device.fingerprint },
        });
        expect(rawAfter.response.status).toBe(401);
    });

    it('black-holes the eleventh pairing attempt and exempts a trusted IP', async () => {
        for (let index = 0; index < 10; index += 1) {
            const result = await startPairing();
            expect(result.response.status).toBe(200);
            expect(result.body?.verification_url).toContain('hrtPair=');
        }
        const held = await startPairing();
        expect(held.response.status).toBe(200);
        expect(held.body?.verification_url).not.toContain('hrtPair=');
        const heldStatus = await service('/api/tool/v1/hrt/pair/status', {
            request_id: held.body!.request_id,
            poll_secret: held.body!.poll_secret,
        });
        expect(heldStatus.body?.status).toBe('pending');

        const status = await call('/api/hrt/status', { token });
        expect(status.body?.blockedCount).toBeGreaterThan(0);
        expect(status.body?.holdUntil).toBeGreaterThan(Math.floor(Date.now() / 1000));
        const listed = await call('/api/hrt/requests', { token });
        expect(listed.body?.requests).toHaveLength(10);

        const trusted = await call('/api/hrt/trusted-ips', {
            token,
            body: { ip: CLIENT_IP, label: 'test', password: PASSWORD },
        });
        expect(trusted.response.status).toBe(200);
        const bypass = await startPairing();
        expect(bypass.response.status).toBe(200);
        expect(bypass.body?.verification_url).toContain('hrtPair=');
        const afterTrust = await call('/api/hrt/requests', { token });
        expect(afterTrust.body?.requests).toHaveLength(11);
    });

    it('rejects the service endpoints without the service token', async () => {
        const result = await service(
            '/api/tool/v1/hrt/pair/start',
            {
                username: 'Alice',
                code_hash: CODE_HASH,
                device_certificate: DEVICE_CERT,
                device_name: 'Test device',
            },
            { token: 'wrong-service-token-0123456789' },
        );
        expect(result.response.status).toBe(401);
    });

    it('does not approve an expired request', async () => {
        const started = await startPairing();
        const requestId = started.body!.request_id as string;
        db.prepare('UPDATE hrt_pair_requests SET expires_at = ? WHERE id = ?').run(
            Math.floor(Date.now() / 1000) - 1,
            requestId,
        );
        const approved = await call(`/api/hrt/requests/${requestId}/approve`, {
            token,
            body: { code: CODE },
        });
        expect(approved.response.status).toBe(404);
        const status = await service('/api/tool/v1/hrt/pair/status', {
            request_id: requestId,
            poll_secret: started.body!.poll_secret,
        });
        expect(status.body?.status).toBe('expired');
    });
});
