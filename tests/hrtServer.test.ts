import { execFileSync } from 'node:child_process';
import { createHash, createSign, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHrtServer, decodeFrame, encodeFrame, HRT_MAX_FRAME_BYTES } from '../hrt-server/server.mjs';

const SERVICE_TOKEN = 'test-service-token-0123456789';

const hasOpenSSL = (() => {
    try {
        execFileSync('openssl', ['version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();

let certDir = '';
let serverCert = Buffer.alloc(0);
let serverKey = Buffer.alloc(0);
let clientCert = Buffer.alloc(0);
let clientKey = Buffer.alloc(0);
let clientFingerprint = '';

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
    if (san !== undefined) {
        args.push('-addext', san);
    }
    execFileSync('openssl', args, { stdio: 'ignore' });
}

interface Recorded {
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: string;
}

let backend: http.Server;
let backendOrigin = '';
let rawServer: tls.Server;
let rawPort = 0;
let pairStarts: Recorded[] = [];
let meCalls: Recorded[] = [];
let authorizeCalls: Recorded[] = [];
let authorizeAllowed = true;

class FrameClient {
    private buffer = Buffer.alloc(0);
    private messages: Record<string, unknown>[] = [];
    private waiters: Array<(message: Record<string, unknown>) => void> = [];
    private closed = false;

    constructor(readonly socket: tls.TLSSocket) {
        socket.on('data', (chunk: Buffer) => {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            while (this.buffer.length >= 4) {
                const length = this.buffer.readUInt32BE(0);
                if (this.buffer.length < 4 + length) {
                    break;
                }
                const frame = this.buffer.subarray(0, 4 + length);
                this.buffer = this.buffer.subarray(4 + length);
                const message = decodeFrame(frame);
                const waiter = this.waiters.shift();
                if (waiter) {
                    waiter(message);
                } else {
                    this.messages.push(message);
                }
            }
        });
        socket.on('close', () => {
            this.closed = true;
            this.waiters.splice(0).forEach(waiter => waiter({ error: { code: 'CLOSED', message: 'socket closed' } }));
        });
        socket.on('error', () => {
            this.closed = true;
        });
    }

    send(message: Record<string, unknown>): Promise<Record<string, unknown>> {
        const response = this.next();
        this.socket.write(encodeFrame(message));
        return response;
    }

    private next(): Promise<Record<string, unknown>> {
        if (this.messages.length > 0) {
            return Promise.resolve(this.messages.shift()!);
        }
        if (this.closed) {
            return Promise.resolve({ error: { code: 'CLOSED', message: 'socket closed' } });
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('timed out waiting for an hrt frame')), 3000);
            this.waiters.push(message => {
                clearTimeout(timer);
                resolve(message);
            });
        });
    }

    close() {
        this.socket.destroy();
    }
}

async function connect(): Promise<FrameClient> {
    const socket = tls.connect({
        host: '127.0.0.1',
        port: rawPort,
        servername: 'localhost',
        ca: serverCert,
        ALPNProtocols: ['hrt/1'],
        rejectUnauthorized: true,
    });
    await new Promise<void>((resolve, reject) => {
        socket.once('secureConnect', resolve);
        socket.once('error', reject);
    });
    expect(socket.alpnProtocol).toBe('hrt/1');
    return new FrameClient(socket);
}

function signedRequest({
    id,
    method = 'GET',
    path,
    headers = {},
    body = '',
}: {
    id: string;
    method?: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
}): Record<string, unknown> {
    const canonical =
        `hrt-request-v1\n${method}\n${path}\n` +
        `${createHash('sha256').update(body).digest('hex')}\n` +
        `${headers.authorization ?? ''}\n${headers['if-match'] ?? ''}`;
    const signer = createSign('SHA256');
    signer.update(canonical);
    signer.end();
    return {
        id,
        op: 'request',
        method,
        path,
        headers,
        body_base64: Buffer.from(body).toString('base64'),
        device_certificate: clientCert.toString('utf8'),
        device_signature: signer.sign(clientKey).toString('base64'),
    };
}

function body(message: Record<string, unknown>): Record<string, unknown> {
    const encoded = message.body_base64;
    expect(typeof encoded).toBe('string');
    return JSON.parse(Buffer.from(encoded as string, 'base64').toString('utf8'));
}

beforeAll(async () => {
    if (!hasOpenSSL) {
        return;
    }
    certDir = mkdtempSync(join(tmpdir(), 'hrt-server-test-'));
    const serverKeyPath = join(certDir, 'server-key.pem');
    const serverCertPath = join(certDir, 'server-cert.pem');
    const clientKeyPath = join(certDir, 'client-key.pem');
    const clientCertPath = join(certDir, 'client-cert.pem');
    makeCert(serverKeyPath, serverCertPath, '/CN=localhost', 'subjectAltName=DNS:localhost,IP:127.0.0.1');
    makeCert(clientKeyPath, clientCertPath, '/CN=hrt-test-device');
    serverCert = readFileSync(serverCertPath);
    serverKey = readFileSync(serverKeyPath);
    clientCert = readFileSync(clientCertPath);
    clientKey = readFileSync(clientKeyPath);
    clientFingerprint = createHash('sha256').update(new X509Certificate(clientCert).raw).digest('hex');

    backend = http.createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            const recorded: Recorded = {
                method: request.method ?? '',
                url: request.url ?? '',
                headers: request.headers,
                body: Buffer.concat(chunks).toString('utf8'),
            };
            const json = (status: number, value: unknown) => {
                response.writeHead(status, { 'content-type': 'application/json' });
                response.end(JSON.stringify(value));
            };
            if (request.url === '/api/tool/v1/hrt/pair/start') {
                pairStarts.push(recorded);
                json(200, {
                    request_id: 'request-1',
                    poll_secret: 'poll-secret-1',
                    expires_at: 1760000000,
                    verification_url: 'https://example.test/account/security/pair/request-1',
                });
                return;
            }
            if (request.url === '/api/tool/v1/hrt/pair/status') {
                json(200, { status: 'pending' });
                return;
            }
            if (request.url === '/api/tool/v1/hrt/device/authorize') {
                authorizeCalls.push(recorded);
                if (authorizeAllowed) {
                    json(200, { ok: true });
                } else {
                    json(401, { code: 'DEVICE_REVOKED', message: 'revoked' });
                }
                return;
            }
            if (request.url === '/api/tool/v1/me') {
                meCalls.push(recorded);
                if (request.headers.authorization !== 'Bearer test-token') {
                    json(401, { code: 'SESSION_INVALID', message: 'no' });
                    return;
                }
                json(200, { user: { id: 'user-1', username: 'Alice' } });
                return;
            }
            json(404, { code: 'NOT_FOUND', message: 'no' });
        });
    });
    await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
    backendOrigin = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;

    rawServer = createHrtServer({
        key: serverKey,
        cert: serverCert,
        webOrigin: backendOrigin,
        serviceToken: SERVICE_TOKEN,
        maxConnections: 8,
        authorizeCacheMs: 0,
    });
    await new Promise<void>(resolve => rawServer.listen(0, '127.0.0.1', resolve));
    rawPort = (rawServer.address() as AddressInfo).port;
});

