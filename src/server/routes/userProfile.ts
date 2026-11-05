import bcrypt from 'bcryptjs';

import { passwordCheckAllowed } from '../rateLimit';
import { validateUsername, validatePassword, reservedForAdmin } from '../validation';
import { consumeTOTP, verifyAndConsumeBackupCode } from '../totp';
import { ensureCommunityVoteSchema } from '../../../communityVoteServer';
import { logDeletion } from '../userHelpers';
import { readSmallBody, readSmallJsonBody } from '../../../requestInput';

import type { RequestContext } from '../../../worker';

export async function handleUserProfileRoute(
    ctx: RequestContext,
    userId: string,
    sessionId: string | null,
    jwtSecret: string,
): Promise<Response | null> {
    const { request, env, url, corsHeaders, withSecurityHeaders, jsonError } = ctx;

    if (!url.pathname.startsWith('/api/user/')) return null;

    // Profile PATCH
    if (url.pathname === '/api/user/profile' && request.method === 'PATCH') {
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        let { username } = parsedBody.value;
        if (typeof username !== 'string') return jsonError('INVALID_REQUEST', 'Invalid username', 400);
        username = username.trim();
        if (!validateUsername(username)) return jsonError('INVALID_REQUEST', 'Invalid username', 400);
        if (reservedForAdmin(env, username)) return jsonError('CONFLICT', 'Username taken', 409);
        const renamed = await env.DB.prepare(
            `UPDATE users SET username = ?
             WHERE id = ?
               AND NOT EXISTS (
                   SELECT 1 FROM users WHERE lower(username) = lower(?) AND id != ?
               )`,
        )
            .bind(username, userId, username, userId)
            .run();
        if (Number(renamed.meta?.changes ?? 0) === 0) return jsonError('CONFLICT', 'Username taken', 409);
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Profile updated', username }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // Password POST
    if (url.pathname === '/api/user/password' && request.method === 'POST') {
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const { currentPassword, newPassword } = parsedBody.value;
        if (!(await passwordCheckAllowed(env, userId)))
            return jsonError('RATE_LIMITED', 'Too many attempts. Please try again later.', 429, {
                'Retry-After': '60',
            });
        if (typeof currentPassword !== 'string') return jsonError('INVALID_CREDENTIALS', 'Incorrect password', 401);
        const user = (await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first()) as any;

        const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
        const passwordHash = user ? user.password_hash : dummyHash;
        const passwordValid = await bcrypt.compare(currentPassword, passwordHash);

        if (!user || !passwordValid) return jsonError('INVALID_CREDENTIALS', 'Incorrect password', 401);

        const passVal = validatePassword(newPassword);
        if (!passVal.valid) return jsonError('INVALID_REQUEST', passVal.error!, 400);
        const hashed = await bcrypt.hash(newPassword, 10);
        await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hashed, userId).run();
        if (sessionId) {
            await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(userId, sessionId).run();
        }
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Password updated' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // DELETE account
    if (url.pathname === '/api/user/me' && request.method === 'DELETE') {
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const { password, code, backup_code } = parsedBody.value;
        if (!(await passwordCheckAllowed(env, userId)))
            return jsonError('RATE_LIMITED', 'Too many attempts. Please try again later.', 429, {
                'Retry-After': '60',
            });
        if (typeof password !== 'string') return jsonError('INVALID_CREDENTIALS', 'Incorrect password', 401);
        const user = (await env.DB.prepare('SELECT password_hash, created_at, totp_secret FROM users WHERE id = ?')
            .bind(userId)
            .first()) as any;

        const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
        const passwordHash = user ? user.password_hash : dummyHash;
        const passwordValid = await bcrypt.compare(password, passwordHash);

        if (!user || !passwordValid) return jsonError('INVALID_CREDENTIALS', 'Incorrect password', 401);

        if (user.totp_secret) {
            if (!code && !backup_code) {
                return jsonError('TWO_FACTOR_REQUIRED', '2FA code required', 400);
            }
            const twoFAValid = backup_code
                ? await verifyAndConsumeBackupCode(env, userId, String(backup_code), jwtSecret)
                : await consumeTOTP(env, userId, user.totp_secret, String(code));
            if (!twoFAValid) return jsonError('TWO_FACTOR_INVALID', 'Invalid 2FA code', 400);
        }

        const deletedAt = Math.floor(Date.now() / 1000);
        await ensureCommunityVoteSchema(env);
        await env.DB.batch([
            env.DB.prepare('DELETE FROM dosage_shares WHERE user_id = ?').bind(userId),
            env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(userId),
            env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
            env.DB.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(userId),
            env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(userId),
            env.DB.prepare('DELETE FROM f2f_cli_codes WHERE user_id = ?').bind(userId),
            env.DB.prepare('DELETE FROM community_vote_ballots WHERE user_id = ?').bind(userId),
            env.DB.prepare(
                "UPDATE f2f_keys SET status = 'revoked', public_key = '', revoked_at = ?, updated_at = ? WHERE user_id = ?",
            ).bind(deletedAt, deletedAt, userId),
            env.DB.prepare(
                "UPDATE f2f_seats SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE user_id = ?",
            ).bind(deletedAt, deletedAt, userId),
            env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
        ]);
        try {
            await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${userId}`);
        } catch (e) {}
        await logDeletion(env, 'self', user?.created_at ?? null);
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Account deleted' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // Avatar DELETE
    if (url.pathname === '/api/user/avatar' && request.method === 'DELETE') {
        await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${userId}`);
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Avatar deleted' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // Avatar PUT
    if (url.pathname === '/api/user/avatar' && request.method === 'PUT') {
        const body = await readSmallBody(request, 5 * 1024 * 1024);
        if (!body.ok) {
            return body.tooLarge
                ? jsonError('TOO_LARGE', 'File too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid upload', 400);
        }
        const view = body.bytes;
        const contentType =
            view[0] === 0xff && view[1] === 0xd8
                ? 'image/jpeg'
                : view[0] === 0x89 && view[1] === 0x50
                  ? 'image/png'
                  : null;
        if (!contentType) return jsonError('UNSUPPORTED_MEDIA', 'Invalid file type', 415);
        await env.AVATAR_BUCKET.put(`hrt-tracker-user-avatar/${userId}`, view, {
            httpMetadata: { contentType },
        });
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Avatar uploaded' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    return null;
}
