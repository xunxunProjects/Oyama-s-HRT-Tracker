import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import worker, { type Env } from '../worker';
import { createHrtServer, decodeFrame, encodeFrame } from '../hrt-server/server.mjs';

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

const hasOpenSSL = (() => {
    try {
        execFileSync('openssl', ['version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const PASSWORD = 'violet harbor tiny lantern';
const SERVICE_TOKEN = 'test-service-token-0123456789';
const CODE = 'c'.repeat(128);
const CODE_HASH = createHash('sha256').update(CODE).digest('hex');

function d1(db: SqliteDatabase) {
    return {
        async batch(statements: Array<{ run(): Promise<unknown> }>) {
            const results = [];
            for (const statement of statements) results.push(await statement.run());
            return results;
        },
        prepare(sql: string) {
            const order: number[] = [];
            const rewritten = sql.replace(/\?(\d+)/g, (_match, index: string) => {
                order.push(Number(index));
                return '?';
            });
            let args: unknown[] = [];
            const statement = {
                bind(...values: unknown[]) {
                    args = order.length > 0 ? order.map(index => values[index - 1]) : values;
                    return statement;
                },
                async first() {
                    return db.prepare(rewritten).get(...args) ?? null;
                },
                async run() {
                    const result = db.prepare(rewritten).run(...args);
                    return { success: true, meta: { changes: Number(result.changes) } };
                },
                async all() {
                    return { success: true, results: db.prepare(rewritten).all(...args) };
                },
            };
            return statement;
        },
    };
}

function makeCert(keyPath: string, certPath: string, subject: string, san?: string) {
    const args = [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '2',
        '-subj',
        subject,
    ];
    if (san !== undefined) args.push('-addext', san);
    execFileSync('openssl', args, { stdio: 'ignore' });
}

class TestFrameClient {
    private buffer = Buffer.alloc(0);
    private messages: Record<string, unknown>[] = [];
    private waiters: Array<(message: Record<string, unknown>) => void> = [];

    constructor(readonly socket: tls.TLSSocket) {
        socket.on('data', (chunk: Buffer) => {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            while (this.buffer.length >= 4) {
                const length = this.buffer.readUInt32BE(0);
                if (this.buffer.length < 4 + length) break;
                const message = decodeFrame(this.buffer.subarray(0, 4 + length));
                this.buffer = this.buffer.subarray(4 + length);
                const waiter = this.waiters.shift();
                if (waiter) waiter(message);
                else this.messages.push(message);
            }
        });
    }

    send(message: Record<string, unknown>): Promise<Record<string, unknown>> {
        const response =
            this.messages.length > 0
                ? Promise.resolve(this.messages.shift()!)
                : new Promise<Record<string, unknown>>((resolve, reject) => {
                      const timer = setTimeout(() => reject(new Error('frame timeout')), 5000);
                      this.waiters.push(messageValue => {
                          clearTimeout(timer);
                          resolve(messageValue);
                      });
                  });
        this.socket.write(encodeFrame(message));
        return response;
    }

    close() {
        this.socket.destroy();
    }
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as Parameters<typeof worker.fetch>[2];

describe.skipIf(!hasOpenSSL)('hrt end to end', () => {
    let certDir = '';
    let db: SqliteDatabase;
    let env: Env;
    let backend: http.Server;
    let backendOrigin = '';
    let rawServer: tls.Server;
    let rawPort = 0;
    let serverCert: Buffer;
    let deviceCert: Buffer;
    let deviceKey: Buffer;

    beforeAll(async () => {
        certDir = mkdtempSync(join(tmpdir(), 'hrt-e2e-'));
        const serverKeyPath = join(certDir, 'server-key.pem');
        const serverCertPath = join(certDir, 'server-cert.pem');
        const deviceKeyPath = join(certDir, 'device-key.pem');
        const deviceCertPath = join(certDir, 'device-cert.pem');
        makeCert(serverKeyPath, serverCertPath, '/CN=localhost', 'subjectAltName=DNS:localhost,IP:127.0.0.1');
        makeCert(deviceKeyPath, deviceCertPath, '/CN=hrt-e2e-device');
        serverCert = readFileSync(serverCertPath);
        deviceCert = readFileSync(deviceCertPath);
        deviceKey = readFileSync(deviceKeyPath);
        const serverKey = readFileSync(serverKeyPath);

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
        env = {
            DB: d1(db),
            JWT_SECRET,
            HRT_RAW_ENABLED: '1',
            HRT_SERVICE_TOKEN: SERVICE_TOKEN,
            HRT_IP_KEY: Buffer.alloc(32, 7).toString('base64'),
            PUBLIC_APP_ORIGIN: 'https://example.com',
        } as unknown as Env;

        backend = http.createServer((request, response) => {
            const chunks: Buffer[] = [];
            request.on('data', chunk => chunks.push(chunk));
            request.on('end', async () => {
                const headers = new Headers();
                for (const [name, value] of Object.entries(request.headers)) {
                    if (Array.isArray(value)) headers.set(name, value.join(','));
                    else if (typeof value === 'string') headers.set(name, value);
                }
                const fetchRequest = new Request(
                    `http://127.0.0.1:${(backend.address() as AddressInfo).port}${request.url}`,
                    {
                        method: request.method,
                        headers,
                        ...(request.method === 'GET' || request.method === 'HEAD'
                            ? {}
                            : { body: Buffer.concat(chunks) }),
                    },
                );
                const fetchResponse = await worker.fetch(fetchRequest, env, ctx);
                response.statusCode = fetchResponse.status;
                fetchResponse.headers.forEach((value, name) => response.setHeader(name, value));
                response.end(Buffer.from(await fetchResponse.arrayBuffer()));
            });
        });
        await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
        backendOrigin = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;

        rawServer = createHrtServer({
            key: serverKey,
            cert: serverCert,
            webOrigin: backendOrigin,
            serviceToken: SERVICE_TOKEN,
            maxConnections: 4,
            authorizeCacheMs: 0,
        });
        await new Promise<void>(resolve => rawServer.listen(0, '127.0.0.1', resolve));
        rawPort = (rawServer.address() as AddressInfo).port;
    });

    afterAll(async () => {
        if (rawServer) await new Promise<void>(resolve => rawServer.close(() => resolve()));
        if (backend) await new Promise<void>(resolve => backend.close(() => resolve()));
        if (certDir) rmSync(certDir, { recursive: true, force: true });
    });

    it('pairs, approves, and calls the tool API through the raw transport', async () => {
        const socket = tls.connect({
            host: '127.0.0.1',
            port: rawPort,
            servername: 'localhost',
            ca: serverCert,
            cert: deviceCert,
            key: deviceKey,
            ALPNProtocols: ['hrt/1'],
            rejectUnauthorized: true,
        });
        await new Promise<void>((resolve, reject) => {
            socket.once('secureConnect', resolve);
            socket.once('error', reject);
        });
        const client = new TestFrameClient(socket);
        try {
            const started = await client.send({
                id: 'pair-1',
                op: 'pair.start',
                body_base64: Buffer.from(
                    JSON.stringify({
                        username: 'Alice',
                        code_hash: CODE_HASH,
                        device_certificate: deviceCert.toString('utf8'),
                        device_name: 'e2e device',
                        client_version: 'hrt-tool/0.1.0',
                    }),
                ).toString('base64'),
            });
            expect(started.status).toBe(200);
            const startBody = JSON.parse(Buffer.from(started.body_base64 as string, 'base64').toString('utf8')) as {
                request_id: string;
                poll_secret: string;
            };

            const loginResponse = await worker.fetch(
                new Request('https://example.com/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
                    body: JSON.stringify({ username: 'Alice', password: PASSWORD }),
                }),
                env,
                ctx,
            );
            expect(loginResponse.status).toBe(200);
            const webToken = ((await loginResponse.json()) as { token: string }).token;
            const approveResponse = await worker.fetch(
                new Request(`https://example.com/api/hrt/requests/${startBody.request_id}/approve`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${webToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ code: CODE }),
                }),
                env,
                ctx,
            );
            expect(approveResponse.status).toBe(200);

            const polled = await client.send({
                id: 'pair-2',
                op: 'pair.poll',
                body_base64: Buffer.from(
                    JSON.stringify({
                        request_id: startBody.request_id,
                        poll_secret: startBody.poll_secret,
                    }),
                ).toString('base64'),
            });
            expect(polled.status).toBe(200);
            const pollBody = JSON.parse(Buffer.from(polled.body_base64 as string, 'base64').toString('utf8')) as {
                status: string;
                token: string;
            };
            expect(pollBody.status).toBe('approved');
            expect(pollBody.token).not.toBe('');

            const me = await client.send({
                id: 'request-1',
                op: 'request',
                method: 'GET',
                path: '/api/tool/v1/me',
                headers: { authorization: `Bearer ${pollBody.token}` },
            });
            expect(me.status).toBe(200);
            const meBody = JSON.parse(Buffer.from(me.body_base64 as string, 'base64').toString('utf8')) as {
                user: { id: string; username: string };
            };
            expect(meBody.user).toMatchObject({ id: 'user-1', username: 'Alice' });
        } finally {
            client.close();
        }
    });
});
