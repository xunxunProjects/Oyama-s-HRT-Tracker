/**
 * F2F ("face to face") cohort registry.
 *
 * A cohort has 100 numbered seats. Seats are assigned once and never reused:
 * deleting an account leaves a tombstone row, so a new member always takes a
 * higher seat and a full cohort (100 rows, active or deleted) is closed.
 *
 * Member public keys are public data. The optional cohort escrow key is an
 * operator-provisioned OpenPGP key pair: only the public part is returned to
 * members, while the private part is stored as an AES-GCM envelope under
 * HRT_ESCROW_KEY and is not exposed by any API here.
 */

import { SignJWT } from 'jose';
import * as openpgp from 'openpgp';
import { getClientIP, readSmallJsonBody } from './requestInput';
import type { Env } from './worker';
import { b64decode, b64encode, constantTimeEqual, error, json, nowSeconds, randomHex, sha256Hex } from './workerUtil';

const COHORT_SIZE = 100;
const CLI_CODE_TTL_SECONDS = 10 * 60;
const CLI_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_KEYS_PER_USER = 20;
const MAX_PUBLIC_KEY_BYTES = 64 * 1024;
const MAX_PRIVATE_KEY_BYTES = 128 * 1024;
const MIN_PUBLIC_KEY_BYTES = 100;
const IDLE_RETIRE_SECONDS = 180 * 24 * 60 * 60;

const HEX_FINGERPRINT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const CLI_CODE = /^[0-9a-f]{32}$/;
const COHORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ARMOR_BEGIN = '-----BEGIN PGP PUBLIC KEY BLOCK-----';
const ARMOR_END = '-----END PGP PUBLIC KEY BLOCK-----';
const PRIVATE_ARMOR_BEGIN = '-----BEGIN PGP PRIVATE KEY BLOCK-----';
const PRIVATE_ARMOR_END = '-----END PGP PRIVATE KEY BLOCK-----';

const encoder = new TextEncoder();

export interface F2fUser {
    userId: string;
    username: string;
}

