/**
 * hrt:// pairing and device registry.
 *
 * The raw TLS adapter calls the service-token endpoints in this module over
 * loopback. The account owner uses the session endpoints through the existing
 * web auth. Accounts, sessions, and passwords stay in the existing tables; the
 * only new state is pairing requests, device fingerprints, holds, and trusted
 * IPs.
 */

import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { readSmallJsonBody } from './requestInput';
import type { Env } from './worker';

const PAIR_TTL_SECONDS = 300;
const PAIR_WINDOW_SECONDS = 10 * 60;
const PAIR_LIMIT = 10;
const HOLD_SECONDS = 60 * 60;
const REQUEST_RETENTION_SECONDS = 12 * 60 * 60;
const DEVICE_TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_DEVICES_PER_USER = 100;
const MAX_TRUSTED_IPS = 20;

const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;
const COUNTRY = /^[A-Za-z]{2}$/;

const encoder = new TextEncoder();

interface PairUser {
    userId: string;
    username: string;
}

interface PairRequestRow {
    id: string;
    username_key: string;
    user_id: string | null;
    device_fingerprint: string;
    device_name: string;
    code_hash: string;
    poll_secret_hash: string;
    ip_encrypted: string | null;
    country: string | null;
    status: string;
    created_at: number;
    expires_at: number;
    approved_at: number | null;
    denied_at: number | null;
    session_id: string | null;
    token_issued_at: number | null;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });

const error = (code: string, message: string, status = 400) => json({ code, message }, status);

function hex(bytes: Uint8Array): string {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes: number): string {
    return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Hex(value: Uint8Array | string): Promise<string> {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let index = 0; index < a.length; index += 1) {
        difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
    }
    return difference === 0;
}

function b64encode(bytes: Uint8Array): string {
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
}

function b64decode(value: string): Uint8Array | null {
    try {
        const text = atob(value);
        const bytes = new Uint8Array(text.length);
        for (let index = 0; index < text.length; index += 1) {
            bytes[index] = text.charCodeAt(index);
        }
        return bytes;
    } catch {
        return null;
    }
}

export function hrtCapability(env: Env): { supported: boolean; version: number } {
    const supported =
        env.HRT_RAW_ENABLED === '1' && typeof env.HRT_SERVICE_TOKEN === 'string' && env.HRT_SERVICE_TOKEN.length >= 16;
    return { supported, version: 1 };
}

async function serviceAuthorized(request: Request, env: Env): Promise<boolean> {
    const expected = env.HRT_SERVICE_TOKEN;
    const provided = request.headers.get('x-hrt-service');
    if (!hrtCapability(env).supported || !expected || !provided) {
        return false;
    }
    return constantTimeEqual(await sha256Hex(expected), await sha256Hex(provided));
}

function hasControlCharacter(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code < 0x20 || code === 0x7f) return true;
    }
    return false;
}

function usernameKey(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase();
    if (key.length === 0 || key.length > 64 || hasControlCharacter(key)) {
        return null;
    }
    return key;
}

function deviceName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    if (name.length === 0 || name.length > 64 || hasControlCharacter(name)) {
        return null;
    }
    return name;
}

