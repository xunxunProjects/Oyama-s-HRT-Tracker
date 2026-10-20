/**
 * hrt/1 raw transport adapter.
 *
 * This process owns the TLS 1.3 listener, the framed protocol, and the
 * allowlisted loopback bridge to the existing web app. It deliberately does
 * not own accounts, pairing state, or health data: those stay in the web app
 * so the original authentication code is not duplicated.
 */

import { createHash, verify, X509Certificate } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';

export const HRT_MAX_FRAME_BYTES = 24 * 1024 * 1024;
const MAX_ID_BYTES = 128;
const MAX_PATH_BYTES = 2048;
const MAX_HEADER_VALUE_BYTES = 8192;
const MAX_IDS_PER_CONNECTION = 1000;
const MAX_REQUEST_BODY_BYTES = 16 * 1024 * 1024;

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const ALLOWED_REQUEST_HEADERS = new Set(['authorization', 'accept', 'content-type', 'if-match']);
const ALLOWED_RESPONSE_HEADERS = new Set([
    'content-type',
    'etag',
    'retry-after',
    'x-session-invalid',
    'location',
    'cache-control',
]);
const PAIR_PATHS = new Map([
    ['pair.start', '/api/tool/v1/hrt/pair/start'],
    ['pair.poll', '/api/tool/v1/hrt/pair/status'],
]);
const AUTHORIZE_PATH = '/api/tool/v1/hrt/device/authorize';

export class HrtFrameError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function validateEnvelope(message) {
    if (message === null || typeof message !== 'object' || Array.isArray(message)) {
        throw new HrtFrameError('BAD_FRAME', 'envelope must be a JSON object');
    }
    if (typeof message.id !== 'string' || message.id.length === 0) {
        throw new HrtFrameError('BAD_FRAME', 'envelope has no string id');
    }
    if (Buffer.byteLength(message.id, 'utf8') > MAX_ID_BYTES) {
        throw new HrtFrameError('BAD_FRAME', 'envelope id is too long');
    }
}

export function encodeFrame(message) {
    validateEnvelope(message);
    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    if (payload.length > HRT_MAX_FRAME_BYTES) {
        throw new HrtFrameError('FRAME_TOO_LARGE', 'frame exceeds 24 MiB');
    }
    const frame = Buffer.allocUnsafe(4 + payload.length);
    frame.writeUInt32BE(payload.length, 0);
    payload.copy(frame, 4);
    return frame;
}

export function decodeFrame(frame) {
    if (!Buffer.isBuffer(frame) || frame.length < 4) {
        throw new HrtFrameError('BAD_FRAME', 'frame has no length prefix');
    }
    const length = frame.readUInt32BE(0);
    if (length > HRT_MAX_FRAME_BYTES) {
        throw new HrtFrameError('FRAME_TOO_LARGE', 'frame exceeds 24 MiB');
    }
    if (frame.length - 4 !== length) {
        throw new HrtFrameError('BAD_FRAME', 'frame length does not match payload');
    }
    let message;
    try {
        message = JSON.parse(frame.subarray(4).toString('utf8'));
    } catch {
        throw new HrtFrameError('BAD_FRAME', 'payload is not valid JSON');
    }
    validateEnvelope(message);
    return message;
}

function sha256Hex(data) {
    return createHash('sha256').update(data).digest('hex');
}

function signingString(method, path, body, headers) {
    const header = name => {
        const value = headers?.[name];
        return typeof value === 'string' ? value : '';
    };
    return `hrt-request-v1\n${method}\n${path}\n${sha256Hex(body)}\n${header('authorization')}\n${header('if-match')}`;
}

/* Device proof-of-possession lives above TLS: the client signs the canonical
   request with the per-install key, and the server verifies it against the
   self-signed certificate before asking the web app about the fingerprint.
   This avoids disabling certificate-chain validation. */