class F2fError extends Error {
    constructor(
        readonly code: string,
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

async function escrowCryptoKey(env: Env): Promise<CryptoKey> {
    const bytes = env.HRT_ESCROW_KEY ? b64decode(env.HRT_ESCROW_KEY) : null;
    if (!bytes || bytes.length !== 32) {
        throw new F2fError('ESCROW_UNAVAILABLE', 503, 'escrow is enabled but HRT_ESCROW_KEY is not configured');
    }
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptEscrowPrivateKey(env: Env, privateKey: string, fingerprint: string): Promise<string> {
    const key = await escrowCryptoKey(env);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    /* The fingerprint is authenticated data, so a ciphertext cannot be moved
       to another key row without failing decryption. */
    const additionalData = encoder.encode(`f2f-escrow-v1:${fingerprint}`);
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, encoder.encode(privateKey)),
    );
    return `v1.${b64encode(iv)}.${b64encode(ciphertext)}`;
}

interface SeatRow {
    cohort_id: string;
    seat: number;
    status: string;
}

function hasUnsafeControl(value: string): boolean {
    for (const char of value) {
        const code = char.codePointAt(0)!;
        if (code < 0x20 && char !== '\n' && char !== '\r' && char !== '\t') return true;
        if (code === 0x7f) return true;
    }
    return false;
}

function normalizePublicKey(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const key = value.trim();
    const bytes = encoder.encode(key).length;
    if (bytes < MIN_PUBLIC_KEY_BYTES || bytes > MAX_PUBLIC_KEY_BYTES) return null;
    if (!key.startsWith(ARMOR_BEGIN) || !key.endsWith(ARMOR_END)) return null;
    if (hasUnsafeControl(key)) return null;
    return key;
}

function normalizePrivateKey(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const key = value.trim();
    const bytes = encoder.encode(key).length;
    if (bytes < MIN_PUBLIC_KEY_BYTES || bytes > MAX_PRIVATE_KEY_BYTES) return null;
    if (!key.startsWith(PRIVATE_ARMOR_BEGIN) || !key.endsWith(PRIVATE_ARMOR_END)) return null;
    if (hasUnsafeControl(key)) return null;
    return key;
}

function normalizeFingerprint(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const fingerprint = value.trim().toLowerCase();
    return HEX_FINGERPRINT.test(fingerprint) ? fingerprint : null;
}

/** Parse the armored key and require a public, unexpired, unrevoked key whose
 *  fingerprint matches the value the client supplied. Without this, a member
 *  can poison the cohort keyring with arbitrary text and break every other
 *  member's import. */
async function validPublicKey(armored: string, fingerprint: string): Promise<boolean> {
    try {
        const keys = await openpgp.readKeys({ armoredKeys: armored });
        if (keys.length !== 1) return false;
        const key = keys[0];
        if (key.isPrivate()) return false;
        if (await key.isRevoked()) return false;
        /* OpenPGP.js returns Infinity for a key that never expires, so only a
           real Date can be in the past. */
        const expiration = await key.getExpirationTime();
        if (expiration instanceof Date && expiration.getTime() <= Date.now()) return false;
        const encryptionKey = await key.getEncryptionKey();
        const encryptionExpiration = await encryptionKey.getExpirationTime();
        if (encryptionExpiration instanceof Date && encryptionExpiration.getTime() <= Date.now()) {
            return false;
        }
        return key.getFingerprint().toLowerCase() === fingerprint;
    } catch {
        return false;
    }
}

async function validPrivateKey(armored: string, fingerprint: string): Promise<boolean> {
    try {
        const key = await openpgp.readPrivateKey({ armoredKey: armored });
        return key.isPrivate() && key.getFingerprint().toLowerCase() === fingerprint;
    } catch {
        return false;
    }
}

async function serviceAuthorized(request: Request, env: Env): Promise<boolean> {
    const expected = env.HRT_SERVICE_TOKEN;
    const provided = request.headers.get('x-hrt-service');
    if (!expected || !provided) return false;
    return constantTimeEqual(await sha256Hex(expected), await sha256Hex(provided));
}

async function readBody(
    request: Request,
    maxBytes: number,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
    const parsed = await readSmallJsonBody(request, maxBytes);
    if (!parsed.ok) {
        return {
            ok: false,
            response: error(
                parsed.tooLarge ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST',
                'invalid request body',
                parsed.tooLarge ? 413 : 400,
            ),
        };
    }
    if (parsed.value === null || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
        return { ok: false, response: error('INVALID_REQUEST', 'invalid request body', 400) };
    }
    return { ok: true, value: parsed.value as Record<string, unknown> };
}

async function seatForUser(env: Env, userId: string): Promise<SeatRow | null> {
    const row = await env.DB.prepare('SELECT cohort_id, seat, status FROM f2f_seats WHERE user_id = ?')
        .bind(userId)
        .first();
    if (!row) return null;
    return {
        cohort_id: String(row.cohort_id),
        seat: Number(row.seat),
        status: String(row.status),
    };
}

/**
 * Create a cohort, reserving an escrow key first when escrow is enabled. The
 * reservation is a conditional UPDATE, so concurrent cohort creations cannot
 * share one key. If the cohort insert then fails, the key is released.
 */
async function createCohort(env: Env, now: number): Promise<string> {
    if (env.HRT_F2F_ESCROW !== '1') {
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO f2f_cohorts (id, state, created_at, last_used_at) VALUES (?, 'active', ?, ?)")
            .bind(id, now, now)
            .run();
        return id;
    }
    if (!env.HRT_ESCROW_KEY) {
        throw new F2fError('ESCROW_UNAVAILABLE', 503, 'escrow is enabled but HRT_ESCROW_KEY is not configured');
    }

    for (let attempt = 0; attempt < 5; attempt++) {
        const key = await env.DB.prepare(
            `SELECT id, public_key, private_key_encrypted, fingerprint
               FROM f2f_escrow_keys
              WHERE state = 'available'
              ORDER BY created_at ASC LIMIT 1`,
        ).first();
        if (!key) {
            throw new F2fError('ESCROW_UNAVAILABLE', 503, 'no escrow key is available');
        }
        const id = crypto.randomUUID();
        const reserved = await env.DB.prepare(
            "UPDATE f2f_escrow_keys SET state = 'assigned', cohort_id = ?, assigned_at = ? WHERE id = ? AND state = 'available'",
        )
            .bind(id, now, String(key.id))
            .run();
        if (Number(reserved.meta?.changes ?? 0) !== 1) {
            continue;
        }
        try {
            await env.DB.prepare(
                `INSERT INTO f2f_cohorts
                   (id, state, created_at, last_used_at,
                    escrow_public_key, escrow_private_key_encrypted, escrow_fingerprint)
                 VALUES (?, 'active', ?, ?, ?, ?, ?)`,
            )
                .bind(id, now, now, String(key.public_key), String(key.private_key_encrypted), String(key.fingerprint))
                .run();
        } catch (insertError) {
            await env.DB.prepare(
                "UPDATE f2f_escrow_keys SET state = 'available', cohort_id = NULL, assigned_at = NULL WHERE id = ? AND cohort_id = ?",
            )
                .bind(String(key.id), id)
                .run();
            throw insertError;
        }
        return id;
    }
    throw new F2fError('ESCROW_UNAVAILABLE', 503, 'could not reserve an escrow key');
}

/**
 * Assign the lowest unoccupied seat. A deleted seat still occupies its row,
 * so it is skipped forever. The insert uses ON CONFLICT DO NOTHING and retries
 * when another request wins the same seat.
 */
async function assignSeat(env: Env, userId: string, now: number): Promise<{ cohortId: string; seat: number }> {
    for (let attempt = 0; attempt < 5; attempt++) {
        let cohortId: string;
        const active = await env.DB.prepare(
            "SELECT id FROM f2f_cohorts WHERE state = 'active' ORDER BY created_at ASC LIMIT 1",
        ).first();
        if (active) {
            cohortId = String(active.id);
        } else {
            cohortId = await createCohort(env, now);
        }

        const usedResult = await env.DB.prepare('SELECT seat FROM f2f_seats WHERE cohort_id = ?').bind(cohortId).all();
        const used = new Set((usedResult.results ?? []).map(row => Number(row.seat)));
        let seat = 0;
        for (let candidate = 1; candidate <= COHORT_SIZE; candidate++) {
            if (!used.has(candidate)) {
                seat = candidate;
                break;
            }
        }
        if (seat === 0) {
            await env.DB.prepare("UPDATE f2f_cohorts SET state = 'full' WHERE id = ? AND state = 'active'")
                .bind(cohortId)
                .run();
            continue;
        }

        const inserted = await env.DB.prepare(
            `INSERT INTO f2f_seats (cohort_id, seat, user_id, status, created_at, updated_at)
             VALUES (?, ?, ?, 'active', ?, ?)
             ON CONFLICT (cohort_id, seat) DO NOTHING`,
        )
            .bind(cohortId, seat, userId, now, now)
            .run();
        if (Number(inserted.meta?.changes ?? 0) === 0) {
            continue;
        }

        const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM f2f_seats WHERE cohort_id = ?')
            .bind(cohortId)
            .first();
        if (Number(count?.n ?? 0) >= COHORT_SIZE) {
            await env.DB.prepare("UPDATE f2f_cohorts SET state = 'full', last_used_at = ? WHERE id = ?")
                .bind(now, cohortId)
                .run();
        }
        return { cohortId, seat };
    }
    throw new Error('could not assign an F2F seat');
}

async function status(env: Env, user: F2fUser): Promise<Response> {
    const seat = await seatForUser(env, user.userId);
    if (!seat || seat.status !== 'active') {
        return json({ registered: false });
    }
    const cohort = await env.DB.prepare(
        `SELECT id, state, created_at, last_used_at, escrow_public_key, escrow_fingerprint
           FROM f2f_cohorts WHERE id = ?`,
    )
        .bind(seat.cohort_id)
        .first();
    if (!cohort) {
        return json({ registered: false });
    }
    const counts = await env.DB.prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
           FROM f2f_seats WHERE cohort_id = ?`,
    )
        .bind(seat.cohort_id)
        .first();
    const key = await env.DB.prepare(
        `SELECT id, fingerprint, public_key, status, created_at
           FROM f2f_keys WHERE user_id = ? AND status = 'active'
          ORDER BY created_at DESC LIMIT 1`,
    )
        .bind(user.userId)
        .first();

    return json({
        registered: true,
        cohort: {
            id: String(cohort.id),
            state: String(cohort.state),
            memberCount: Number(counts?.active ?? 0),
            totalSeats: Number(counts?.total ?? 0),
        },
        seat: seat.seat,
        key: key
            ? {
                  id: String(key.id),
                  fingerprint: String(key.fingerprint),
                  publicKey: String(key.public_key),
                  status: String(key.status),
                  createdAt: Number(key.created_at),
              }
            : null,
        escrow:
            typeof cohort.escrow_public_key === 'string' && cohort.escrow_public_key
                ? {
                      publicKey: String(cohort.escrow_public_key),
                      fingerprint: String(cohort.escrow_fingerprint ?? ''),
                  }
                : null,
    });
}

async function uploadKey(env: Env, request: Request, user: F2fUser): Promise<Response> {
    const parsed = await readBody(request, MAX_PUBLIC_KEY_BYTES + 8 * 1024);
    if ('response' in parsed) return parsed.response;

    const publicKey = normalizePublicKey(parsed.value.public_key);
    const fingerprint = normalizeFingerprint(parsed.value.fingerprint);
    if (!publicKey || !fingerprint) {
        return error('INVALID_KEY', 'a valid armored public key and fingerprint are required', 400);
    }
    if (!(await validPublicKey(publicKey, fingerprint))) {
        return error('INVALID_KEY', 'the public key does not match the fingerprint or cannot be used', 400);
    }

    let seat = await seatForUser(env, user.userId);
    if (seat && seat.status === 'deleted') {
        return error('SEAT_DELETED', 'this account no longer has an F2F seat', 403);
    }
    if (!seat) {
        try {
            const assigned = await assignSeat(env, user.userId, nowSeconds());
            seat = { cohort_id: assigned.cohortId, seat: assigned.seat, status: 'active' };
        } catch (assignError) {
            if (assignError instanceof F2fError) {
                return error(assignError.code, assignError.message, assignError.status);
            }
            return error('SEAT_UNAVAILABLE', 'could not assign a seat', 503);
        }
    }

    const cohort = await env.DB.prepare('SELECT state FROM f2f_cohorts WHERE id = ?').bind(seat.cohort_id).first();
    if (!cohort) {
        return error('COHORT_NOT_FOUND', 'cohort not found', 409);
    }
    if (String(cohort.state) === 'revoked' || String(cohort.state) === 'deleted') {
        return error('COHORT_CLOSED', 'this cohort no longer accepts keys', 409);
    }

    const existing = await env.DB.prepare('SELECT id, user_id, status FROM f2f_keys WHERE fingerprint = ?')
        .bind(fingerprint)
        .first();
    if (existing) {
        if (String(existing.user_id) === user.userId && String(existing.status) === 'active') {
            return json({
                cohort_id: seat.cohort_id,
                seat: seat.seat,
                key_id: String(existing.id),
                fingerprint,
                status: 'active',
                idempotent: true,
            });
        }
        return error('KEY_EXISTS', 'this fingerprint is already registered', 409);
    }

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM f2f_keys WHERE user_id = ?')
        .bind(user.userId)
        .first();
    if (Number(count?.n ?? 0) >= MAX_KEYS_PER_USER) {
        return error('KEY_LIMIT', 'too many keys for this account', 429);
    }

    const now = nowSeconds();
    const keyId = crypto.randomUUID();
    try {
        await env.DB.batch([
            env.DB.prepare(
                `UPDATE f2f_keys SET status = 'retired', retired_at = ?, updated_at = ?
                  WHERE user_id = ? AND status = 'active'`,
            ).bind(now, now, user.userId),
            env.DB.prepare(
                `INSERT INTO f2f_keys
                   (id, user_id, cohort_id, seat, fingerprint, public_key, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
            ).bind(keyId, user.userId, seat.cohort_id, seat.seat, fingerprint, publicKey, now, now),
            env.DB.prepare('UPDATE f2f_cohorts SET last_used_at = ? WHERE id = ?').bind(now, seat.cohort_id),
        ]);
    } catch {
        return error('KEY_EXISTS', 'the key could not be registered', 409);
    }

    return json({
        cohort_id: seat.cohort_id,
        seat: seat.seat,
        key_id: keyId,
        fingerprint,
        status: 'active',
    });
}

