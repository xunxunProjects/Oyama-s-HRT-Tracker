/**
 * F2F ("face to face") cohort registry.
 *
 * A cohort has 100 numbered seats. Seats are assigned once and never reused:
 * deleting an account leaves a tombstone row, so a new member always takes a
 * higher seat and a full cohort (100 rows, active or deleted) is closed. This
 * module stores only public keys. The optional cohort escrow key columns are
 * reserved for the separately enabled escrow mode; no private key is created
 * or returned here.
 */

import { readSmallJsonBody } from './requestInput';
import type { Env } from './worker';

const COHORT_SIZE = 100;
const MAX_KEYS_PER_USER = 20;
const MAX_PUBLIC_KEY_BYTES = 64 * 1024;
const MIN_PUBLIC_KEY_BYTES = 100;
const IDLE_RETIRE_SECONDS = 180 * 24 * 60 * 60;

const HEX_FINGERPRINT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const COHORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ARMOR_BEGIN = '-----BEGIN PGP PUBLIC KEY BLOCK-----';
const ARMOR_END = '-----END PGP PUBLIC KEY BLOCK-----';

const encoder = new TextEncoder();

export interface F2fUser {
    userId: string;
    username: string;
}

interface SeatRow {
    cohort_id: string;
    seat: number;
    status: string;
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

function normalizeFingerprint(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const fingerprint = value.trim().toLowerCase();
    return HEX_FINGERPRINT.test(fingerprint) ? fingerprint : null;
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
            cohortId = crypto.randomUUID();
            await env.DB.prepare(
                "INSERT INTO f2f_cohorts (id, state, created_at, last_used_at) VALUES (?, 'active', ?, ?)",
            )
                .bind(cohortId, now, now)
                .run();
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
    const cohort = await env.DB.prepare('SELECT id, state, created_at, last_used_at FROM f2f_cohorts WHERE id = ?')
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

    let seat = await seatForUser(env, user.userId);
    if (seat && seat.status === 'deleted') {
        return error('SEAT_DELETED', 'this account no longer has an F2F seat', 403);
    }
    if (!seat) {
        const assigned = await assignSeat(env, user.userId, nowSeconds());
        seat = { cohort_id: assigned.cohortId, seat: assigned.seat, status: 'active' };
    }

    const cohort = await env.DB.prepare('SELECT state FROM f2f_cohorts WHERE id = ?')
        .bind(seat.cohort_id)
        .first();
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
    const cohort = await env.DB.prepare('SELECT id, state FROM f2f_cohorts WHERE id = ?').bind(cohortId).first();
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
        cohort: { id: String(cohort.id), state: String(cohort.state) },
        members,
    });
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
}
