import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

import { checkRateLimit, passwordCheckAllowed } from '../rateLimit';
import { validateUsername, validatePassword, reservedForAdmin } from '../validation';
import { consumeTOTP, verifyAndConsumeBackupCode, hmacSha256Hex } from '../totp';
import {
    allowedPasskeyOrigins,
    resolvePasskeyOrigin,
    b64urlDecode,
    b64urlEncode,
    decodeCBOR,
    parseAuthData,
    verifyPasskeyAssertion,
} from '../webauthn';
import { timingSafeEqual } from '../security';
import { isMemorialAccount, MEMORIAL_MESSAGE } from '../userHelpers';
import { signLoginDevicePass, loginDevicePassValid } from '../loginDevice';
import { addToolLoginFields, toolVersionBody } from '../../../toolApi';
import { handleHrtService } from '../../../hrtPairing';
import { handleF2fService } from '../../../f2f';
import { passwordStrength } from '../../../passwordStrength';
import { getClientIP, MAX_JSON_BODY_BYTES, readSmallJsonBody } from '../../../requestInput';
import { sha256Hex } from '../../../workerUtil';

import type { RequestContext } from '../../../worker';

export async function handleAuthRoute(ctx: RequestContext, jwtSecret: string): Promise<Response | null> {
    const { request, env, url, corsHeaders, withSecurityHeaders, jsonError } = ctx;

    // Register
    if (url.pathname === '/api/register' && request.method === 'POST') {
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const body = parsedBody.value;
        let { username, password } = body;
        if (!username || !password) return jsonError('INVALID_REQUEST', 'Missing credentials', 400);
        if (typeof username !== 'string') return jsonError('INVALID_REQUEST', 'Invalid username format', 400);

        username = username.trim();
        if (!validateUsername(username)) return jsonError('INVALID_REQUEST', 'Invalid username format', 400);
        if (reservedForAdmin(env, username)) return jsonError('CONFLICT', 'Username already taken', 409);
        const passVal = validatePassword(password);
        if (!passVal.valid) return jsonError('INVALID_REQUEST', passVal.error!, 400);

        // Case-insensitive: "Alice" and "alice" must not coexist as
        // separate accounts, or a share link or admin list cannot tell
        // them apart. The check lives in the INSERT so two concurrent
        // case-variant registrations cannot both pass a SELECT.
        const hashedPassword = await bcrypt.hash(password, 10);
        const id = crypto.randomUUID();
        const inserted = await env.DB.prepare(
            `INSERT INTO users (id, username, password_hash)
                     SELECT ?, ?, ?
                     WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(username) = lower(?))`,
        )
            .bind(id, username, hashedPassword, username)
            .run();
        if (Number(inserted.meta?.changes ?? 0) === 0) return jsonError('CONFLICT', 'Username already taken', 409);

        // Issue a session immediately so the user can complete mandatory 2FA setup
        const sessionId = crypto.randomUUID();
        const userAgent = (request.headers.get('User-Agent') || 'Unknown').slice(0, 500);
        const regIP = getClientIP(request, env) ?? 'unknown';
        await env.DB.prepare('INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)')
            .bind(sessionId, id, userAgent, regIP)
            .run();
        const regSecret = new TextEncoder().encode(jwtSecret);
        const regToken = await new SignJWT({ sub: id, username, role: 'user', sid: sessionId })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(regSecret);
        // A deleted account's misses would otherwise lock the new owner of the name.
        await env.DB.prepare('DELETE FROM login_backoff WHERE account = ?').bind(username.toLowerCase()).run();
        const regDevicePass = await signLoginDevicePass(jwtSecret, username.toLowerCase(), `user:${hashedPassword}`);
        return withSecurityHeaders(
            new Response(
                JSON.stringify({
                    token: regToken,
                    user: { id, username, isAdmin: false },
                    devicePass: regDevicePass,
                }),
                {
                    status: 201,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                    },
                },
            ),
        );
    }

    // Login
    const isToolLogin = url.pathname === '/api/tool/v1/login';
    if ((url.pathname === '/api/login' || isToolLogin) && request.method === 'POST') {
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const body = parsedBody.value;
        let { username, password, totp_code, backup_code } = body;
        if (!username || !password) return jsonError('INVALID_REQUEST', 'Missing credentials', 400);
        if (typeof username !== 'string' || typeof password !== 'string')
            return jsonError('INVALID_CREDENTIALS', 'Invalid credentials', 401);
        username = username.trim();

        // Per-account throttle, keyed on nothing the caller can rotate. The IP
        // bucket above is only as good as the IP header; this one bounds guessing
        // against a single account no matter how many identities the caller
        // presents, which is the case that matters on a self-hosted deployment
        // with no trusted edge in front of it. Covers the admin branch too.
        if (!(await checkRateLimit(env, `login-user:${username.toLowerCase()}`, 10))) {
            return jsonError('RATE_LIMITED', 'Too many attempts for this account. Please try again later.', 429, {
                'Retry-After': '60',
            });
        }

        // Admin login check
        // Guard against undefined/empty env vars allowing "null" or "undefined" login
        const adminU = env.ADMIN_USERNAME;
        const adminP = env.ADMIN_PASSWORD;
        const account = username.toLowerCase();
        // Case-insensitive: ADMIN_USERNAME may be configured as 'admin'
        // while the UI and DB display 'Admin', and a login that
        // type-checks as the same name must not be rejected on
        // capitalization alone.
        const isAdminName =
            !!adminU &&
            !!adminP &&
            adminU.length > 0 &&
            adminP.length > 0 &&
            timingSafeEqual(account, adminU.toLowerCase());

        // DB User check (looked up before the admin password so the lock
        // below knows whether the name is a real account)
        const user = (await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first()) as any;

        // Persistent backoff, keyed on the account name and kept in the
        // database, so neither a restart nor a different isolate resets
        // it: the fifth consecutive miss (wrong password or second
        // factor) locks the account for 15 min, each further miss doubles
        // that, capped at an hour. Checked before any bcrypt work. A
        // device that has signed in before carries a pass and is not
        // stopped, so whoever trips the lock cannot keep the owner out.
        // Only real accounts are counted; a name nobody owns never gets
        // a row (registration already says which names are taken).
        const nowSeconds = Math.floor(Date.now() / 1000);
        const backoff = await env.DB.prepare(
            'SELECT failed_attempts, locked_until FROM login_backoff WHERE account = ?',
        )
            .bind(account)
            .first<{ failed_attempts: number; locked_until: number | null }>();
        const credentials = [
            ...(isAdminName ? [`admin:${adminP}`] : []),
            ...(user ? [`user:${user.password_hash}`] : []),
        ];
        const trustedDevice = await loginDevicePassValid(body.device_pass, jwtSecret, account, credentials);
        if (!trustedDevice && backoff?.locked_until && backoff.locked_until > nowSeconds) {
            return jsonError(
                'ACCOUNT_LOCKED',
                'Too many failed sign-ins for this account. Please try again later.',
                429,
                { 'Retry-After': String(backoff.locked_until - nowSeconds) },
            );
        }
        // One statement, arithmetic in the storage engine, for the same
        // reason as the share lock: two concurrent misses must not read
        // the same count and lose one. Awaited so the 401 goes out with
        // the miss already counted.
        const recordMiss = async () => {
            if (!isAdminName && !user) return;
            await env.DB.prepare(
                `INSERT INTO login_backoff (account, failed_attempts, locked_until) VALUES (?, 1, NULL)
                         ON CONFLICT(account) DO UPDATE SET
                            failed_attempts = failed_attempts + 1,
                            locked_until = CASE
                                WHEN failed_attempts + 1 >= 5
                                THEN MAX(COALESCE(locked_until, 0), ? + MIN(900 * (1 << MIN(failed_attempts - 4, 2)), 3600))
                                ELSE locked_until
                            END`,
            )
                .bind(account, nowSeconds)
                .run();
        };
        const clearMisses = async () => {
            if (backoff) await env.DB.prepare('DELETE FROM login_backoff WHERE account = ?').bind(account).run();
        };

        if (isAdminName && timingSafeEqual(password, adminP!)) {
            const secret = new TextEncoder().encode(jwtSecret);
            const token = await new SignJWT({ sub: 'admin', username: 'Admin', role: 'admin' })
                .setProtectedHeader({ alg: 'HS256' })
                .setIssuedAt()
                .setExpirationTime('1d')
                .sign(secret);
            await env.DB.prepare(
                "INSERT OR IGNORE INTO users (id, username, password_hash) VALUES ('admin', 'Admin', 'env_managed')",
            ).run();
            await clearMisses();
            const adminDevicePass = await signLoginDevicePass(jwtSecret, account, `admin:${adminP}`);
            const adminBody = {
                token,
                user: { id: 'admin', username: 'Admin', isAdmin: true },
                devicePass: adminDevicePass,
            };
            return withSecurityHeaders(
                new Response(JSON.stringify(isToolLogin ? addToolLoginFields(adminBody) : adminBody), {
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                    },
                }),
            );
        }

        // Anti-timing leak: Always run a bcrypt comparison even if user doesn't exist
        const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC'; // Randomized-looking dummy
        const passwordHash = user ? user.password_hash : dummyHash;
        const passwordValid = await bcrypt.compare(password, passwordHash);

        if (!user || !passwordValid) {
            await recordMiss();
            return jsonError('INVALID_CREDENTIALS', 'Invalid credentials', 401);
        }

        // Told only to someone who knows the password, so the name alone
        // does not reveal that an account was kept as a memorial.
        if (await isMemorialAccount(env, user.id)) {
            await clearMisses();
            return jsonError('ACCOUNT_MEMORIAL', MEMORIAL_MESSAGE, 403);
        }

        // 2FA check
        const userWithTotp = (await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?')
            .bind(user.id)
            .first()) as any;
        if (userWithTotp?.totp_secret) {
            // TOTP is enabled — accept totp_code or backup_code
            if (!totp_code && !backup_code) {
                return withSecurityHeaders(
                    new Response(
                        JSON.stringify({
                            code: 'TWO_FACTOR_REQUIRED',
                            message: 'A second factor is required',
                            needs2FA: true,
                            method: 'totp',
                        }),
                        {
                            status: 401,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        },
                    ),
                );
            }
            if (backup_code) {
                const backupValid = await verifyAndConsumeBackupCode(env, user.id, String(backup_code), jwtSecret);
                if (!backupValid) {
                    await recordMiss();
                    return jsonError('TWO_FACTOR_INVALID', 'Invalid or already-used backup code', 401);
                }
            } else {
                const totpValid = await consumeTOTP(env, user.id, userWithTotp.totp_secret, String(totp_code));
                if (!totpValid) {
                    await recordMiss();
                    return jsonError('TWO_FACTOR_INVALID', 'Invalid 2FA code', 401);
                }
            }
        } else {
            // No TOTP: check if user has any passkeys registered
            const pkRow = (await env.DB.prepare('SELECT COUNT(*) as cnt FROM passkeys WHERE user_id = ?')
                .bind(user.id)
                .first()) as any;
            if ((pkRow?.cnt ?? 0) > 0) {
                // Passkey-only 2FA — accept backup_code as fallback
                if (backup_code) {
                    const backupValid = await verifyAndConsumeBackupCode(env, user.id, String(backup_code), jwtSecret);
                    if (!backupValid) {
                        await recordMiss();
                        return jsonError('TWO_FACTOR_INVALID', 'Invalid or already-used backup code', 401);
                    }
                } else {
                    return withSecurityHeaders(
                        new Response(
                            JSON.stringify({
                                code: 'TWO_FACTOR_REQUIRED',
                                message: 'A second factor is required',
                                needs2FA: true,
                                method: 'passkey',
                            }),
                            {
                                status: 401,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            },
                        ),
                    );
                }
            }
        }

        // Create session
        const sessionId = crypto.randomUUID();
        const userAgent = (request.headers.get('User-Agent') || 'Unknown').slice(0, 500);
        const loginIP = getClientIP(request, env) ?? 'unknown';
        await env.DB.prepare('INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)')
            .bind(sessionId, user.id, userAgent, loginIP)
            .run();

        const secret = new TextEncoder().encode(jwtSecret);
        const token = await new SignJWT({ sub: user.id, username: user.username, role: 'user', sid: sessionId })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(secret);
        await clearMisses();
        const loginResp: Record<string, any> = {
            token,
            user: { id: user.id, username: user.username, isAdmin: false },
            devicePass: await signLoginDevicePass(jwtSecret, account, `user:${user.password_hash}`),
            // The only moment the server sees the plaintext of an existing
            // password. Accounts made before the strength floor can still
            // have a weak one; the app asks them to change it.
            ...(passwordStrength(password) === 'weak' ? { passwordWeak: true } : {}),
        };
        return withSecurityHeaders(
            new Response(JSON.stringify(isToolLogin ? addToolLoginFields(loginResp) : loginResp), {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                },
            }),
        );
    }

    // POST /api/auth/passkey-options — generate WebAuthn auth challenge (public, no JWT)
    if (url.pathname === '/api/auth/passkey-options' && request.method === 'POST') {
        const clientIP = getClientIP(request, env);
        // Addressless deployments (TRUSTED_IP_SOURCE=none, Tor/I2P) get a
        // single generous bucket rather than one 'unknown' bucket that was
        // sized for a single client and served as a shared choke point.
        if (
            !(await checkRateLimit(
                env,
                clientIP ? `passkey-options:${clientIP}` : 'passkey-options:global-noip',
                clientIP ? 10 : 60,
            ))
        ) {
            return jsonError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': '60' });
        }
        const declaredLength = Number(request.headers.get('Content-Length'));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
            return jsonError('TOO_LARGE', 'Request body is too large', 413);
        }
        const origin = resolvePasskeyOrigin(request, url, env);
        if (!origin) return jsonError('FORBIDDEN', 'Origin not allowed', 403);
        const parsedOptionsBody = await readSmallJsonBody(request);
        if (!parsedOptionsBody.ok && parsedOptionsBody.tooLarge) {
            return jsonError('TOO_LARGE', 'Request body is too large', 413);
        }
        const { username } = (parsedOptionsBody.ok ? parsedOptionsBody.value : {}) as any;
        const challenge = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
        const secret = new TextEncoder().encode(jwtSecret);

        let credentialIds: string[] = [];
        if (username) {
            const userRow = (await env.DB.prepare('SELECT id FROM users WHERE username = ?')
                .bind(String(username).trim())
                .first()) as any;
            if (userRow) {
                const rows = await env.DB.prepare('SELECT credential_id FROM passkeys WHERE user_id = ?')
                    .bind(userRow.id)
                    .all();
                credentialIds = (rows.results || []).map((r: any) => r.credential_id);
            }
        }

        const challengeToken = await new SignJWT({ challenge, purpose: 'passkey-auth', origin })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('5m')
            .sign(secret);
        return withSecurityHeaders(
            new Response(JSON.stringify({ challengeToken, challenge, credentialIds }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // POST /api/auth/passkey-verify — verify WebAuthn assertion and issue session JWT (public)
    if (url.pathname === '/api/auth/passkey-verify' && request.method === 'POST') {
        const clientIP = getClientIP(request, env);
        if (
            !(await checkRateLimit(
                env,
                clientIP ? `passkey-verify:${clientIP}` : 'passkey-verify:global-noip',
                clientIP ? 10 : 60,
            ))
        ) {
            return jsonError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': '60' });
        }
        const declaredLength = Number(request.headers.get('Content-Length'));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
            return jsonError('TOO_LARGE', 'Request body is too large', 413);
        }
        const parsedVerifyBody = await readSmallJsonBody(request);
        if (!parsedVerifyBody.ok) {
            return parsedVerifyBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const { challengeToken, credential } = parsedVerifyBody.value ?? {};
        if (!challengeToken || !credential?.id || !credential?.response) {
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
        if (challengePayload.purpose !== 'passkey-auth') {
            return jsonError('INVALID_REQUEST', 'Invalid challenge purpose', 400);
        }

        const passkeyRow = (await env.DB.prepare('SELECT * FROM passkeys WHERE credential_id = ?')
            .bind(credential.id as string)
            .first()) as any;
        if (!passkeyRow) return jsonError('INVALID_CREDENTIALS', 'Passkey not found', 401);

        const userRow = (await env.DB.prepare('SELECT * FROM users WHERE id = ?')
            .bind(passkeyRow.user_id)
            .first()) as any;
        if (!userRow) return jsonError('INVALID_CREDENTIALS', 'User not found', 401);

        const expectedOrigin = challengePayload.origin as string;
        // The challenge must have been minted for an origin this
        // deployment serves; anything else is a pre-upgrade token or a
        // forged one and never reaches the assertion check.
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

        try {
            const newCounter = await verifyPasskeyAssertion(
                credential.response.clientDataJSON,
                credential.response.authenticatorData,
                credential.response.signature,
                passkeyRow.public_key_x,
                passkeyRow.public_key_y,
                passkeyRow.counter,
                expectedOrigin,
                expectedRpId,
                challengePayload.challenge as string,
            );
            await env.DB.prepare('UPDATE passkeys SET counter = ? WHERE id = ?').bind(newCounter, passkeyRow.id).run();
        } catch {
            return jsonError('INVALID_CREDENTIALS', 'Passkey verification failed', 401);
        }

        if (await isMemorialAccount(env, userRow.id)) {
            return jsonError('ACCOUNT_MEMORIAL', MEMORIAL_MESSAGE, 403);
        }

        const sessionId = crypto.randomUUID();
        const userAgent = (request.headers.get('User-Agent') || 'Unknown').slice(0, 500);
        const loginIP = clientIP ?? 'unknown';
        await env.DB.prepare('INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)')
            .bind(sessionId, userRow.id, userAgent, loginIP)
            .run();

        const jwtToken = await new SignJWT({
            sub: userRow.id,
            username: userRow.username,
            role: 'user',
            sid: sessionId,
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(secret);
        // A passkey proves the owner as well as a password does: clear the
        // account's failed sign-ins and mark this device as one it uses,
        // so a later password sign-in here is not held back by a lock.
        const passkeyAccount = String(userRow.username).toLowerCase();
        await env.DB.prepare('DELETE FROM login_backoff WHERE account = ?').bind(passkeyAccount).run();
        const passkeyDevicePass = await signLoginDevicePass(jwtSecret, passkeyAccount, `user:${userRow.password_hash}`);
        return withSecurityHeaders(
            new Response(
                JSON.stringify({
                    token: jwtToken,
                    user: { id: userRow.id, username: userRow.username, isAdmin: false },
                    devicePass: passkeyDevicePass,
                }),
                {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                },
            ),
        );
    }

    return null;
}