async function changeKeyStatus(
    env: Env,
    request: Request,
    user: F2fUser,
    nextStatus: 'retired' | 'revoked',
): Promise<Response> {
    const parsed = await readBody(request, 8 * 1024);
    if ('response' in parsed) return parsed.response;
    const keyId = typeof parsed.value.key_id === 'string' ? parsed.value.key_id.trim().toLowerCase() : '';
    if (!KEY_ID.test(keyId)) {
        return error('INVALID_REQUEST', 'a valid key id is required', 400);
    }
    const key = await env.DB.prepare('SELECT id, cohort_id, status FROM f2f_keys WHERE id = ? AND user_id = ?')
        .bind(keyId, user.userId)
        .first();
    if (!key) {
        return error('KEY_NOT_FOUND', 'key not found', 404);
    }
    if (nextStatus === 'retired' && String(key.status) === 'revoked') {
        return error('KEY_REVOKED', 'a revoked key cannot be retired', 409);
    }
    const now = nowSeconds();
    if (nextStatus === 'retired') {
        await env.DB.prepare(
            `UPDATE f2f_keys SET status = 'retired', retired_at = ?, updated_at = ?
              WHERE id = ? AND status = 'active'`,
        )
            .bind(now, now, keyId)
            .run();
    } else {
        await env.DB.prepare(
            `UPDATE f2f_keys SET status = 'revoked', revoked_at = ?, updated_at = ?
              WHERE id = ? AND status <> 'revoked'`,
        )
            .bind(now, now, keyId)
            .run();
    }
    await env.DB.prepare('UPDATE f2f_cohorts SET last_used_at = ? WHERE id = ?').bind(now, String(key.cohort_id)).run();
    return json({ ok: true, status: nextStatus });
}