function deviceFromRequest(message, method, path, body, headers) {
    if (typeof message.device_certificate !== 'string' || typeof message.device_signature !== 'string') {
        return { error: 'CERT_REQUIRED' };
    }
    if (Buffer.byteLength(message.device_certificate, 'utf8') > 32 * 1024 || message.device_signature.length > 8192) {
        return { error: 'CERT_INVALID' };
    }
    let certificate;
    try {
        certificate = new X509Certificate(message.device_certificate);
    } catch {
        return { error: 'CERT_INVALID' };
    }
    if (
        certificate.publicKey.asymmetricKeyType !== 'ec' ||
        certificate.publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
        return { error: 'CERT_INVALID' };
    }
    const canonical = signingString(method, path, body, headers);
    let valid;
    try {
        valid = verify(
            'sha256',
            Buffer.from(canonical, 'utf8'),
            certificate.publicKey,
            Buffer.from(message.device_signature, 'base64'),
        );
    } catch {
        return { error: 'CERT_INVALID' };
    }
    if (!valid) {
        return { error: 'CERT_INVALID' };
    }
    return { fingerprint: sha256Hex(certificate.raw) };
}

function sendFrame(socket, message) {
    try {
        socket.write(encodeFrame(message));
    } catch {
        socket.destroy();
    }
}

function sendError(socket, id, code, message) {
    sendFrame(socket, {
        id: typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_BYTES ? id : '?',
        error: { code, message },
    });
}

function sendResult(socket, id, result) {
    const headers = {};
    for (const [name, value] of Object.entries(result.headers ?? {})) {
        const lower = name.toLowerCase();
        if (!ALLOWED_RESPONSE_HEADERS.has(lower) || typeof value !== 'string') {
            continue;
        }
        headers[lower] = value;
    }
    sendFrame(socket, {
        id,
        status: result.status,
        headers,
        body_base64: result.body.toString('base64'),
    });
}

function decodeBody(value, maxBytes = HRT_MAX_FRAME_BYTES) {
    if (typeof value !== 'string') {
        throw new HrtFrameError('BAD_FRAME', 'body_base64 must be a string');
    }
    if (value.length === 0) {
        return Buffer.alloc(0);
    }
    if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
        throw new HrtFrameError('BAD_FRAME', 'body_base64 is not valid base64');
    }
    const body = Buffer.from(value, 'base64');
    if (body.length > maxBytes) {
        throw new HrtFrameError('FRAME_TOO_LARGE', 'body is too large');
    }
    return body;
}

function loopbackOrigin(origin) {
    const url = new URL(origin);
    if (url.username || url.password) {
        throw new Error('HRT_WEB_ORIGIN must not contain credentials');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('HRT_WEB_ORIGIN must use http:// or https://');
    }
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) {
        throw new Error('HRT_WEB_ORIGIN must point at the loopback web app');
    }
    return url.origin;
}

function forwardHttp({ origin, method, path, headers, body, timeoutMs }) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, origin);
        if (url.origin !== origin) {
            reject(new HrtFrameError('PATH_NOT_ALLOWED', 'path escaped the backend origin'));
            return;
        }
        const transport = url.protocol === 'https:' ? https : http;
        const request = transport.request(url, { method, headers, timeout: timeoutMs }, response => {
            const chunks = [];
            let size = 0;
            response.on('data', chunk => {
                size += chunk.length;
                if (size > HRT_MAX_FRAME_BYTES) {
                    response.destroy();
                    reject(new HrtFrameError('FRAME_TOO_LARGE', 'backend response is too large'));
                    return;
                }
                chunks.push(chunk);
            });
            response.on('end', () => {
                resolve({
                    status: response.statusCode ?? 502,
                    headers: response.headers,
                    body: Buffer.concat(chunks),
                });
            });
        });
        request.on('timeout', () => request.destroy(new Error('backend timeout')));
        request.on('error', reject);
        if (body && body.length > 0) {
            request.write(body);
        }
        request.end();
    });
}

