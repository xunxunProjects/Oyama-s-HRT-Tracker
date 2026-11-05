import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

import { checkRateLimit } from '../rateLimit';
import { getClientIP, readSmallJsonBody } from '../../../requestInput';
import { sha256Hex } from '../../../workerUtil';
import { isJsonObject } from '../../../shareSnapshotSchema';

import type { RequestContext } from '../../../worker';

export const SHARE_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;
const MAX_PASSWORD_LENGTH = 128;
const SHARE_VIEWER_PASS_TTL = '24h';

export async function signShareViewerPass(jwtSecret: string, tokenHash: string, passwordHash: string): Promise<string> {
    return new SignJWT({ purpose: 'share-view', share: tokenHash, pw: (await sha256Hex(passwordHash)).slice(0, 32) })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(SHARE_VIEWER_PASS_TTL)
        .sign(new TextEncoder().encode(jwtSecret));
}

async function shareViewerPassValid(
    pass: unknown,
    jwtSecret: string,
    tokenHash: string,
    passwordHash: string,
): Promise<boolean> {
    if (typeof pass !== 'string' || pass.length === 0) return false;
    try {
        const { payload } = await jwtVerify(pass, new TextEncoder().encode(jwtSecret), { algorithms: ['HS256'] });
        return (
            payload.purpose === 'share-view' &&
            payload.share === tokenHash &&
            payload.pw === (await sha256Hex(passwordHash)).slice(0, 32)
        );
    } catch {
        return false;
    }
}