async function cohortMembers(env: Env, user: F2fUser, cohortId: string): Promise<Response> {
    if (!COHORT_ID.test(cohortId)) {
        return error('INVALID_REQUEST', 'invalid cohort id', 400);
    }
    const membership = await env.DB.prepare(
        `SELECT seat FROM f2f_seats
          WHERE cohort_id = ? AND user_id = ? AND status = 'active'`,
    )
        .bind(cohortId, user.userId)
        .first();
    if (!membership) {
        return error('NOT_A_MEMBER', 'you are not an active member of this cohort', 403);
    }
    const cohort = await env.DB.prepare(
        'SELECT id, state, escrow_public_key, escrow_fingerprint FROM f2f_cohorts WHERE id = ?',
    )
        .bind(cohortId)
        .first();
    if (!cohort) {
        return error('COHORT_NOT_FOUND', 'cohort not found', 404);
    }

    const seats = await env.DB.prepare(
        `SELECT s.seat, s.user_id, s.status AS seat_status, u.username
           FROM f2f_seats s
           LEFT JOIN users u ON u.id = s.user_id
          WHERE s.cohort_id = ?
          ORDER BY s.seat ASC`,
    )
        .bind(cohortId)
        .all();
    const keys = await env.DB.prepare(
        `SELECT user_id, fingerprint, public_key, status, created_at
           FROM f2f_keys
          WHERE cohort_id = ? AND status IN ('active', 'retired') AND public_key <> ''
          ORDER BY created_at ASC`,
    )
        .bind(cohortId)
        .all();

    const keysByUser = new Map<string, Array<Record<string, unknown>>>();
    for (const key of keys.results ?? []) {
        const userId = String(key.user_id);
        const list = keysByUser.get(userId) ?? [];
        list.push({
            fingerprint: String(key.fingerprint),
            publicKey: String(key.public_key),
            status: String(key.status),
            createdAt: Number(key.created_at),
        });
        keysByUser.set(userId, list);
    }

    const members = (seats.results ?? [])
        .filter(seat => String(seat.seat_status) === 'active' && typeof seat.username === 'string')
        .map(seat => ({
            seat: Number(seat.seat),
            username: String(seat.username),
            keys: keysByUser.get(String(seat.user_id)) ?? [],
        }));

    /* Reading the keyring is member activity, so it keeps the cohort out of
       the 180-day retirement sweep. */
    await env.DB.prepare('UPDATE f2f_cohorts SET last_used_at = ? WHERE id = ?').bind(nowSeconds(), cohortId).run();

    return json({
        cohort: {
            id: String(cohort.id),
            state: String(cohort.state),
            escrow: cohort.escrow_public_key
                ? {
                      publicKey: String(cohort.escrow_public_key),
                      fingerprint: String(cohort.escrow_fingerprint ?? ''),
                  }
                : null,
        },
        members,
    });
}