afterAll(async () => {
    if (rawServer) {
        await new Promise<void>(resolve => rawServer.close(() => resolve()));
    }
    if (backend) {
        await new Promise<void>(resolve => backend.close(() => resolve()));
    }
    if (certDir) {
        rmSync(certDir, { recursive: true, force: true });
    }
});

beforeEach(() => {
    pairStarts = [];
    meCalls = [];
    authorizeCalls = [];
    authorizeAllowed = true;
});

describe.skipIf(!hasOpenSSL)('hrt raw server', () => {
    it('serves ping without device credentials', async () => {
        const client = await connect();
        try {
            const response = await client.send({ id: 'ping-1', op: 'ping' });
            expect(response.status).toBe(200);
            expect(body(response).protocol).toBe('hrt/1');
        } finally {
            client.close();
        }
    });

    it('forwards pair.start with the service token and observed IP', async () => {
        const client = await connect();
        try {
            const response = await client.send({
                id: 'pair-1',
                op: 'pair.start',
                body_base64: Buffer.from(
                    JSON.stringify({
                        code_hash: 'aa'.repeat(32),
                        device_certificate: clientCert.toString('utf8'),
                        device_name: 'test device',
                    }),
                ).toString('base64'),
            });
            expect(response.status).toBe(200);
            expect(body(response).request_id).toBe('request-1');
            expect(pairStarts).toHaveLength(1);
            expect(pairStarts[0].headers['x-hrt-service']).toBe(SERVICE_TOKEN);
            expect(pairStarts[0].headers['x-hrt-client-ip']).toBe('127.0.0.1');
            expect(JSON.parse(pairStarts[0].body).code_hash).toBe('aa'.repeat(32));
        } finally {
            client.close();
        }
    });

    it('requires a device signature for request frames', async () => {
        const client = await connect();
        try {
            const response = await client.send({
                id: 'req-1',
                op: 'request',
                method: 'GET',
                path: '/api/tool/v1/me',
            });
            expect((response.error as { code: string }).code).toBe('CERT_REQUIRED');
            expect(meCalls).toHaveLength(0);
        } finally {
            client.close();
        }
    });

    it('forwards an authorized request with the verified device fingerprint', async () => {
        const client = await connect();
        try {
            const response = await client.send(
                signedRequest({
                    id: 'req-2',
                    path: '/api/tool/v1/me',
                    headers: { authorization: 'Bearer test-token' },
                }),
            );
            expect(response.status).toBe(200);
            expect(body(response).user).toEqual({ id: 'user-1', username: 'Alice' });
            expect(meCalls).toHaveLength(1);
            expect(meCalls[0].headers.authorization).toBe('Bearer test-token');
            expect(meCalls[0].headers['x-hrt-device-fingerprint']).toBe(clientFingerprint);
            /* A paired user must not inherit the raw server's service token. */
            expect(meCalls[0].headers['x-hrt-service']).toBeUndefined();
            expect(authorizeCalls[0].headers['x-hrt-service']).toBe(SERVICE_TOKEN);
        } finally {
            client.close();
        }
    });

    it('rejects paths outside the tool API and traversal attempts', async () => {
        const client = await connect();
        try {
            const outside = await client.send(signedRequest({ id: 'req-3', path: '/api/other' }));
            expect((outside.error as { code: string }).code).toBe('PATH_NOT_ALLOWED');
            const traversal = await client.send(signedRequest({ id: 'req-4', path: '/api/tool/v1/../../admin' }));
            expect((traversal.error as { code: string }).code).toBe('PATH_NOT_ALLOWED');
            expect(meCalls).toHaveLength(0);
        } finally {
            client.close();
        }
    });

    it('rejects a device the web app has revoked', async () => {
        authorizeAllowed = false;
        const client = await connect();
        try {
            const response = await client.send(
                signedRequest({
                    id: 'req-5',
                    path: '/api/tool/v1/me',
                    headers: { authorization: 'Bearer test-token' },
                }),
            );
            expect((response.error as { code: string }).code).toBe('NOT_AUTHORIZED');
            expect(meCalls).toHaveLength(0);
        } finally {
            client.close();
        }
    });

    it('rejects a tampered device signature', async () => {
        const client = await connect();
        try {
            const frame = signedRequest({
                id: 'req-6',
                path: '/api/tool/v1/me',
                headers: { authorization: 'Bearer test-token' },
            });
            frame.path = '/api/tool/v1/snapshot';
            const response = await client.send(frame);
            expect((response.error as { code: string }).code).toBe('CERT_INVALID');
            expect(meCalls).toHaveLength(0);
        } finally {
            client.close();
        }
    });

    it('rejects an oversized frame and keeps the cap enforced', async () => {
        const client = await connect();
        try {
            const header = Buffer.alloc(4);
            header.writeUInt32BE(HRT_MAX_FRAME_BYTES + 1, 0);
            client.socket.write(header);
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('no oversized-frame close')), 3000);
                client.socket.once('close', () => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        } finally {
            client.close();
        }
    });
});