function filteredRequestHeaders(raw) {
    const headers = {};
    if (raw === undefined) {
        return headers;
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new HrtFrameError('BAD_FRAME', 'headers must be an object');
    }
    for (const [name, value] of Object.entries(raw)) {
        const lower = name.toLowerCase();
        if (!ALLOWED_REQUEST_HEADERS.has(lower)) {
            continue;
        }
        if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_HEADER_VALUE_BYTES) {
            throw new HrtFrameError('BAD_FRAME', 'header value is invalid or too long');
        }
        if (/[\r\n]/.test(value)) {
            throw new HrtFrameError('BAD_FRAME', 'header value contains a newline');
        }
        headers[lower] = value;
    }
    return headers;
}

function normalizeClientIp(address) {
    if (typeof address !== 'string') {
        return '';
    }
    return address.startsWith('::ffff:') ? address.slice(7) : address;
}

function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code < 0x20 || code === 0x7f) {
            return true;
        }
    }
    return false;
}

class FrameReader {
    constructor(onMessage, onError) {
        this.chunks = [];
        this.total = 0;
        this.expected = null;
        this.onMessage = onMessage;
        this.onError = onError;
    }

    push(chunk) {
        this.chunks.push(chunk);
        this.total += chunk.length;
        while (this.expected === null || this.total >= this.expected) {
            if (this.expected === null) {
                if (this.total < 4) {
                    return;
                }
                const header = this.take(4);
                this.expected = header.readUInt32BE(0);
                if (this.expected === 0 || this.expected > HRT_MAX_FRAME_BYTES) {
                    this.onError(new HrtFrameError('FRAME_TOO_LARGE', 'frame length is out of range'));
                    return;
                }
            }
            if (this.total < this.expected) {
                return;
            }
            const payload = this.take(this.expected);
            this.expected = null;
            let message;
            try {
                message = JSON.parse(payload.toString('utf8'));
                validateEnvelope(message);
            } catch (error) {
                this.onError(
                    error instanceof HrtFrameError
                        ? error
                        : new HrtFrameError('BAD_FRAME', 'payload is not valid JSON'),
                );
                return;
            }
            this.onMessage(message);
        }
    }

    take(size) {
        const output = Buffer.allocUnsafe(size);
        let offset = 0;
        while (offset < size) {
            const chunk = this.chunks[0];
            const need = size - offset;
            if (chunk.length <= need) {
                chunk.copy(output, offset);
                offset += chunk.length;
                this.chunks.shift();
            } else {
                chunk.copy(output, offset, 0, need);
                this.chunks[0] = chunk.subarray(need);
                offset += need;
            }
        }
        this.total -= size;
        return output;
    }
}