async function provisionEscrowKey(env: Env, request: Request): Promise<Response> {
    const parsed = await readBody(request, MAX_PUBLIC_KEY_BYTES + MAX_PRIVATE_KEY_BYTES + 16 * 1024);
    if ('response' in parsed) return parsed.response;
    const publicKey = normalizePublicKey(parsed.value.public_key);
    const privateKey = normalizePrivateKey(parsed.value.private_key);
    const fingerprint = normalizeFingerprint(parsed.value.fingerprint);
    if (!publicKey || !privateKey || !fingerprint) {
        return error('INVALID_KEY', 'a valid armored key pair and fingerprint are required', 400);
    }
    if (!(await validPublicKey(publicKey, fingerprint)) || !(await validPrivateKey(privateKey, fingerprint))) {
        return error('INVALID_KEY', 'the key pair does not match the fingerprint or cannot be used', 400);
    }
    if (!env.HRT_ESCROW_KEY) {
        return error('ESCROW_UNAVAILABLE', 'HRT_ESCROW_KEY is not configured', 503);
    }
    let encrypted: string;
    try {
        encrypted = await encryptEscrowPrivateKey(env, privateKey, fingerprint);
    } catch (encryptError) {
        if (encryptError instanceof F2fError) {
            return error(encryptError.code, encryptError.message, encryptError.status);
        }
        return error('ESCROW_UNAVAILABLE', 'cannot encrypt the escrow key', 503);
    }
    const id = crypto.randomUUID();
    try {
        await env.DB.prepare(
            `INSERT INTO f2f_escrow_keys
               (id, public_key, private_key_encrypted, fingerprint, state, created_at)
             VALUES (?, ?, ?, ?, 'available', ?)`,
        )
            .bind(id, publicKey, encrypted, fingerprint, nowSeconds())
            .run();
    } catch {
        return error('KEY_EXISTS', 'this escrow fingerprint is already provisioned', 409);
    }
    return json({ id, fingerprint, state: 'available' });
}