async function certificateFingerprint(pem: unknown): Promise<string | null> {
    if (typeof pem !== 'string' || pem.length > 32 * 1024) return null;
    const match = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/.exec(pem);
    if (!match) return null;
    const base64 = match[1].replace(/\s+/g, '');
    if (base64.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
    const der = b64decode(base64);
    if (!der || der.length < 100 || der.length > 16 * 1024) return null;
    return sha256Hex(der);
}

function clientIp(request: Request): string | null {
    const value = request.headers.get('x-hrt-client-ip')?.trim();
    if (!value || value.length > 45) return null;
    if (!/^[0-9A-Fa-f:.]+$/.test(value)) return null;
    return value;
}

function clientCountry(request: Request): string | null {
    const value = request.headers.get('x-hrt-client-country')?.trim();
    return value && COUNTRY.test(value) ? value.toUpperCase() : null;
}

async function ipKey(env: Env): Promise<CryptoKey | null> {
    if (!env.HRT_IP_KEY) return null;
    const bytes = b64decode(env.HRT_IP_KEY);
    if (!bytes || bytes.length !== 32) return null;
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptIp(env: Env, ip: string | null): Promise<string | null> {
    if (!ip) return null;
    const key = await ipKey(env);
    if (!key) return null;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(ip));
    return `${b64encode(iv)}.${b64encode(new Uint8Array(ciphertext))}`;
}

async function decryptIp(env: Env, value: string | null): Promise<string | null> {
    if (!value) return null;
    const [ivPart, cipherPart] = value.split('.');
    if (!ivPart || !cipherPart) return null;
    const key = await ipKey(env);
    const iv = b64decode(ivPart);
    const ciphertext = b64decode(cipherPart);
    if (!key || !iv || !ciphertext) return null;
    try {
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        return new TextDecoder().decode(plaintext);
    } catch {
        return null;
    }
}

function normalizeIpv4(value: string): string | null {
    const parts = value.split('.');
    if (parts.length !== 4) return null;
    const numbers = parts.map(part => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
    if (numbers.some(number => !Number.isInteger(number) || number < 0 || number > 255)) {
        return null;
    }
    return numbers.join('.');
}

function normalizeIpv6(value: string): string | null {
    if (value.includes('%')) return null;
    const halves = value.split('::');
    if (halves.length > 2) return null;
    const parse = (part: string): string[] | null => {
        if (part.length === 0) return [];
        const groups = part.split(':');
        if (groups.some(group => !/^[0-9A-Fa-f]{1,4}$/.test(group))) return null;
        return groups.map(group => group.toLowerCase().replace(/^0+/, '') || '0');
    };
    const left = parse(halves[0]);
    const right = halves.length === 2 ? parse(halves[1]) : [];
    if (left === null || right === null) return null;
    let groups: string[];
    if (halves.length === 2) {
        const missing = 8 - left.length - right.length;
        if (missing < 1) return null;
        groups = [...left, ...Array(missing).fill('0'), ...right];
    } else {
        groups = left;
    }
    if (groups.length !== 8) return null;
    return groups.join(':');
}

function normalizeIp(value: string): string | null {
    return normalizeIpv4(value) ?? normalizeIpv6(value);
}

function isIpv6(value: string): boolean {
    return value.includes(':');
}

async function lookupUser(env: Env, key: string): Promise<PairUser | null> {
    const row = (await env.DB.prepare('SELECT id, username FROM users WHERE lower(username) = ?')
        .bind(key)
        .first()) as { id: string; username: string } | null;
    return row ? { userId: String(row.id), username: String(row.username) } : null;
}

async function trustedIpMatches(env: Env, userId: string, ip: string | null): Promise<boolean> {
    if (!ip) return false;
    const normalized = normalizeIp(ip);
    if (!normalized) return false;
    const rows = (await env.DB.prepare('SELECT id, ip_encrypted FROM hrt_trusted_ips WHERE user_id = ? LIMIT 50')
        .bind(userId)
        .all()) as { results?: Array<{ id: string; ip_encrypted: string }> };
    for (const row of rows.results ?? []) {
        const stored = await decryptIp(env, String(row.ip_encrypted));
        if (stored && normalizeIp(stored) === normalized) {
            await env.DB.prepare('UPDATE hrt_trusted_ips SET last_used_at = ? WHERE id = ?')
                .bind(nowSeconds(), row.id)
                .run();
            return true;
        }
    }
    return false;
}

async function createPairRequest(
    env: Env,
    row: {
        usernameKey: string;
        userId: string | null;
        fingerprint: string;
        name: string;
        codeHash: string;
        ip: string | null;
        country: string | null;
        status: 'pending' | 'held';
        now: number;
    },
): Promise<{ requestId: string; pollSecret: string; expiresAt: number }> {
    const requestId = randomHex(16);
    const pollSecret = randomHex(32);
    const pollHash = await sha256Hex(pollSecret);
    const encryptedIp = await encryptIp(env, row.ip);
    await env.DB.prepare(
        `INSERT INTO hrt_pair_requests
            (id, username_key, user_id, device_fingerprint, device_name, code_hash,
             poll_secret_hash, ip_encrypted, country, status, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    )
        .bind(
            requestId,
            row.usernameKey,
            row.userId,
            row.fingerprint,
            row.name,
            row.codeHash,
            pollHash,
            encryptedIp,
            row.country,
            row.status,
            row.now,
            row.now + PAIR_TTL_SECONDS,
        )
        .run();
    return { requestId, pollSecret, expiresAt: row.now + PAIR_TTL_SECONDS };
}

async function activeHold(env: Env, key: string) {
    return (await env.DB.prepare('SELECT * FROM hrt_holds WHERE username_key = ?').bind(key).first()) as {
        hold_until: number;
        blocked_count: number;
        last_blocked_at: number | null;
    } | null;
}

async function recordHold(env: Env, key: string, now: number, blockedCount: number) {
    await env.DB.prepare(
        `INSERT INTO hrt_holds
            (username_key, hold_until, blocked_count, first_blocked_at, last_blocked_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(username_key) DO UPDATE SET
            hold_until = excluded.hold_until,
            blocked_count = max(hrt_holds.blocked_count + 1, excluded.blocked_count),
            last_blocked_at = excluded.last_blocked_at`,
    )
        .bind(key, now + HOLD_SECONDS, blockedCount, now)
        .run();
}

async function pairStart(request: Request, env: Env): Promise<Response> {
    if (!(await ipKey(env))) {
        return error('SERVICE_UNAVAILABLE', 'pairing IP encryption is not configured', 503);
    }
    const parsed = await readSmallJsonBody(request, 64 * 1024);
    if (!parsed.ok) {
        return error(parsed.tooLarge ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST', 'invalid request body', 400);
    }
    const body = parsed.value as Record<string, unknown>;
    const key = usernameKey(body.username);
    const name = deviceName(body.device_name);
    const fingerprint = await certificateFingerprint(body.device_certificate);
    const codeHash = typeof body.code_hash === 'string' ? body.code_hash.toLowerCase() : '';
    if (!key || !name || !fingerprint || !HEX_64.test(codeHash)) {
        return error('INVALID_REQUEST', 'invalid pairing request', 400);
    }
    if (
        body.client_version !== undefined &&
        (typeof body.client_version !== 'string' || body.client_version.length > 64)
    ) {
        return error('INVALID_REQUEST', 'invalid client version', 400);
    }

    const now = nowSeconds();
    const user = await lookupUser(env, key);
    const ip = clientIp(request);
    const country = clientCountry(request);
    const trusted = user ? await trustedIpMatches(env, user.userId, ip) : false;

    if (!trusted) {
        const hold = await activeHold(env, key);
        if (hold && Number(hold.hold_until) > now) {
            if (hold.last_blocked_at === null || now - Number(hold.last_blocked_at) >= 60) {
                await env.DB.prepare(
                    'UPDATE hrt_holds SET blocked_count = blocked_count + 1, last_blocked_at = ? WHERE username_key = ?',
                )
                    .bind(now, key)
                    .run();
            }
            return json({
                request_id: randomHex(16),
                poll_secret: randomHex(32),
                expires_at: now + PAIR_TTL_SECONDS,
                verification_url: verificationUrl(env, ''),
            });
        }
        const count = (await env.DB.prepare(
            'SELECT COUNT(*) AS n FROM hrt_pair_requests WHERE username_key = ? AND created_at >= ?',
        )
            .bind(key, now - PAIR_WINDOW_SECONDS)
            .first()) as { n: number } | null;
        if (Number(count?.n ?? 0) >= PAIR_LIMIT) {
            await recordHold(env, key, now, Number(count?.n ?? 0) + 1);
            return json({
                request_id: randomHex(16),
                poll_secret: randomHex(32),
                expires_at: now + PAIR_TTL_SECONDS,
                verification_url: verificationUrl(env, ''),
            });
        }
    }

    const created = await createPairRequest(env, {
        usernameKey: key,
        userId: user?.userId ?? null,
        fingerprint,
        name,
        codeHash,
        ip,
        country,
        status: 'pending',
        now,
    });
    return json({
        request_id: created.requestId,
        poll_secret: created.pollSecret,
        expires_at: created.expiresAt,
        verification_url: verificationUrl(env, created.requestId),
    });
}

function verificationUrl(env: Env, requestId: string): string {
    const origin = (env.PUBLIC_APP_ORIGIN || 'https://hrt.mahiro.uk').replace(/\/+$/, '');
    return requestId ? `${origin}/settings?hrtPair=${encodeURIComponent(requestId)}` : `${origin}/settings`;
}

async function pairStatus(request: Request, env: Env): Promise<Response> {
    const parsed = await readSmallJsonBody(request, 4 * 1024);
    if (!parsed.ok) return error('INVALID_REQUEST', 'invalid request body', 400);
    const body = parsed.value as Record<string, unknown>;
    const requestId = typeof body.request_id === 'string' ? body.request_id.toLowerCase() : '';
    const pollSecret = typeof body.poll_secret === 'string' ? body.poll_secret : '';
    if (!HEX_32.test(requestId) || !/^[0-9a-f]{64}$/.test(pollSecret)) {
        return json({ status: 'pending' });
    }
    const row = (await env.DB.prepare('SELECT * FROM hrt_pair_requests WHERE id = ?')
        .bind(requestId)
        .first()) as PairRequestRow | null;
    if (!row) {
        /* A black-holed request is indistinguishable from one still waiting. */
        return json({ status: 'pending' });
    }
    const pollHash = await sha256Hex(pollSecret);
    if (!constantTimeEqual(pollHash, String(row.poll_secret_hash))) {
        return json({ status: 'pending' });
    }
    const now = nowSeconds();
    if (Number(row.expires_at) <= now && row.status === 'pending') {
        await env.DB.prepare("UPDATE hrt_pair_requests SET status = 'expired' WHERE id = ?").bind(requestId).run();
        return json({ status: 'expired' });
    }
    if (row.status === 'held') {
        return json({ status: Number(row.expires_at) <= now ? 'expired' : 'pending' });
    }
    if (row.status === 'denied') return json({ status: 'denied' });
    if (row.status === 'expired') return json({ status: 'expired' });
    if (row.status !== 'approved' || !row.user_id) {
        return json({ status: 'pending' });
    }

    const device = (await env.DB.prepare(
        'SELECT id, revoked_at, expires_at FROM hrt_devices WHERE fingerprint = ? AND user_id = ?',
    )
        .bind(row.device_fingerprint, row.user_id)
        .first()) as { id: string; revoked_at: number | null; expires_at: number } | null;
    if (!device || device.revoked_at !== null || Number(device.expires_at) <= now) {
        return json({ status: 'denied' });
    }
    const user = (await env.DB.prepare('SELECT id, username FROM users WHERE id = ?').bind(row.user_id).first()) as {
        id: string;
        username: string;
    } | null;
    if (!user) return json({ status: 'denied' });

    let sessionId = row.session_id;
    if (!sessionId) {
        sessionId = crypto.randomUUID();
        const ip = (await decryptIp(env, row.ip_encrypted)) ?? 'unknown';
        await env.DB.prepare('INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)')
            .bind(sessionId, user.id, `hrt-tool:${row.device_name}`.slice(0, 500), ip)
            .run();
        await env.DB.prepare('UPDATE hrt_pair_requests SET session_id = ?, token_issued_at = ? WHERE id = ?')
            .bind(sessionId, now, requestId)
            .run();
    }
    const secret = encoder.encode(env.JWT_SECRET);
    const token = await new SignJWT({
        sub: user.id,
        username: user.username,
        role: 'user',
        sid: sessionId,
        hrt: true,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(secret);
    return json({
        status: 'approved',
        token,
        user: { id: user.id, username: user.username },
        device: { fingerprint: row.device_fingerprint, name: row.device_name },
        expires_at: now + 7 * 24 * 60 * 60,
    });
}

async function deviceAuthorize(request: Request, env: Env): Promise<Response> {
    const parsed = await readSmallJsonBody(request, 2048);
    if (!parsed.ok) return error('INVALID_REQUEST', 'invalid request body', 400);
    const fingerprint =
        typeof (parsed.value as Record<string, unknown>).fingerprint === 'string'
            ? String((parsed.value as Record<string, unknown>).fingerprint).toLowerCase()
            : '';
    if (!HEX_64.test(fingerprint)) return error('INVALID_REQUEST', 'invalid fingerprint', 400);
    const now = nowSeconds();
    const device = (await env.DB.prepare(
        'SELECT id, user_id, last_seen_at FROM hrt_devices WHERE fingerprint = ? AND revoked_at IS NULL AND expires_at > ?',
    )
        .bind(fingerprint, now)
        .first()) as { id: string; user_id: string; last_seen_at: number | null } | null;
    if (!device) return error('NOT_AUTHORIZED', 'device is not authorized', 401);
    if (device.last_seen_at === null || now - Number(device.last_seen_at) > 300) {
        await env.DB.prepare('UPDATE hrt_devices SET last_seen_at = ? WHERE id = ?').bind(now, device.id).run();
    }
    return json({ ok: true, userId: device.user_id });
}

export async function handleHrtService(request: Request, env: Env, url: URL): Promise<Response | null> {
    if (!hrtCapability(env).supported) return null;
    const routes = new Set([
        '/api/tool/v1/hrt/pair/start',
        '/api/tool/v1/hrt/pair/status',
        '/api/tool/v1/hrt/device/authorize',
    ]);
    if (!routes.has(url.pathname)) return null;
    if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'POST required', 405);
    if (!(await serviceAuthorized(request, env))) {
        return error('NOT_AUTHORIZED', 'service authentication failed', 401);
    }
    if (url.pathname === '/api/tool/v1/hrt/pair/start') return pairStart(request, env);
    if (url.pathname === '/api/tool/v1/hrt/pair/status') return pairStatus(request, env);
    return deviceAuthorize(request, env);
}

async function pairRequests(env: Env, user: PairUser): Promise<Response> {
    const key = user.username.toLowerCase();
    const since = nowSeconds() - REQUEST_RETENTION_SECONDS;
    const rows = (await env.DB.prepare(
        `SELECT id, device_fingerprint, device_name, country, status, created_at, expires_at,
                approved_at, denied_at, ip_encrypted
           FROM hrt_pair_requests
          WHERE username_key = ? AND created_at >= ? AND status != 'held'
          ORDER BY created_at DESC LIMIT 100`,
    )
        .bind(key, since)
        .all()) as {
        results?: Array<Record<string, unknown>>;
    };
    const requests = [];
    for (const row of rows.results ?? []) {
        requests.push({
            id: String(row.id),
            fingerprint: String(row.device_fingerprint),
            deviceName: String(row.device_name),
            country: row.country === null ? null : String(row.country),
            ip: await decryptIp(env, row.ip_encrypted === null ? null : String(row.ip_encrypted)),
            status: String(row.status),
            createdAt: Number(row.created_at),
            expiresAt: Number(row.expires_at),
            approvedAt: row.approved_at === null ? null : Number(row.approved_at),
            deniedAt: row.denied_at === null ? null : Number(row.denied_at),
        });
    }
    return json({ requests });
}

async function approveRequest(request: Request, env: Env, user: PairUser, requestId: string): Promise<Response> {
    const parsed = await readSmallJsonBody(request, 8 * 1024);
    if (!parsed.ok) return error('INVALID_REQUEST', 'invalid request body', 400);
    const code =
        typeof (parsed.value as Record<string, unknown>).code === 'string'
            ? String((parsed.value as Record<string, unknown>).code).toLowerCase()
            : '';
    if (!HEX_128.test(code)) return error('INVALID_CODE', 'invalid code', 401);
    const codeHash = await sha256Hex(code);
    const key = user.username.toLowerCase();
    const row = (await env.DB.prepare('SELECT * FROM hrt_pair_requests WHERE id = ? AND username_key = ?')
        .bind(requestId, key)
        .first()) as PairRequestRow | null;
    if (!row || row.status !== 'pending' || Number(row.expires_at) <= nowSeconds()) {
        return error('PAIR_NOT_FOUND', 'pairing request not found', 404);
    }
    if (!constantTimeEqual(codeHash, String(row.code_hash))) {
        return error('INVALID_CODE', 'invalid code', 401);
    }
    const existing = (await env.DB.prepare('SELECT id, user_id FROM hrt_devices WHERE fingerprint = ?')
        .bind(row.device_fingerprint)
        .first()) as { id: string; user_id: string } | null;
    if (existing && existing.user_id !== user.userId) {
        return error('DEVICE_CONFLICT', 'certificate is already registered to another account', 409);
    }
    const now = nowSeconds();
    if (existing) {
        await env.DB.prepare(
            `UPDATE hrt_devices
                SET name = ?, expires_at = ?, revoked_at = NULL, last_seen_at = ?
              WHERE id = ?`,
        )
            .bind(row.device_name, now + DEVICE_TTL_SECONDS, now, existing.id)
            .run();
    } else {
        const count = (await env.DB.prepare(
            'SELECT COUNT(*) AS n FROM hrt_devices WHERE user_id = ? AND revoked_at IS NULL',
        )
            .bind(user.userId)
            .first()) as { n: number } | null;
        if (Number(count?.n ?? 0) >= MAX_DEVICES_PER_USER) {
            return error('DEVICE_LIMIT', 'too many active devices', 429);
        }
        await env.DB.prepare(
            `INSERT INTO hrt_devices
                (id, user_id, fingerprint, name, created_at, last_seen_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                crypto.randomUUID(),
                user.userId,
                row.device_fingerprint,
                row.device_name,
                now,
                now,
                now + DEVICE_TTL_SECONDS,
            )
            .run();
    }
    await env.DB.prepare("UPDATE hrt_pair_requests SET status = 'approved', user_id = ?, approved_at = ? WHERE id = ?")
        .bind(user.userId, now, requestId)
        .run();
    return json({ ok: true });
}

async function denyRequest(env: Env, user: PairUser, requestId: string): Promise<Response> {
    const key = user.username.toLowerCase();
    const result = await env.DB.prepare(
        "UPDATE hrt_pair_requests SET status = 'denied', denied_at = ? WHERE id = ? AND username_key = ? AND status = 'pending'",
    )
        .bind(nowSeconds(), requestId, key)
        .run();
    if (!result.meta || Number(result.meta.changes) === 0) {
        return error('PAIR_NOT_FOUND', 'pairing request not found', 404);
    }
    return json({ ok: true });
}

async function hrtStatus(env: Env, user: PairUser): Promise<Response> {
    const hold = await activeHold(env, user.username.toLowerCase());
    const blocked = Number(hold?.blocked_count ?? 0);
    return json({
        holdUntil: hold && Number(hold.hold_until) > nowSeconds() ? Number(hold.hold_until) : null,
        blockedCount: blocked,
        passwordAdvice: blocked > 0,
    });
}

async function devices(env: Env, user: PairUser): Promise<Response> {
    const rows = (await env.DB.prepare(
        `SELECT id, fingerprint, name, created_at, last_seen_at, expires_at, revoked_at
           FROM hrt_devices WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
        .bind(user.userId)
        .all()) as { results?: Array<Record<string, unknown>> };
    return json({
        devices: (rows.results ?? []).map(row => ({
            id: String(row.id),
            fingerprint: String(row.fingerprint),
            name: String(row.name),
            createdAt: Number(row.created_at),
            lastSeenAt: row.last_seen_at === null ? null : Number(row.last_seen_at),
            expiresAt: Number(row.expires_at),
            revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
        })),
    });
}

async function revokeDevice(env: Env, user: PairUser, deviceId: string): Promise<Response> {
    const result = await env.DB.prepare(
        'UPDATE hrt_devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
    )
        .bind(nowSeconds(), deviceId, user.userId)
        .run();
    if (!result.meta || Number(result.meta.changes) === 0) {
        return error('DEVICE_NOT_FOUND', 'device not found', 404);
    }
    return json({ ok: true });
}

async function trustedIps(env: Env, user: PairUser): Promise<Response> {
    const rows = (await env.DB.prepare(
        'SELECT id, ip_encrypted, prefix, label, created_at, last_used_at FROM hrt_trusted_ips WHERE user_id = ? ORDER BY created_at DESC',
    )
        .bind(user.userId)
        .all()) as { results?: Array<Record<string, unknown>> };
    const entries = [];
    for (const row of rows.results ?? []) {
        entries.push({
            id: String(row.id),
            ip: await decryptIp(env, String(row.ip_encrypted)),
            prefix: Number(row.prefix),
            label: String(row.label),
            createdAt: Number(row.created_at),
            lastUsedAt: row.last_used_at === null ? null : Number(row.last_used_at),
        });
    }
    return json({ trustedIps: entries });
}

async function addTrustedIp(request: Request, env: Env, user: PairUser): Promise<Response> {
    const parsed = await readSmallJsonBody(request, 8 * 1024);
    if (!parsed.ok) return error('INVALID_REQUEST', 'invalid request body', 400);
    const body = parsed.value as Record<string, unknown>;
    const ip = typeof body.ip === 'string' ? normalizeIp(body.ip.trim()) : null;
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!ip || label.length === 0 || label.length > 32 || password.length === 0) {
        return error('INVALID_REQUEST', 'invalid trusted IP entry', 400);
    }
    const userRow = (await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
        .bind(user.userId)
        .first()) as { password_hash: string } | null;
    if (!userRow || !(await bcrypt.compare(password, String(userRow.password_hash)))) {
        return error('INVALID_PASSWORD', 'invalid password', 403);
    }
    if (!(await ipKey(env))) {
        return error('SERVICE_UNAVAILABLE', 'trusted IP encryption is not configured', 503);
    }
    const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM hrt_trusted_ips WHERE user_id = ?')
        .bind(user.userId)
        .first()) as { n: number } | null;
    if (Number(count?.n ?? 0) >= MAX_TRUSTED_IPS) {
        return error('TRUSTED_IP_LIMIT', 'too many trusted IPs', 429);
    }
    const encrypted = await encryptIp(env, ip);
    if (!encrypted) return error('SERVICE_UNAVAILABLE', 'trusted IP encryption is not configured', 503);
    await env.DB.prepare(
        `INSERT INTO hrt_trusted_ips (id, user_id, ip_encrypted, family, prefix, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            crypto.randomUUID(),
            user.userId,
            encrypted,
            isIpv6(ip) ? 6 : 4,
            isIpv6(ip) ? 128 : 32,
            label,
            nowSeconds(),
        )
        .run();
    return json({ ok: true });
}

async function removeTrustedIp(env: Env, user: PairUser, id: string): Promise<Response> {
    const result = await env.DB.prepare('DELETE FROM hrt_trusted_ips WHERE id = ? AND user_id = ?')
        .bind(id, user.userId)
        .run();
    if (!result.meta || Number(result.meta.changes) === 0) {
        return error('TRUSTED_IP_NOT_FOUND', 'trusted IP not found', 404);
    }
    return json({ ok: true });
}

export async function handleHrtWeb(request: Request, env: Env, url: URL, user: PairUser): Promise<Response | null> {
    if (!hrtCapability(env).supported) return null;
    const path = url.pathname;
    if (path === '/api/hrt/status' && request.method === 'GET') return hrtStatus(env, user);
    if (path === '/api/hrt/requests' && request.method === 'GET') return pairRequests(env, user);
    if (path === '/api/hrt/devices' && request.method === 'GET') return devices(env, user);
    if (path === '/api/hrt/trusted-ips' && request.method === 'GET') return trustedIps(env, user);
    if (path === '/api/hrt/trusted-ips' && request.method === 'POST') {
        return addTrustedIp(request, env, user);
    }
    const requestMatch = /^\/api\/hrt\/requests\/([0-9a-f]{32})\/(approve|deny)$/.exec(path);
    if (requestMatch && request.method === 'POST') {
        return requestMatch[2] === 'approve'
            ? approveRequest(request, env, user, requestMatch[1])
            : denyRequest(env, user, requestMatch[1]);
    }
    const deviceMatch = /^\/api\/hrt\/devices\/([0-9a-f-]{36})\/revoke$/.exec(path);
    if (deviceMatch && request.method === 'POST') {
        return revokeDevice(env, user, deviceMatch[1]);
    }
    const trustedMatch = /^\/api\/hrt\/trusted-ips\/([0-9a-f-]{36})$/.exec(path);
    if (trustedMatch && request.method === 'DELETE') {
        return removeTrustedIp(env, user, trustedMatch[1]);
    }
    return null;
}

/** A tool request carrying the raw adapter's device header must match its token. */
export async function hrtDeviceMatchesToken(request: Request, env: Env, userId: string): Promise<boolean> {
    const fingerprint = request.headers.get('x-hrt-device-fingerprint');
    if (!fingerprint) return true;
    if (!HEX_64.test(fingerprint.toLowerCase())) return false;
    const device = (await env.DB.prepare(
        'SELECT user_id FROM hrt_devices WHERE fingerprint = ? AND revoked_at IS NULL AND expires_at > ?',
    )
        .bind(fingerprint.toLowerCase(), nowSeconds())
        .first()) as { user_id: string } | null;
    return Boolean(device && device.user_id === userId);
}
