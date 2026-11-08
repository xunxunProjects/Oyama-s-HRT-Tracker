import bcrypt from 'bcryptjs';

import { passwordCheckAllowed } from '../rateLimit';
import { readSmallJsonBody } from '../../../requestInput';
import { consumeTOTP, generateAndStoreBackupCodes, generateTOTPSecret, verifyTOTP } from '../totp';
import { checkStepUp } from '../stepUp';

import type { RequestContext } from '../../../worker';

export async function handleTwoFactorRoute(
    ctx: RequestContext,
    userId: string,
    jwtSecret: string,
): Promise<Response | null> {
    const { request, env, url, corsHeaders, privateCacheHeaders, withSecurityHeaders, jsonError } = ctx;

    if (!url.pathname.startsWith('/api/user/2fa')) return null;

    // The block below is moved verbatim from worker.ts.
    // GET /api/user/2fa/status
    if (url.pathname === '/api/user/2fa/status' && request.method === 'GET') {
        const row = (await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?').bind(userId).first()) as any;
        const pkRow = (await env.DB.prepare('SELECT COUNT(*) as cnt FROM passkeys WHERE user_id = ?')
            .bind(userId)
            .first()) as any;
        const backupRow = (await env.DB.prepare(
            'SELECT COUNT(*) as cnt FROM backup_codes WHERE user_id = ? AND used_at IS NULL',
        )
            .bind(userId)
            .first()) as any;
        const passkeyCount = pkRow?.cnt ?? 0;
        const backupCodeCount = backupRow?.cnt ?? 0;
        return withSecurityHeaders(
            new Response(
                JSON.stringify({
                    enabled: !!row?.totp_secret || passkeyCount > 0,
                    totp: !!row?.totp_secret,
                    passkey: passkeyCount > 0,
                    backupCodes: backupCodeCount,
                }),
                {
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        ...privateCacheHeaders,
                        'Content-Type': 'application/json',
                    },
                },
            ),
        );
    }

    // POST /api/user/2fa/setup — generate a new TOTP secret (not saved yet)
    if (url.pathname === '/api/user/2fa/setup' && request.method === 'POST') {
        const userRow = (await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first()) as any;
        const username = userRow?.username ?? userId;
        const totpSecret = generateTOTPSecret();
        const issuer = 'HRT Tracker';
        const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${totpSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
        return withSecurityHeaders(
            new Response(JSON.stringify({ secret: totpSecret, uri }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // POST /api/user/2fa/enable — verify code and save secret to DB
    if (url.pathname === '/api/user/2fa/enable' && request.method === 'POST') {
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const { secret: totpSecret, code, password, currentCode } = parsedBody.value;
        if (!(await passwordCheckAllowed(env, userId)))
            return jsonError('RATE_LIMITED', 'Too many attempts. Please try again later.', 429, {
                'Retry-After': '60',
            });
        if (!totpSecret || !code) return jsonError('INVALID_REQUEST', 'Missing secret or code', 400);
        // Validate secret format (base32 chars, 16-32 chars)
        if (!/^[A-Z2-7]{16,64}$/i.test(totpSecret)) return jsonError('INVALID_REQUEST', 'Invalid secret format', 400);

        const existing = (await env.DB.prepare('SELECT password_hash, totp_secret FROM users WHERE id = ?')
            .bind(userId)
            .first()) as any;
        if (!existing) return jsonError('NOT_FOUND', 'User not found', 404);
        const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';

        // Enrolling TOTP is not an additive convenience — it writes the
        // secret that gates login, disabling 2FA, and account deletion. A
        // bearer token alone used to be enough whenever no secret was set
        // yet, which is most accounts: anyone holding a stolen token could
        // pick a secret they control, verify it against itself (the check
        // below proves nothing about the caller), and take the account for
        // good. The victim's own password login then demands a code from
        // the attacker's authenticator, and so does every route that would
        // undo it. The same request also wipes every backup code, including
        // the ones passkey registration issues, so a passkey-protected
        // account lost its recovery path in the bargain. Require the
        // password the strictly weaker operations already ask for — see
        // DELETE /api/user/passkeys/:id and the backup-code regenerate.
        if (typeof password !== 'string' || password.length === 0) {
            return jsonError('INVALID_REQUEST', 'Current password is required', 400);
        }
        if (!(await bcrypt.compare(password, existing.password_hash ?? dummyHash))) {
            return jsonError('INVALID_CREDENTIALS', 'Incorrect password', 401);
        }

        // Re-enrolment is additionally a credential *replacement*, so it
        // also needs a code from the authenticator being replaced — the
        // same proof DELETE /api/user/2fa asks for.
        if (existing.totp_secret) {
            if (!currentCode) {
                return jsonError(
                    'INVALID_REQUEST',
                    '2FA is already enabled: current password and a code from the current authenticator are required',
                    400,
                );
            }
            const currentValid = await consumeTOTP(env, userId, existing.totp_secret, String(currentCode));
            if (!currentValid) return jsonError('TWO_FACTOR_INVALID', 'Invalid code from current authenticator', 401);
        }

        const valid = await verifyTOTP(totpSecret, String(code));
        if (!valid) return jsonError('TWO_FACTOR_INVALID', 'Invalid 2FA code', 400);
        await env.DB.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').bind(totpSecret, userId).run();
        const backupCodes = await generateAndStoreBackupCodes(env, userId, jwtSecret);
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: '2FA enabled', backupCodes }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // DELETE /api/user/2fa — disable 2FA (requires current password + TOTP code)
    if (url.pathname === '/api/user/2fa' && request.method === 'DELETE') {
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const { password, code } = parsedBody.value;
        if (!(await passwordCheckAllowed(env, userId)))
            return jsonError('RATE_LIMITED', 'Too many attempts. Please try again later.', 429, {
                'Retry-After': '60',
            });
        if (typeof password !== 'string' || typeof code !== 'string')
            return jsonError('INVALID_REQUEST', 'Missing password or code', 400);
        const userRow = (await env.DB.prepare('SELECT password_hash, totp_secret FROM users WHERE id = ?')
            .bind(userId)
            .first()) as any;
        if (!userRow) return jsonError('NOT_FOUND', 'User not found', 404);
        const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
        const passValid = await bcrypt.compare(password, userRow.password_hash ?? dummyHash);
        if (!passValid) return jsonError('INVALID_CREDENTIALS', 'Incorrect password', 401);
        if (!userRow.totp_secret) return jsonError('INVALID_REQUEST', '2FA is not enabled', 400);
        const totpValid = await consumeTOTP(env, userId, userRow.totp_secret, String(code));
        if (!totpValid) return jsonError('TWO_FACTOR_INVALID', 'Invalid 2FA code', 400);
        await env.DB.prepare('UPDATE users SET totp_secret = NULL WHERE id = ?').bind(userId).run();
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: '2FA disabled' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // GET /api/user/2fa/backup-codes — count of remaining unused codes
    if (url.pathname === '/api/user/2fa/backup-codes' && request.method === 'GET') {
        const row = (await env.DB.prepare(
            'SELECT COUNT(*) as cnt FROM backup_codes WHERE user_id = ? AND used_at IS NULL',
        )
            .bind(userId)
            .first()) as any;
        return withSecurityHeaders(
            new Response(JSON.stringify({ remaining: row?.cnt ?? 0 }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // POST /api/user/2fa/backup-codes/generate — regenerate backup codes
    if (url.pathname === '/api/user/2fa/backup-codes/generate' && request.method === 'POST') {
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const { password } = parsedBody.value;
        if (!(await passwordCheckAllowed(env, userId)))
            return jsonError('RATE_LIMITED', 'Too many attempts. Please try again later.', 429, {
                'Retry-After': '60',
            });
        if (typeof password !== 'string' || password.length === 0)
            return jsonError('INVALID_REQUEST', 'Current password is required', 400);
        const row = (await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first()) as any;
        const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
        if (!(await bcrypt.compare(password, row?.password_hash ?? dummyHash))) {
            return jsonError('INVALID_CREDENTIALS', 'Incorrect password', 401);
        }
        const stepUp = await checkStepUp(env, userId, jwtSecret, parsedBody.value as Record<string, unknown>);
        if (stepUp === 'required') {
            return jsonError('STEP_UP_REQUIRED', 'A current second factor is required', 403);
        }
        if (stepUp === 'invalid') {
            return jsonError('TWO_FACTOR_INVALID', 'Invalid second factor', 401);
        }
        const codes = await generateAndStoreBackupCodes(env, userId, jwtSecret);
        return withSecurityHeaders(
            new Response(JSON.stringify({ codes }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    return null;
}