async function escrowStatus(env: Env): Promise<Response> {
    const counts = await env.DB.prepare('SELECT state, COUNT(*) AS n FROM f2f_escrow_keys GROUP BY state').all();
    const keys = await env.DB.prepare(
        `SELECT id, fingerprint, state, cohort_id, created_at, assigned_at
           FROM f2f_escrow_keys ORDER BY created_at ASC LIMIT 100`,
    ).all();
    const summary: Record<string, number> = { available: 0, assigned: 0, retired: 0, deleted: 0 };
    for (const row of counts.results ?? []) {
        summary[String(row.state)] = Number(row.n);
    }
    return json({
        enabled: env.HRT_F2F_ESCROW === '1',
        counts: summary,
        keys: (keys.results ?? []).map(row => ({
            id: String(row.id),
            fingerprint: String(row.fingerprint),
            state: String(row.state),
            cohortId: row.cohort_id === null ? null : String(row.cohort_id),
            createdAt: Number(row.created_at),
            assignedAt: row.assigned_at === null ? null : Number(row.assigned_at),
        })),
    });
}

/** Service-token endpoints used by the operator to provision escrow keys. */
export async function handleF2fService(request: Request, env: Env, url: URL): Promise<Response | null> {
    if (!url.pathname.startsWith('/api/tool/v1/f2f/')) return null;
    if (!(await serviceAuthorized(request, env))) {
        return error('NOT_AUTHORIZED', 'service authentication failed', 401);
    }
    if (url.pathname === '/api/tool/v1/f2f/escrow/keys') {
        if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'POST required', 405);
        return provisionEscrowKey(env, request);
    }
    if (url.pathname === '/api/tool/v1/f2f/escrow/status') {
        if (request.method !== 'GET') return error('METHOD_NOT_ALLOWED', 'GET required', 405);
        return escrowStatus(env);
    }
    return error('NOT_FOUND', 'Not found', 404);
}

