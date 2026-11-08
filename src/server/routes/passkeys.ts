import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

import { passwordCheckAllowed } from '../rateLimit';
import { readSmallJsonBody } from '../../../requestInput';
import { generateAndStoreBackupCodes } from '../totp';
import { checkStepUp } from '../stepUp';
import {
    allowedPasskeyOrigins,
    b64urlDecode,
    b64urlEncode,
    decodeCBOR,
    parseAuthData,
    resolvePasskeyOrigin,
} from '../webauthn';

import type { RequestContext } from '../../../worker';

export async function handlePasskeysRoute(
    ctx: RequestContext,
    userId: string,
    jwtSecret: string,
): Promise<Response | null> {
    const { request, env, url, corsHeaders, privateCacheHeaders, withSecurityHeaders, jsonError } = ctx;

    if (!(url.pathname.startsWith('/api/user/passkeys') || url.pathname.startsWith('/api/user/passkey'))) return null;

    // The block below is moved verbatim from worker.ts.
    // GET /api/user/passkeys — list user's registered passkeys
    if (url.pathname === '/api/user/passkeys' && request.method === 'GET') {
        const rows = await env.DB.prepare(
            'SELECT id, credential_id, device_name, created_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC',
        )
            .bind(userId)
            .all();
        return withSecurityHeaders(
            new Response(JSON.stringify(rows.results || []), {
                status: 200,
                headers: {
                    ...corsHeaders,
                    ...privateCacheHeaders,
                    'Content-Type': 'application/json',
                },
            }),
        );
    }

    // POST /api/user/passkey/register-options — generate registration challenge
    if (url.pathname === '/api/user/passkey/register-options' && request.method === 'POST') {
        const userRow = (await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first()) as any;
        const origin = resolvePasskeyOrigin(request, url, env);
        if (!origin) return jsonError('FORBIDDEN', 'Origin not allowed', 403);
        const rpId = (() => {
            try {
                return new URL(origin).hostname;
            } catch {
                return url.hostname;
            }
        })();
        const challenge = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
        const secret = new TextEncoder().encode(jwtSecret);
        const challengeToken = await new SignJWT({
            challenge,
            purpose: 'passkey-register',
            uid: userId,
            origin,
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('5m')
            .sign(secret);
        const userIdEncoded = b64urlEncode(new TextEncoder().encode(userId));
        const enrolled = await env.DB.prepare('SELECT credential_id FROM passkeys WHERE user_id = ?')
            .bind(userId)
            .all();
        return withSecurityHeaders(
            new Response(
                JSON.stringify({
                    challengeToken,
                    challenge,
                    rp: { id: rpId, name: 'HRT Tracker' },
                    user: {
                        id: userIdEncoded,
                        name: userRow?.username || userId,
                        displayName: userRow?.username || userId,
                    },
                    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                    timeout: 60000,
                    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
                    attestation: 'none',
                    excludeCredentialIds: (enrolled.results || []).map((r: any) => r.credential_id),
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            ),
        );
    }

    // POST /api/user/passkey/register — verify attestation and save passkey
    if (url.pathname === '/api/user/passkey/register' && request.method === 'POST') {
        const parsedRegBody = await readSmallJsonBody(request);
        if (!parsedRegBody.ok) {
            return parsedRegBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const { challengeToken, credential, deviceName, password: pkRegPassword } = parsedRegBody.value ?? {};
        if (!challengeToken || !credential?.response) {
            return jsonError('INVALID_REQUEST', 'Missing data', 400);
        }
        const secret = new TextEncoder().encode(jwtSecret);
        let challengePayload: any;
        try {
            const { payload } = await jwtVerify(challengeToken, secret, { algorithms: ['HS256'] });
            challengePayload = payload;
        } catch {
            return jsonError('INVALID_REQUEST', 'Invalid or expired challenge', 400);
        }
        if (challengePayload.purpose !== 'passkey-register' || challengePayload.uid !== userId) {
            return jsonError('INVALID_REQUEST', 'Invalid challenge', 400);
        }
        const expectedOrigin = challengePayload.origin as string;
        if (!allowedPasskeyOrigins(url, env).has(expectedOrigin)) {
            return jsonError('INVALID_REQUEST', 'Challenge origin not allowed', 400);
        }
        const expectedRpId = (() => {
            try {
                return new URL(expectedOrigin).hostname;
            } catch {
                return url.hostname;
            }
        })();

        const clientData = JSON.parse(new TextDecoder().decode(b64urlDecode(credential.response.clientDataJSON)));
        if (clientData.type !== 'webauthn.create') return jsonError('INVALID_REQUEST', 'Wrong type', 400);
        const receivedChallenge = clientData.challenge.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        if (receivedChallenge !== (challengePayload.challenge as string).replace(/=/g, '')) {
            return jsonError('INVALID_REQUEST', 'Challenge mismatch', 400);
        }
        if (clientData.origin !== expectedOrigin) return jsonError('INVALID_REQUEST', 'Origin mismatch', 400);

        const attObj = decodeCBOR(b64urlDecode(credential.response.attestationObject));
        const authData = attObj['authData'] as Uint8Array;
        const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expectedRpId)));
        const { rpIdHash, flags, signCount, credentialId, publicKeyX, publicKeyY } = parseAuthData(authData);
        if (!rpIdHash.every((v: number, i: number) => v === rpHash[i]))
            return jsonError('INVALID_REQUEST', 'RP ID mismatch', 400);
        if (!(flags & 1)) return jsonError('INVALID_REQUEST', 'User presence not set', 400);
        if (!credentialId || !publicKeyX || !publicKeyY)
            return jsonError('INVALID_REQUEST', 'No credential data in authData', 400);

        const credentialIdStr = b64urlEncode(credentialId);
        const existing = await env.DB.prepare('SELECT id FROM passkeys WHERE credential_id = ?')
            .bind(credentialIdStr)
            .first();
        if (existing) return jsonError('CONFLICT', 'Credential already registered', 409);

        if (!(await passwordCheckAllowed(env, userId)))
            return jsonError('RATE_LIMITED', 'Too many attempts. Please try again later.', 429, {
                'Retry-After': '60',
            });
        if (!pkRegPassword) return jsonError('INVALID_REQUEST', 'Current password is required', 400);
        const pkOwner = (await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
            .bind(userId)
            .first()) as any;
        const pkRegDummy = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
        if (!(await bcrypt.compare(pkRegPassword, pkOwner?.password_hash ?? pkRegDummy))) {
            return jsonError('INVALID_CREDENTIALS', 'Incorrect password', 401);
        }

        const stepUp = await checkStepUp(env, userId, jwtSecret, parsedRegBody.value as Record<string, unknown>);
        if (stepUp === 'required') {
            return jsonError('STEP_UP_REQUIRED', 'A current second factor is required', 403);
        }
        if (stepUp === 'invalid') {
            return jsonError('TWO_FACTOR_INVALID', 'Invalid second factor', 401);
        }

        const pkCountRow = (await env.DB.prepare('SELECT COUNT(*) as cnt FROM passkeys WHERE user_id = ?')
            .bind(userId)
            .first()) as any;
        const isFirstPasskey = (pkCountRow?.cnt ?? 0) === 0;

        const id = crypto.randomUUID();
        await env.DB.prepare(
            'INSERT INTO passkeys (id, user_id, credential_id, public_key_x, public_key_y, counter, device_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
            .bind(
                id,
                userId,
                credentialIdStr,
                b64urlEncode(publicKeyX),
                b64urlEncode(publicKeyY),
                signCount,
                deviceName || null,
            )
            .run();

        let backupCodes: string[] | undefined;
        if (isFirstPasskey) {
            const bcRow = (await env.DB.prepare('SELECT COUNT(*) as cnt FROM backup_codes WHERE user_id = ?')
                .bind(userId)
                .first()) as any;
            if ((bcRow?.cnt ?? 0) === 0) {
                backupCodes = await generateAndStoreBackupCodes(env, userId, jwtSecret);
            }
        }

        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Passkey registered', id, backupCodes }), {
                status: 201,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // DELETE /api/user/passkeys/:id — remove a passkey
    if (url.pathname.match(/^\/api\/user\/passkeys\/[^/]+$/) && request.method === 'DELETE') {
        const passkeyId = url.pathname.split('/').pop();
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const { password: pkPassword } = parsedBody.value;
        if (!(await passwordCheckAllowed(env, userId)))
            return jsonError('RATE_LIMITED', 'Too many attempts. Please try again later.', 429, {
                'Retry-After': '60',
            });
        if (typeof pkPassword !== 'string' || pkPassword.length === 0)
            return jsonError('INVALID_REQUEST', 'Current password is required', 400);
        const pkUser = (await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
            .bind(userId)
            .first()) as any;
        const pkDummy = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
        if (!(await bcrypt.compare(pkPassword, pkUser?.password_hash ?? pkDummy))) {
            return jsonError('INVALID_CREDENTIALS', 'Incorrect password', 401);
        }
        const stepUp = await checkStepUp(env, userId, jwtSecret, parsedBody.value as Record<string, unknown>);
        if (stepUp === 'required') {
            return jsonError('STEP_UP_REQUIRED', 'A current second factor is required', 403);
        }
        if (stepUp === 'invalid') {
            return jsonError('TWO_FACTOR_INVALID', 'Invalid second factor', 401);
        }
        await env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(passkeyId, userId).run();
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Passkey deleted' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    return null;
}