export function createHrtServer({
    key,
    cert,
    webOrigin,
    serviceToken,
    maxConnections = 8,
    authorizeCacheMs = 10_000,
    requestTimeoutMs = 30_000,
    idleTimeoutMs = 30_000,
    handshakeTimeoutMs = 15_000,
}) {
    if (!key || !cert) {
        throw new Error('the raw server needs a TLS key and certificate');
    }
    if (typeof serviceToken !== 'string' || serviceToken.length < 16) {
        throw new Error('the raw server needs a service token');
    }
    if (!Number.isInteger(maxConnections) || maxConnections < 1) {
        throw new Error('maxConnections must be a positive integer');
    }
    const origin = loopbackOrigin(webOrigin);
    const serviceHeaders = {
        'x-hrt-service': serviceToken,
    };
    const authorizationCache = new Map();
    let activeConnections = 0;

    const server = tls.createServer(
        {
            key,
            cert,
            minVersion: 'TLSv1.3',
            ALPNProtocols: ['hrt/1'],
            handshakeTimeout: handshakeTimeoutMs,
        },
        socket => {
            if (activeConnections >= maxConnections) {
                socket.destroy();
                return;
            }
            if (socket.alpnProtocol !== 'hrt/1') {
                socket.destroy();
                return;
            }
            activeConnections += 1;
            let closed = false;
            const close = () => {
                if (!closed) {
                    closed = true;
                    activeConnections -= 1;
                }
            };
            socket.on('close', close);
            socket.setTimeout(idleTimeoutMs, () => socket.destroy());
            socket.on('error', () => socket.destroy());

            const clientIp = normalizeClientIp(socket.remoteAddress);
            const seenIds = new Set();
            let queue = Promise.resolve();
            let invalidSignatures = 0;

            const authorize = async fingerprint => {
                if (typeof fingerprint !== 'string') {
                    return false;
                }
                const cached = authorizationCache.get(fingerprint);
                if (cached !== undefined && cached > Date.now()) {
                    return true;
                }
                const response = await forwardHttp({
                    origin,
                    method: 'POST',
                    path: AUTHORIZE_PATH,
                    headers: {
                        ...serviceHeaders,
                        'content-type': 'application/json',
                    },
                    body: Buffer.from(JSON.stringify({ fingerprint }), 'utf8'),
                    timeoutMs: requestTimeoutMs,
                });
                if (response.status !== 200) {
                    authorizationCache.delete(fingerprint);
                    return false;
                }
                let parsed;
                try {
                    parsed = JSON.parse(response.body.toString('utf8'));
                } catch {
                    return false;
                }
                if (parsed?.ok !== true) {
                    return false;
                }
                authorizationCache.set(fingerprint, Date.now() + authorizeCacheMs);
                return true;
            };

            const handle = async message => {
                const id = message.id;
                if (seenIds.has(id)) {
                    sendError(socket, id, 'BAD_FRAME', 'duplicate frame id');
                    socket.destroy();
                    return;
                }
                if (seenIds.size >= MAX_IDS_PER_CONNECTION) {
                    sendError(socket, id, 'BAD_FRAME', 'too many frames on one connection');
                    socket.destroy();
                    return;
                }
                seenIds.add(id);

                if (message.op === 'ping') {
                    sendResult(socket, id, {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                        body: Buffer.from(
                            JSON.stringify({
                                protocol: 'hrt/1',
                                serverTime: new Date().toISOString(),
                            }),
                            'utf8',
                        ),
                    });
                    return;
                }

                if (message.op === 'pair.start' || message.op === 'pair.poll') {
                    const body = message.body_base64 === undefined ? Buffer.alloc(0) : decodeBody(message.body_base64);
                    const response = await forwardHttp({
                        origin,
                        method: 'POST',
                        path: PAIR_PATHS.get(message.op),
                        headers: {
                            ...serviceHeaders,
                            'content-type': 'application/json',
                            'x-hrt-client-ip': clientIp,
                        },
                        body,
                        timeoutMs: requestTimeoutMs,
                    });
                    sendResult(socket, id, response);
                    return;
                }

                if (message.op !== 'request') {
                    sendError(socket, id, 'UNKNOWN_OP', 'unknown operation');
                    return;
                }

                if (
                    typeof message.method !== 'string' ||
                    !ALLOWED_METHODS.has(message.method) ||
                    typeof message.path !== 'string' ||
                    message.path.length > MAX_PATH_BYTES ||
                    !message.path.startsWith('/api/tool/v1/') ||
                    message.path.includes('\\') ||
                    /(^|\/)\.\.(\/|$)/.test(message.path) ||
                    hasControlCharacter(message.path)
                ) {
                    sendError(socket, id, 'PATH_NOT_ALLOWED', 'request is outside the tool API');
                    return;
                }
                let parsedPath;
                try {
                    parsedPath = new URL(message.path, origin);
                } catch {
                    sendError(socket, id, 'PATH_NOT_ALLOWED', 'invalid request path');
                    return;
                }
                if (parsedPath.origin !== origin || !parsedPath.pathname.startsWith('/api/tool/v1/')) {
                    sendError(socket, id, 'PATH_NOT_ALLOWED', 'request is outside the tool API');
                    return;
                }
                const headers = filteredRequestHeaders(message.headers);
                let body;
                try {
                    body = decodeBody(message.body_base64 ?? '', MAX_REQUEST_BODY_BYTES);
                } catch (error) {
                    sendError(
                        socket,
                        id,
                        error instanceof HrtFrameError ? error.code : 'BAD_FRAME',
                        error instanceof HrtFrameError ? error.message : 'invalid request body',
                    );
                    return;
                }
                const device = deviceFromRequest(message, message.method, message.path, body, headers);
                if (device.error) {
                    invalidSignatures += 1;
                    sendError(
                        socket,
                        id,
                        device.error,
                        device.error === 'CERT_REQUIRED'
                            ? 'a signed device request is required'
                            : 'the device signature is invalid',
                    );
                    if (invalidSignatures >= 3) {
                        socket.destroy();
                    }
                    return;
                }
                if (!(await authorize(device.fingerprint))) {
                    sendError(socket, id, 'NOT_AUTHORIZED', 'the device is not authorized');
                    return;
                }
                headers['x-hrt-device-fingerprint'] = device.fingerprint;
                const response = await forwardHttp({
                    origin,
                    method: message.method,
                    path: `${parsedPath.pathname}${parsedPath.search}`,
                    headers: {
                        ...headers,
                        ...serviceHeaders,
                    },
                    body,
                    timeoutMs: requestTimeoutMs,
                });
                sendResult(socket, id, response);
            };

            const reader = new FrameReader(
                message => {
                    queue = queue
                        .then(() => handle(message))
                        .catch(error => {
                            sendError(
                                socket,
                                message.id,
                                error?.code === 'FRAME_TOO_LARGE' ? 'FRAME_TOO_LARGE' : 'SERVICE_UNAVAILABLE',
                                error instanceof HrtFrameError ? error.message : 'backend request failed',
                            );
                        });
                },
                error => {
                    sendError(socket, '?', error.code, error.message);
                    socket.destroy();
                },
            );
            socket.on('data', chunk => reader.push(chunk));
        },
    );

    server.maxConnections = maxConnections;
    server.on('tlsClientError', () => {
        /* Handshake failures are deliberately quiet; do not log key material. */
    });
    return server;
}