async function cohortKeyring(env: Env, user: F2fUser, cohortId: string): Promise<Response> {
    if (!COHORT_ID.test(cohortId)) {
        return error('INVALID_REQUEST', 'invalid cohort id', 400);
    }
    const membership = await env.DB.prepare(
        `SELECT seat FROM f2f_seats
          WHERE cohort_id = ? AND user_id = ? AND status = 'active'`,
    )
        .bind(cohortId, user.userId)
        .first();
    if (!membership) {
        return error('NOT_A_MEMBER', 'you are not an active member of this cohort', 403);
    }
    const cohort = await env.DB.prepare('SELECT escrow_public_key FROM f2f_cohorts WHERE id = ?')
        .bind(cohortId)
        .first();
    if (!cohort) {
        return error('COHORT_NOT_FOUND', 'cohort not found', 404);
    }
    const keys = await env.DB.prepare(
        `SELECT public_key FROM f2f_keys
          WHERE cohort_id = ? AND status = 'active' AND public_key <> ''
          ORDER BY seat ASC`,
    )
        .bind(cohortId)
        .all();

    const blocks: string[] = [];
    for (const row of keys.results ?? []) {
        const armor = String(row.public_key).trim();
        if (armor && !blocks.includes(armor)) blocks.push(armor);
    }
    if (typeof cohort.escrow_public_key === 'string' && cohort.escrow_public_key) {
        const escrow = cohort.escrow_public_key.trim();
        if (escrow && !blocks.includes(escrow)) blocks.push(escrow);
    }
    if (blocks.length === 0) {
        return error('NO_KEYS', 'this cohort has no active public keys', 404);
    }

    return new Response(`${blocks.join('\n\n')}\n`, {
        status: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="hrt-f2f-${cohortId}.asc"`,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

async function createCliCode(env: Env, user: F2fUser): Promise<Response> {
    const code = randomHex(16);
    const codeHash = await sha256Hex(code);
    const now = nowSeconds();
    const expiresAt = now + CLI_CODE_TTL_SECONDS;
    /* Only the newest code stays valid. Generating a replacement invalidates
       one the user may have generated but not yet typed into the CLI. */
    await env.DB.batch([
        env.DB.prepare('DELETE FROM f2f_cli_codes WHERE user_id = ?').bind(user.userId),
        env.DB.prepare(
            'INSERT INTO f2f_cli_codes (code_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        ).bind(codeHash, user.userId, now, expiresAt),
    ]);
    return json({ code, expires_at: expiresAt });
}

/** Unauthenticated code exchange. Called before the session-auth branch in the
 *  worker; the returned JWT carries scope=f2f and is only accepted for
 *  /api/f2f/* routes. */
export async function exchangeF2fCliCode(request: Request, env: Env, jwtSecret: string): Promise<Response> {
    const parsed = await readBody(request, 1024);
    if ('response' in parsed) return parsed.response;
    const raw = parsed.value.code;
    const code = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!CLI_CODE.test(code)) return error('INVALID_CODE', 'invalid or expired code', 401);

    const now = nowSeconds();
    const codeHash = await sha256Hex(code);
    const row = (await env.DB.prepare('SELECT user_id, expires_at, used_at FROM f2f_cli_codes WHERE code_hash = ?')
        .bind(codeHash)
        .first()) as { user_id: string; expires_at: number; used_at: number | null } | null;
    if (!row || row.used_at !== null || Number(row.expires_at) <= now) {
        return error('INVALID_CODE', 'invalid or expired code', 401);
    }

    const userRow = (await env.DB.prepare('SELECT id, username FROM users WHERE id = ?').bind(row.user_id).first()) as {
        id: string;
        username: string;
    } | null;
    if (!userRow) return error('INVALID_CODE', 'invalid or expired code', 401);

    /* Single use is enforced by the UPDATE, not the SELECT above: two
       concurrent exchanges must not both mint a token. */
    const used = await env.DB.prepare(
        'UPDATE f2f_cli_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?',
    )
        .bind(now, codeHash, now)
        .run();
    if (Number(used.meta?.changes ?? 0) !== 1) {
        return error('INVALID_CODE', 'invalid or expired code', 401);
    }

    const sessionId = crypto.randomUUID();
    const ip = getClientIP(request, env) ?? 'unknown';
    await env.DB.prepare('INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)')
        .bind(sessionId, userRow.id, 'hrt-f2f CLI', ip)
        .run();
    const token = await new SignJWT({
        sub: String(userRow.id),
        username: String(userRow.username),
        role: 'user',
        sid: sessionId,
        scope: 'f2f',
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(new TextEncoder().encode(jwtSecret));
    return json({ token, expires_at: now + CLI_TOKEN_TTL_SECONDS });
}

export async function handleF2fWeb(request: Request, env: Env, url: URL, user: F2fUser): Promise<Response | null> {
    if (!url.pathname.startsWith('/api/f2f/')) return null;

    if (url.pathname === '/api/f2f/status') {
        if (request.method !== 'GET') return error('METHOD_NOT_ALLOWED', 'method not allowed', 405);
        return status(env, user);
    }
    if (url.pathname === '/api/f2f/keys') {
        if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'method not allowed', 405);
        return uploadKey(env, request, user);
    }
    if (url.pathname === '/api/f2f/cli/codes') {
        if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'method not allowed', 405);
        return createCliCode(env, user);
    }
    if (url.pathname === '/api/f2f/keys/retire') {
        if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'method not allowed', 405);
        return changeKeyStatus(env, request, user, 'retired');
    }
    if (url.pathname === '/api/f2f/keys/revoke') {
        if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'method not allowed', 405);
        return changeKeyStatus(env, request, user, 'revoked');
    }
    const members = url.pathname.match(/^\/api\/f2f\/cohorts\/([^/]+)\/members$/);
    if (members) {
        if (request.method !== 'GET') return error('METHOD_NOT_ALLOWED', 'method not allowed', 405);
        return cohortMembers(env, user, members[1]);
    }
    const keyring = url.pathname.match(/^\/api\/f2f\/cohorts\/([^/]+)\/keyring$/);
    if (keyring) {
        if (request.method !== 'GET') return error('METHOD_NOT_ALLOWED', 'method not allowed', 405);
        return cohortKeyring(env, user, keyring[1]);
    }
    return null;
}

/** Retire cohorts with no activity for 180 days. They stop taking members but
 *  remain readable; escrow-key deletion is a separate, longer-retention job. */
export async function sweepF2fCohorts(env: Env): Promise<void> {
    const now = nowSeconds();
    await env.DB.prepare(
        `UPDATE f2f_cohorts
            SET state = 'retired', retired_at = ?
          WHERE state IN ('active', 'full') AND last_used_at < ?`,
    )
        .bind(now, now - IDLE_RETIRE_SECONDS)
        .run();
    /* A crash between reserving an escrow key and inserting its cohort would
       otherwise strand the key forever. */
    await env.DB.prepare(
        `UPDATE f2f_escrow_keys
            SET state = 'available', cohort_id = NULL, assigned_at = NULL
          WHERE state = 'assigned'
            AND (cohort_id IS NULL OR cohort_id NOT IN (SELECT id FROM f2f_cohorts))`,
    ).run();
}