export async function handleSharesAccessRoute(ctx: RequestContext): Promise<Response | null> {
    const { request, env, url, shareJson } = ctx;
    if (!(url.pathname === '/api/shares/access' && request.method === 'POST')) return null;

    const declaredLength = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declaredLength) && declaredLength > 1024) {
        return shareJson({ code: 'INVALID_REQUEST', message: 'Request body is too large' }, 413);
    }
    const parsedAccessBody = await readSmallJsonBody(request, 1024);
    if (!parsedAccessBody.ok) {
        return parsedAccessBody.tooLarge
            ? shareJson({ code: 'INVALID_REQUEST', message: 'Request body is too large' }, 413)
            : shareJson({ code: 'INVALID_REQUEST', message: 'Invalid JSON body' }, 400);
    }
    const body: unknown = parsedAccessBody.value;
    if (!isJsonObject(body))
        return shareJson({ code: 'INVALID_REQUEST', message: 'Request body must be an object' }, 400);
    if (typeof body.token !== 'string')
        return shareJson({ code: 'INVALID_REQUEST', message: 'token is required' }, 400);
    if (!SHARE_TOKEN_REGEX.test(body.token))
        return shareJson({ code: 'SHARE_NOT_FOUND', message: 'Share not found' }, 404);

    const clientIP = getClientIP(request, env);
    if (clientIP && !(await checkRateLimit(env, `share-access-ip:${clientIP}`, 30))) {
        return shareJson({ code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }, 429, {
            'Retry-After': '60',
        });
    }

    const tokenHash = await sha256Hex(body.token);
    const share = (await env.DB.prepare(
        'SELECT password_hash, expires_at, is_live, share_mode, created_at, updated_at, failed_attempts, locked_until FROM dosage_shares WHERE token_hash = ?',
    )
        .bind(tokenHash)
        .first()) as {
        password_hash: string | null;
        expires_at: number | null;
        is_live: number;
        share_mode: any | null;
        created_at: number;
        updated_at: number | null;
        failed_attempts: number | null;
        locked_until: number | null;
    } | null;

    if (!share) {
        const candidate =
            typeof body.password === 'string' && body.password.length <= MAX_PASSWORD_LENGTH ? body.password : '';
        await bcrypt.compare(candidate, '$2b$10$BWJX6W9Wa9yJjNiLDyST0.m81EwzBBgeYjAertEWZnx15kTrQABJ.');
        return shareJson({ code: 'SHARE_NOT_FOUND', message: 'Share not found' }, 404);
    }

    if (!(await checkRateLimit(env, `share-access-token:${tokenHash.slice(0, 20)}`, 300))) {
        return shareJson({ code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }, 429, {
            'Retry-After': '60',
        });
    }

    const createdAt = share.created_at * 1000;
    const updatedAt = (share.updated_at ?? share.created_at) * 1000;
    const expiresAt = share.expires_at == null ? null : share.expires_at * 1000;
    if (share.expires_at != null && share.expires_at <= Math.floor(Date.now() / 1000)) {
        ctx.ctx.waitUntil(
            env.DB.prepare(
                "UPDATE dosage_shares SET snapshot_json = 'null', password_hash = NULL, key_wrapped = NULL WHERE token_hash = ?",
            )
                .bind(tokenHash)
                .run(),
        );
        return shareJson({ code: 'SHARE_EXPIRED', message: 'This share link has expired' }, 410);
    }

    let viewerPass: string | null = null;
    if (
        share.password_hash &&
        !(await shareViewerPassValid(body.viewerPass, ctx.jwtSecret, tokenHash, share.password_hash))
    ) {
        if (body.password === undefined || body.password === '') {
            return shareJson({ code: 'PASSWORD_REQUIRED', message: 'Password required', passwordRequired: true }, 401);
        }
        if (typeof body.password !== 'string') {
            return shareJson({ code: 'INVALID_REQUEST', message: 'password must be a string' }, 400);
        }
        if (body.password.length > MAX_PASSWORD_LENGTH) {
            return shareJson({ code: 'INVALID_PASSWORD', message: 'Incorrect password' }, 403);
        }
        const nowSeconds = Math.floor(Date.now() / 1000);
        const lockedUntil = share.locked_until ?? 0;
        if (lockedUntil > nowSeconds) {
            return shareJson({ code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' }, 429, {
                'Retry-After': String(lockedUntil - nowSeconds),
            });
        }
        if (!(await checkRateLimit(env, `share-access-pw:${tokenHash.slice(0, 20)}`, 10))) {
            return shareJson({ code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }, 429, {
                'Retry-After': '60',
            });
        }
        const passwordValid = await bcrypt.compare(body.password, share.password_hash);
        if (!passwordValid) {
            await env.DB.prepare(
                `UPDATE dosage_shares
                    SET failed_attempts = failed_attempts + 1,
                        locked_until = CASE
                            WHEN failed_attempts + 1 >= 5
                            THEN MAX(COALESCE(locked_until, 0), ? + MIN(900 * (1 << MIN(failed_attempts - 4, 2)), 3600))
                            ELSE locked_until
                        END
                  WHERE token_hash = ?`,
            )
                .bind(nowSeconds, tokenHash)
                .run();
            return shareJson({ code: 'INVALID_PASSWORD', message: 'Incorrect password' }, 403);
        }
        if ((share.failed_attempts ?? 0) > 0 || share.locked_until != null) {
            await env.DB.prepare(
                'UPDATE dosage_shares SET failed_attempts = 0, locked_until = NULL WHERE token_hash = ?',
            )
                .bind(tokenHash)
                .run();
        }
        viewerPass = await signShareViewerPass(ctx.jwtSecret, tokenHash, share.password_hash);
    }

    const snapshotRow = await env.DB.prepare('SELECT snapshot_json, encrypted FROM dosage_shares WHERE token_hash = ?')
        .bind(tokenHash)
        .first<{ snapshot_json: string; encrypted: number }>();
    if (!snapshotRow || snapshotRow.snapshot_json === 'null') {
        return shareJson({ code: 'SHARE_NOT_FOUND', message: 'Share not found' }, 404);
    }
    const stored = JSON.parse(snapshotRow.snapshot_json);
    return shareJson({
        passwordRequired: share.password_hash !== null,
        live: share.is_live === 1,
        createdAt,
        updatedAt,
        expiresAt,
        ...(snapshotRow.encrypted === 1 ? { encryptedSnapshot: stored } : { snapshot: stored }),
        ...(viewerPass ? { viewerPass } : {}),
    });
}