function readServiceToken(path) {
    const info = statSync(path);
    if ((info.mode & 0o077) !== 0) {
        throw new Error('the service token file must be mode 0600');
    }
    const token = readFileSync(path, 'utf8').trim();
    if (token.length < 16) {
        throw new Error('the service token is too short');
    }
    return token;
}

export async function startFromEnv(env = process.env) {
    if (env.HRT_RAW_ENABLED !== '1') {
        return null;
    }
    const port = Number(env.HRT_RAW_PORT ?? '9443');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('HRT_RAW_PORT is invalid');
    }
    if (!env.HRT_RAW_CERT || !env.HRT_RAW_KEY || !env.HRT_SERVICE_TOKEN_FILE) {
        throw new Error('HRT_RAW_CERT, HRT_RAW_KEY, and HRT_SERVICE_TOKEN_FILE are required');
    }
    const serviceToken = readServiceToken(env.HRT_SERVICE_TOKEN_FILE);
    if ((statSync(env.HRT_RAW_KEY).mode & 0o077) !== 0) {
        throw new Error('the TLS private key must be mode 0600');
    }
    const server = createHrtServer({
        key: readFileSync(env.HRT_RAW_KEY),
        cert: readFileSync(env.HRT_RAW_CERT),
        webOrigin: env.HRT_WEB_ORIGIN ?? 'http://127.0.0.1:8787',
        serviceToken,
        maxConnections: Number(env.HRT_RAW_MAX_CONNECTIONS ?? '8'),
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '0.0.0.0', () => {
            server.off('error', reject);
            resolve();
        });
    });
    return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startFromEnv()
        .then(server => {
            if (server === null) {
                process.stderr.write('hrt-raw-server: disabled (HRT_RAW_ENABLED != 1)\n');
                return;
            }
            process.stderr.write('hrt-raw-server: listening\n');
            const stop = () => server.close(() => process.exit(0));
            process.on('SIGTERM', stop);
            process.on('SIGINT', stop);
        })
        .catch(error => {
            process.stderr.write(`hrt-raw-server: ${error.message}\n`);
            process.exit(1);
        });
}
