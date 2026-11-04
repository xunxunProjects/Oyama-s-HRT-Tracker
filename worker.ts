import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { MAX_CLOUD_BACKUP_BYTES } from './backupPolicy';
import { getContent, listContent, storeContent } from './contentStore';
import { addToolLoginFields, handleToolProtected } from './toolApi';
import { handleHrtWeb, hrtDeviceMatchesToken } from './hrtPairing';
import { handleF2fWeb, sweepF2fCohorts } from './f2f';
import {
    DosageShareSnapshot,
    isJsonObject,
    sanitizeEncryptedShareSnapshot,
    sanitizeShareSnapshot,
} from './shareSnapshotSchema';
import { passwordStrength } from './passwordStrength';
import { validateUsername, validatePassword, reservedForAdmin } from './src/server/validation';
import { getClientIP, MAX_JSON_BODY_BYTES, readSmallJsonBody } from './requestInput';
import { sha256Hex } from './workerUtil';
import { MAX_SHARE_EXPIRY_MS } from './shareExpiry';
import { sanitizeWrappedShareKey, sweepExpiredShares } from './src/server/shareHelpers';
import {
    MAX_ACTIVE_SHARES_PER_USER,
    MAX_EXPIRED_SHARE_TOMBSTONES_PER_USER,
    MAX_LIVE_UPDATES_PER_REQUEST,
    MAX_SHARE_EXPIRY_SECONDS,
    MAX_SHARE_REQUEST_BYTES,
    MAX_WRAPPED_SHARE_KEY_BYTES,
    shareOriginFor,
} from './src/server/shareConstants';
import { ensureCommunityVoteSchema, handleCommunityVoteMe, handleCommunityVoteSubmit } from './communityVoteServer';
import { logDeletion } from './src/server/userHelpers';
import { handlePublicRoutes } from './src/server/routes/public';
import { handleSessionsRoute } from './src/server/routes/sessions';
import { handleTwoFactorRoute } from './src/server/routes/twoFactor';
import { handlePasskeysRoute } from './src/server/routes/passkeys';
import { handleUserProfileRoute } from './src/server/routes/userProfile';
import { handleContentRoute } from './src/server/routes/content';
import { handleSharesRoute } from './src/server/routes/shares';
import { handleSharesAccessRoute } from './src/server/routes/sharesAccess';

import type { Env } from './src/server/env';
export type { Env } from './src/server/env';

// Rate limiting through the Workers Rate Limiting binding: enforced at the
// edge, in memory, with no storage behind it. This used to be a table in D1,
// which meant an INSERT ... ON CONFLICT on every login, every public
// /api/notice fetch and every backup write — writes being the one thing a
// single-primary D1 cannot scale — and it failed open on any database error,
// so the day the database was unhealthy was the day brute-force protection
// switched itself off.
//
// Every caller asks for some requests-per-minute ceiling; the binding whose
// class matches is used. A missing binding is a configuration hole, not a
// runtime condition, and it fails OPEN so a mis-deployed self-hosted instance
// still serves — it is logged once per isolate so it can't stay quiet.
import { checkRateLimit } from './src/server/rateLimit';
import {
    allowedPasskeyOrigins,
    b64urlEncode,
    resolvePasskeyOrigin,
    verifyPasskeyAssertion,
} from './src/server/webauthn';
import { consumeTOTP, hmacSha256Hex, verifyAndConsumeBackupCode } from './src/server/totp';

/**
 * Every endpoint that bcrypt-compares the account password shares one
 * per-user bucket, so a stolen session plus a guessed password cannot turn
 * 2FA/passkey/password endpoints into an unthrottled oracle.
 */
function withSecurityHeaders(response: Response): Response {
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('X-Content-Type-Options', 'nosniff');
    newResponse.headers.set('X-Frame-Options', 'DENY');
    // The SPA never needs to send a referrer to another origin, and an API
    // response must not hand one to a page that later navigates away.
    newResponse.headers.set('Referrer-Policy', 'no-referrer');
    // Isolate this window from any opener. The app is never opened as a popup,
    // and the desktop build embeds the same page.
    newResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    // Strict-Transport-Security is ignored by user agents on plain-http
    // responses (RFC 6797 §7.2), so an onion/I2P mirror that speaks http is
    // unaffected while any https deployment gets the pin. The deprecated
    // X-XSS-Protection header is gone: the filter it switched on could itself
    // be used as an oracle, and modern browsers ignore it.
    newResponse.headers.set('Strict-Transport-Security', 'max-age=31536000');
    newResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    newResponse.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self';",
    );
    return newResponse;
}

// --- Request context for extracted route modules ---
// Route modules under src/server/routes/* receive a RequestContext instead of
// reaching into the fetch closure. This keeps security-sensitive helpers
// (withSecurityHeaders, jsonError, ...) in one place.
export interface RequestContext {
    request: Request;
    env: Env;
    ctx: ExecutionContext;
    url: URL;
    jwtSecret: string;
    corsHeaders: Record<string, string>;
    privateCacheHeaders: Record<string, string>;
    withSecurityHeaders: (response: Response) => Response;
    jsonError: (code: string, message: string, status: number, extraHeaders?: Record<string, string>) => Response;
    shareJson: (body: unknown, status?: number, extraHeaders?: Record<string, string>) => Response;
    sessionInvalid: (message: string) => Response;
}

export function createRequestContext(
    request: Request,
    env: Env,
    execCtx: ExecutionContext,
    jwtSecret: string,
    corsHeaders: Record<string, string>,
    privateCacheHeaders: Record<string, string>,
    withSecurityHeadersFn: (response: Response) => Response,
    jsonErrorFn: (code: string, message: string, status: number, extraHeaders?: Record<string, string>) => Response,
    shareJsonFn: (body: unknown, status?: number, extraHeaders?: Record<string, string>) => Response,
    sessionInvalidFn: (message: string) => Response,
): RequestContext {
    return {
        request,
        env,
        ctx: execCtx,
        url: new URL(request.url),
        jwtSecret,
        corsHeaders,
        privateCacheHeaders,
        withSecurityHeaders: withSecurityHeadersFn,
        jsonError: jsonErrorFn,
        shareJson: shareJsonFn,
        sessionInvalid: sessionInvalidFn,
    };
}

/**
 * The origin a newly created share link should point at. The configured public
 * origin wins on clearnet, but on a mirror (.onion/.i2p) the request's own
 * origin is the address the reader can actually reach: a link minted with the
 * clearnet origin while browsing the mirror would send those readers back out
 * to another network, or nowhere at all.
 */
function timingSafeEqual(a: string, b: string): boolean {
    try {
        const enc = new TextEncoder();
        const aBytes = enc.encode(a);
        const bBytes = enc.encode(b);

        // Use a fixed length for comparison to avoid leaking actual length
        // We'll use 512 as a safe upper bound for these credentials
        const TARGET_LEN = 512;
        const aFixed = new Uint8Array(TARGET_LEN);
        const bFixed = new Uint8Array(TARGET_LEN);

        // Fill with data, but keep comparison length constant
        aFixed.set(aBytes.slice(0, TARGET_LEN));
        bFixed.set(bBytes.slice(0, TARGET_LEN));

        let result = 0;
        // Always compare TARGET_LEN bytes
        for (let i = 0; i < TARGET_LEN; i++) {
            result |= aFixed[i] ^ bFixed[i];
        }

        // Also include length comparison in the result to avoid length leaks
        // and ensuring we don't truncate valid but long matches
        return result === 0 && aBytes.length === bBytes.length && aBytes.length <= TARGET_LEN;
    } catch (e) {
        return false;
    }
}

/**
 * Every API error is `{ code, message }`. The message is for a human; the code
 * is for the client, which used to have nothing else to go on: a bare 500, a
 * 413 and a 429 all reached the user as "save failed", and the day the database
 * hit its size cap looked like one person's upload bug.
 */
export type ApiErrorCode =
    | 'INVALID_REQUEST'
    | 'NO_SNAPSHOT'
    | 'INVALID_CREDENTIALS'
    | 'TWO_FACTOR_REQUIRED'
    | 'TWO_FACTOR_INVALID'
    | 'SESSION_INVALID'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'TOO_LARGE'
    | 'UNSUPPORTED_MEDIA'
    | 'RATE_LIMITED'
    | 'ACCOUNT_LOCKED'
    | 'STORAGE_FULL'
    | 'SCHEMA_OUTDATED'
    | 'SERVICE_UNAVAILABLE'
    | 'NOT_IMPLEMENTED'
    | 'INTERNAL';

/** D1's wording when the database has hit its plan's size cap. */
const isStorageFullError = (err: unknown): boolean =>
    err instanceof Error && /Exceeded maximum DB size/i.test(err.message);

/** SQLite's wording when a table or column a query names is not there: the
 *  code is newer than the database, because a migration was never applied. */
const isSchemaOutdatedError = (err: unknown): boolean =>
    err instanceof Error && /no such (table|column)/i.test(err.message);

/** D1's wording when one string/BLOB/row exceeds its 2,000,000-byte limit. */
const isRowTooLargeError = (err: unknown): boolean =>
    err instanceof Error && /string or blob too big|SQLITE_TOOBIG/i.test(err.message);

// Dosage shares are deliberately minimal snapshots. Static shares are
// immutable; live shares may replace their payload when the owner syncs their
// current dosage data.
//
// New shares are end-to-end encrypted: the browser seals the snapshot with a
// key that exists only in the link's fragment, so this worker stores and
// returns ciphertext it cannot read. Shares made before that (`encrypted = 0`)
// still hold a plaintext snapshot, which the server rebuilds field by field
// instead of storing verbatim, so accidental account or profile fields can
// never be exposed by a public link. Those keep working until they expire.

/** Same envelope as an encrypted cloud backup: `{ cloud: 1, iv, data }`. */

const WEAK_SECRETS = new Set([
    'secret',
    'fallback-secret',
    'fallback_secret',
    'test-secret',
    'dev-secret',
    'default',
    'password',
    '123456',
    'changeme',
]);

function validateJWTSecret(secret: string | undefined): string {
    if (!secret) throw new Error('JWT_SECRET environment variable must be set.');
    if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters long.');
    const lowerSecret = secret.toLowerCase();
    for (const weak of WEAK_SECRETS) {
        if (lowerSecret.includes(weak)) throw new Error(`JWT_SECRET contains weak pattern "${weak}".`);
    }
    // A 64-character run of one character clears the length check but has
    // almost no entropy. Require a minimal alphabet; generated secrets use
    // far more.
    if (new Set(secret).size < 8) {
        throw new Error('JWT_SECRET must use at least 8 distinct characters.');
    }
    return secret;
}

// Names the app itself answers to, or that read as an authority ("admin",
// "support"), so a normal account should never own them. Compared
// case-insensitively: 'Admin' is the env-managed account's display name and
// the avatar route special-cases it, and 'ADMIN' would be just as confusing.

let cachedJWTSecret: string | null = null;
function getValidatedJWTSecret(env: Env): string {
    if (cachedJWTSecret === null) cachedJWTSecret = validateJWTSecret(env.JWT_SECRET);
    return cachedJWTSecret;
}

// Lazily ensure the transparency deletion_log table exists.
// This lets the feature deploy without requiring a manual migration on
// existing databases. Cached per worker instance.

// Schema lives in migrations/ and nowhere else. The worker used to carry a
// CREATE TABLE IF NOT EXISTS / ALTER TABLE mirror of it that ran lazily on
// every cold isolate, which left three sources of truth that had already
// drifted from one another (rate_limits and users.totp_last_step existed only
// here). `wrangler d1 migrations apply` is now the one thing that touches DDL;
// the Docker entrypoint runs it on start.

// --- Sessions ---
// Revoke sessions left idle beyond this window (seconds). Shorter than the
// 7-day JWT lifetime so inactivity caps how long a stolen token survives.
const SESSION_IDLE_TIMEOUT_SECONDS = 3 * 24 * 60 * 60; // 3 days
/** Lifetime of the JWTs minted below (`setExpirationTime('7d')`), in seconds. */
const SESSION_JWT_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

/**
 * SQL for "this session can still be presented": its token has not expired
 * and it has not gone idle. A row that fails either is dead whether or not a
 * request has come along to notice — the middleware only deletes a session
 * when its own token shows up, so a token that simply expires leaves its row
 * behind. The Sessions page used to list those as devices still signed in,
 * and the admin "sessions revoked" count included them. The cron below sweeps
 * them; this predicate keeps the reads honest in between.
 */
const LIVE_SESSION_SQL = `created_at > ?1 - ${SESSION_JWT_LIFETIME_SECONDS} AND last_used_at > ?1 - ${SESSION_IDLE_TIMEOUT_SECONDS}`;

// --- Site notice ---
// One row, id 1: there is only ever one banner. Taking a notice down blanks the
// body rather than dropping the row, which keeps `revision` monotonic for the
// life of the table — clients remember the revision they dismissed, and a
// counter that restarted at 1 would let a fresh notice inherit an old dismissal.

// Locales the app ships (src/i18n/translations.ts). A per-language override for
// anything else is dropped on write, so the column never accumulates keys no
// client will ever read.
const NOTICE_LANGS = ['zh', 'zh-TW', 'yue', 'en', 'ja', 'ko', 'tr'] as const;
const MAX_NOTICE_BODY = 2000;

import { NOTICE_COLUMNS, type SiteNoticeRow, serializeNotice } from './src/server/notice';

// --- Dosage share snapshots ---

/**
 * Discard the payload of every share that has passed its expiry, for all users.
 *
 * Setting an expiry on a share link is a promise that the data stops existing
 * then, not merely that it stops being served. Two scrubs already existed but
 * both needed someone to show up: the read path only fires if the expired link
 * is visited again, and the create path is scoped `WHERE user_id = ?` so it only
 * cleans the author's own shares. A link that expires and is then never touched
 * — by anyone, including its owner — kept its dose snapshot and password hash
 * indefinitely. This one is keyed on nothing but the clock.
 *
 * The `expires_at` index makes the scan cheap, and the guard on the last clause
 * means rows already scrubbed are not rewritten, so repeat runs are free.
 * Tombstones are deliberately left in place: a visitor to an expired link should
 * get "expired", not "never existed". Trimming those stays per-user on create.
 */

/**
 * A signed note that this browser already gave the right password for one
 * share. A live page polls every 10 s; with the pass it skips the bcrypt check
 * and the guessing lock, so someone sending wrong passwords cannot shut out
 * people who are already reading. It is bound to the share's current password
 * hash, so a new password or a revoked share ends it, and its `purpose` keeps
 * the session check from ever taking it for a sign-in.
 */
/**
 * A signed note that this browser has signed in to one account before. The
 * persistent sign-in lock exists to stop password guessing, and anyone who
 * knows a username can trip it; a device that has already proven the
 * password carries this pass and is not held back, so the lock cannot be used
 * to keep the owner out. `pw` is keyed on the account's current password
 * (an HMAC under the JWT secret, so the pass reveals nothing about it), so a
 * password change ends every pass, and `purpose` keeps the session check from
 * taking it for a sign-in.
 */
const LOGIN_DEVICE_PASS_TTL = '90d';

const loginDeviceBinding = (jwtSecret: string, credential: string) =>
    hmacSha256Hex(jwtSecret, `login-device:${credential}`).then(hex => hex.slice(0, 32));

async function signLoginDevicePass(jwtSecret: string, account: string, credential: string): Promise<string> {
    return new SignJWT({ purpose: 'login-device', account, pw: await loginDeviceBinding(jwtSecret, credential) })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(LOGIN_DEVICE_PASS_TTL)
        .sign(new TextEncoder().encode(jwtSecret));
}

/** True when `pass` was issued for `account` under one of its current credentials. */
async function loginDevicePassValid(
    pass: unknown,
    jwtSecret: string,
    account: string,
    credentials: string[],
): Promise<boolean> {
    if (typeof pass !== 'string' || pass.length === 0 || credentials.length === 0) return false;
    try {
        const { payload } = await jwtVerify(pass, new TextEncoder().encode(jwtSecret), {
            algorithms: ['HS256'],
        });
        if (payload.purpose !== 'login-device' || payload.account !== account) return false;
        for (const credential of credentials) {
            if (payload.pw === (await loginDeviceBinding(jwtSecret, credential))) return true;
        }
        return false;
    } catch {
        return false;
    }
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // 1. Static Assets (Non-API)
        if (!url.pathname.startsWith('/api/')) {
            // Attach security headers (incl. CSP) to the document/assets too — without
            // this the CSP only rode on API responses and never reached the HTML page.
            const assetResponse = await env.ASSETS.fetch(request);
            const securedAssetResponse = withSecurityHeaders(assetResponse);
            if (url.pathname === '/share' || url.pathname.startsWith('/share/')) {
                securedAssetResponse.headers.set('Referrer-Policy', 'no-referrer');
                securedAssetResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
            }
            return securedAssetResponse;
        }

        // 2. API Routes
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS, PATCH, PUT',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-Match, X-HRT-Base-Revision',
            // A VITE_API_ORIGIN build (the desktop app) calls cross-origin, where the
            // browser hides every response header outside the CORS-safe list unless
            // it is named here. The client reads Retry-After to back off, and
            // X-Session-Invalid to tell an expired session from a wrong password.
            'Access-Control-Expose-Headers': 'Retry-After, X-Session-Invalid',
        };

        // Private per-user responses must not be stored by a browser or an
        // intermediary cache: a shared cache must never replay one account's
        // session list, 2FA state, or passkeys to another.
        const privateCacheHeaders = {
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'Referrer-Policy': 'no-referrer',
        };

        const shareJson = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
            withSecurityHeaders(
                new Response(JSON.stringify(body), {
                    status,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                        Pragma: 'no-cache',
                        'Referrer-Policy': 'no-referrer',
                        'X-Robots-Tag': 'noindex, nofollow, noarchive',
                        ...extraHeaders,
                    },
                }),
            );

        const jsonError = (
            code: ApiErrorCode,
            message: string,
            status: number,
            extraHeaders: Record<string, string> = {},
        ) =>
            withSecurityHeaders(
                new Response(JSON.stringify({ code, message }), {
                    status,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                        ...extraHeaders,
                    },
                }),
            );

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Session-level 401s (missing/expired/revoked token) are tagged with a
        // header so the client can tell them apart from business-logic 401s such
        // as an incorrect password. The client only force-signs-out on tagged
        // responses, never on a wrong-password attempt.
        const sessionInvalid = (message: string) =>
            jsonError('SESSION_INVALID', message, 401, { 'X-Session-Invalid': '1' });

        try {
            // Validate JWT secret first — if misconfigured return 503 not 500
            let jwtSecret: string;
            try {
                jwtSecret = getValidatedJWTSecret(env);
            } catch (configErr: any) {
                console.error('Worker misconfiguration:', configErr);
                return jsonError('SERVICE_UNAVAILABLE', 'Service unavailable: server configuration error', 503);
            }

            // Rate limiting for auth/sensitive endpoints
            const sensitivePaths = [
                '/api/login',
                '/api/tool/v1/login',
                '/api/register',
                '/api/user/password',
                '/api/user/me',
            ];
            if (sensitivePaths.some(p => url.pathname === p)) {
                // The address comes from getClientIP (CF-Connecting-IP, or an
                // explicitly trusted proxy header). X-Forwarded-For is never
                // trusted implicitly: behind the Cloudflare edge it is not
                // reached, and anywhere else it is attacker-controlled — one
                // header per request would buy a fresh bucket and the limiter
                // would stop existing.
                //
                // When there is no address at all (self-hosted mirrors behind
                // Tor/I2P with TRUSTED_IP_SOURCE=none), an address-keyed bucket
                // would be one shared bucket: ten of anyone's requests a minute
                // would lock everyone else out. Login keeps its per-account
                // bucket; the others get a shared ceiling sized so one user's
                // traffic cannot read as another's lockout.
                const clientIP = getClientIP(request, env);
                let allowed: boolean;
                if (clientIP) {
                    allowed = await checkRateLimit(env, clientIP, 10);
                } else if (url.pathname === '/api/login' || url.pathname === '/api/tool/v1/login') {
                    allowed = await checkRateLimit(env, 'login-global-noip', 60);
                } else if (url.pathname === '/api/register') {
                    allowed = await checkRateLimit(env, 'register-global-noip', 10);
                } else {
                    allowed = await checkRateLimit(env, 'sensitive-global-noip', 30);
                }
                if (!allowed) {
                    return jsonError('RATE_LIMITED', 'Too many requests. Please try again later.', 429, {
                        'Retry-After': '60',
                    });
                }
            }

            // -- Public API Routes --

            // Public API routes (extracted to src/server/routes/public.ts)
            const publicResponse = await handlePublicRoutes(
                createRequestContext(
                    request,
                    env,
                    ctx,
                    jwtSecret,
                    corsHeaders,
                    privateCacheHeaders,
                    withSecurityHeaders,
                    jsonError,
                    shareJson,
                    sessionInvalid,
                ),
            );
            if (publicResponse) return publicResponse;

            // Shares access (public, extracted)
            const sharesAccessResponse = await handleSharesAccessRoute(
                createRequestContext(
                    request,
                    env,
                    ctx,
                    jwtSecret,
                    corsHeaders,
                    privateCacheHeaders,
                    withSecurityHeaders,
                    jsonError,
                    shareJson,
                    sessionInvalid,
                ),
            );
            if (sharesAccessResponse) return sharesAccessResponse;

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
                if (Number(inserted.meta?.changes ?? 0) === 0)
                    return jsonError('CONFLICT', 'Username already taken', 409);

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
                const regDevicePass = await signLoginDevicePass(
                    jwtSecret,
                    username.toLowerCase(),
                    `user:${hashedPassword}`,
                );
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
                    return jsonError(
                        'RATE_LIMITED',
                        'Too many attempts for this account. Please try again later.',
                        429,
                        { 'Retry-After': '60' },
                    );
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
                const user = (await env.DB.prepare('SELECT * FROM users WHERE username = ?')
                    .bind(username)
                    .first()) as any;

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
                    if (backoff)
                        await env.DB.prepare('DELETE FROM login_backoff WHERE account = ?').bind(account).run();
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
                        const backupValid = await verifyAndConsumeBackupCode(
                            env,
                            user.id,
                            String(backup_code),
                            jwtSecret,
                        );
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
                            const backupValid = await verifyAndConsumeBackupCode(
                                env,
                                user.id,
                                String(backup_code),
                                jwtSecret,
                            );
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
                    await env.DB.prepare('UPDATE passkeys SET counter = ? WHERE id = ?')
                        .bind(newCounter, passkeyRow.id)
                        .run();
                } catch {
                    return jsonError('INVALID_CREDENTIALS', 'Passkey verification failed', 401);
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
                const passkeyDevicePass = await signLoginDevicePass(
                    jwtSecret,
                    passkeyAccount,
                    `user:${userRow.password_hash}`,
                );
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

            // -- Protected API Routes --
            const authHeader = request.headers.get('Authorization');
            if (!authHeader?.startsWith('Bearer ')) return sessionInvalid('Unauthorized');
            const token = authHeader.split(' ')[1];
            const secret = new TextEncoder().encode(jwtSecret);

            let payload: any = null;
            try {
                ({ payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] }));
            } catch {
                // jose throws TypeError for some malformed headers (for example
                // alg:none) and those errors used to escape this route's catch as
                // a 500. Any token that cannot be verified is simply unauthorized.
                return sessionInvalid('Invalid token');
            }
            if (payload === null) return sessionInvalid('Invalid token');

            try {
                // jwtVerify only proves "signed with JWT_SECRET" — it says nothing about
                // what the token is FOR, and this worker signs several kinds with that
                // one secret. The passkey challenge tokens minted by the *public*,
                // credential-free /api/auth/passkey-options carry {challenge, purpose,
                // origin} and nothing else, so without these checks they sailed through
                // here: `sub` was undefined and, with no `sid`, the revocation and idle
                // checks below were skipped wholesale. Reject anything that isn't a
                // session token before it can be treated as one.
                const purpose = (payload as any).purpose;
                const sessionId = (payload as any).sid as string | undefined;
                const tokenScope = (payload as any).scope as string | undefined;
                if (typeof payload.sub !== 'string' || !payload.sub || purpose !== undefined) {
                    return sessionInvalid('Invalid token');
                }
                // A scoped token (minted by the F2F CLI code exchange) must only
                // ever reach the namespace it was minted for.
                if (tokenScope !== undefined && tokenScope !== 'f2f') {
                    return sessionInvalid('Invalid token');
                }
                // Every session token minted by this worker carries a `sid` (login,
                // register and passkey-verify all insert a sessions row first); the
                // admin token is the one deliberate exception.
                if (payload.role !== 'admin' && !sessionId) {
                    return sessionInvalid('Invalid token');
                }
                const userId = payload.sub as string;

                // Session validation (only for user JWTs with a session ID)
                if (sessionId && payload.role !== 'admin') {
                    const session = (await env.DB.prepare(
                        'SELECT last_used_at FROM sessions WHERE id = ? AND user_id = ?',
                    )
                        .bind(sessionId, userId)
                        .first()) as any;
                    if (!session) {
                        return sessionInvalid('Session expired or revoked');
                    }
                    const nowTs = Math.floor(Date.now() / 1000);
                    const lastUsed = session.last_used_at ?? nowTs;
                    // Idle timeout: a session unused beyond the window is revoked, even
                    // though the JWT itself may still be within its 7-day lifetime. This
                    // shrinks the window a stolen token stays usable on a dormant account.
                    if (nowTs - lastUsed > SESSION_IDLE_TIMEOUT_SECONDS) {
                        ctx.waitUntil(env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run());
                        return sessionInvalid('Session expired due to inactivity');
                    }
                    // Lazy last_used_at update (only if >5 min stale)
                    if (nowTs - lastUsed > 300) {
                        ctx.waitUntil(
                            env.DB.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?')
                                .bind(nowTs, sessionId)
                                .run(),
                        );
                    }
                }

                if (tokenScope === 'f2f' && !url.pathname.startsWith('/api/f2f/')) {
                    return jsonError('FORBIDDEN', 'This token is limited to F2F operations', 403);
                }

                // --- community funding vote (same session auth) ---
                if (url.pathname === '/api/vote/me' && request.method === 'GET') {
                    if (!(await checkRateLimit(env, `vote:me:${userId}`, 60))) {
                        return jsonError('RATE_LIMITED', 'Too many requests. Please try again later.', 429, {
                            'Retry-After': '60',
                        });
                    }
                    const result = await handleCommunityVoteMe(env, userId);
                    return withSecurityHeaders(
                        new Response(JSON.stringify(result.body), {
                            status: result.status,
                            headers: {
                                ...corsHeaders,
                                'Content-Type': 'application/json',
                                'Cache-Control': 'no-store',
                            },
                        }),
                    );
                }
                if (url.pathname === '/api/vote' && request.method === 'POST') {
                    if (!(await checkRateLimit(env, `vote:submit:${userId}`, 10))) {
                        return jsonError('RATE_LIMITED', 'Too many requests. Please try again later.', 429, {
                            'Retry-After': '60',
                        });
                    }
                    const result = await handleCommunityVoteSubmit(request, env, userId);
                    return withSecurityHeaders(
                        new Response(JSON.stringify(result.body), {
                            status: result.status,
                            headers: {
                                ...corsHeaders,
                                'Content-Type': 'application/json',
                                'Cache-Control': 'no-store',
                            },
                        }),
                    );
                }

                // --- hrt pairing web UI (same session auth) ---
                if (url.pathname.startsWith('/api/hrt/')) {
                    const userRow = (await env.DB.prepare('SELECT id, username FROM users WHERE id = ?')
                        .bind(userId)
                        .first()) as { id: string; username: string } | null;
                    if (!userRow) return sessionInvalid('Account not found');
                    const hrtResponse = await handleHrtWeb(request, env, url, {
                        userId: String(userRow.id),
                        username: String(userRow.username),
                    });
                    if (hrtResponse) return withSecurityHeaders(hrtResponse);
                    return jsonError('NOT_FOUND', 'Not found', 404);
                }

                // --- F2F cohort registry (same session auth) ---
                if (url.pathname.startsWith('/api/f2f/')) {
                    const userRow = (await env.DB.prepare('SELECT id, username FROM users WHERE id = ?')
                        .bind(userId)
                        .first()) as { id: string; username: string } | null;
                    if (!userRow) return sessionInvalid('Account not found');
                    // A CLI token may use the registry but must not mint new
                    // registration codes; only a web session can do that.
                    if (tokenScope === 'f2f' && url.pathname === '/api/f2f/cli/codes') {
                        return jsonError('FORBIDDEN', 'This token cannot create registration codes', 403);
                    }
                    /* Key uploads and rotations are cheap to spam and touch the
                       database; reads can be polled. Both get a per-account
                       ceiling so one session cannot exhaust the shared worker. */
                    const f2fWrite =
                        request.method === 'POST' &&
                        (url.pathname === '/api/f2f/keys' ||
                            url.pathname === '/api/f2f/cli/codes' ||
                            url.pathname === '/api/f2f/keys/retire' ||
                            url.pathname === '/api/f2f/keys/revoke');
                    const f2fAllowed = await checkRateLimit(
                        env,
                        `f2f:${f2fWrite ? 'write' : 'read'}:${userId}`,
                        f2fWrite ? 10 : 60,
                    );
                    if (!f2fAllowed) {
                        return jsonError('RATE_LIMITED', 'Too many requests. Please try again later.', 429, {
                            'Retry-After': '60',
                        });
                    }
                    const f2fResponse = await handleF2fWeb(request, env, url, {
                        userId: String(userRow.id),
                        username: String(userRow.username),
                    });
                    if (f2fResponse) return withSecurityHeaders(f2fResponse);
                    return jsonError('NOT_FOUND', 'Not found', 404);
                }

                // --- Tool API (authenticated) ---
                // Auth, session revocation and the idle timeout above are the
                // same ones the website uses; the namespace only adds the
                // storage shapes the CLI speaks.
                if (url.pathname.startsWith('/api/tool/v1/')) {
                    if (!(await hrtDeviceMatchesToken(request, env, userId))) {
                        return sessionInvalid('Device revoked');
                    }
                    const toolResponse = await handleToolProtected(
                        request,
                        env,
                        {
                            userId,
                            sessionId: sessionId ?? null,
                            username: typeof payload.username === 'string' ? payload.username : '',
                            role: typeof payload.role === 'string' ? payload.role : 'user',
                        },
                        {
                            json: (body, status = 200, extraHeaders = {}) =>
                                withSecurityHeaders(
                                    new Response(JSON.stringify(body), {
                                        status,
                                        headers: {
                                            ...corsHeaders,
                                            'Content-Type': 'application/json',
                                            'Cache-Control': 'no-store',
                                            ...extraHeaders,
                                        },
                                    }),
                                ),
                            error: jsonError,
                            allowWrite: () => checkRateLimit(env, `content-write:${userId}`, 20),
                        },
                    );
                    if (toolResponse) return toolResponse;
                }

                // --- Dosage sharing (owner management) ---
                // Shares
                const sharesResponse = await handleSharesRoute(
                    createRequestContext(
                        request,
                        env,
                        ctx,
                        jwtSecret,
                        corsHeaders,
                        privateCacheHeaders,
                        withSecurityHeaders,
                        jsonError,
                        shareJson,
                        sessionInvalid,
                    ),
                    userId,
                    jwtSecret,
                );
                if (sharesResponse) return sharesResponse;

                // Content
                const contentResponse = await handleContentRoute(
                    createRequestContext(
                        request,
                        env,
                        ctx,
                        jwtSecret,
                        corsHeaders,
                        privateCacheHeaders,
                        withSecurityHeaders,
                        jsonError,
                        shareJson,
                        sessionInvalid,
                    ),
                    userId,
                );
                if (contentResponse) return contentResponse;

                // Profile / Password / Delete Me
                const userProfileResponse = await handleUserProfileRoute(
                    createRequestContext(
                        request,
                        env,
                        ctx,
                        jwtSecret,
                        corsHeaders,
                        privateCacheHeaders,
                        withSecurityHeaders,
                        jsonError,
                        shareJson,
                        sessionInvalid,
                    ),
                    userId,
                    sessionId ?? null,
                    jwtSecret,
                );
                if (userProfileResponse) return userProfileResponse;

                // Admin
                if (url.pathname.startsWith('/api/admin/')) {
                    if (payload.role !== 'admin') return jsonError('FORBIDDEN', 'Forbidden', 403);
                    // The user list reports each account's 2FA posture and the /2fa routes
                    // below read and clear it, so the column and table both have to exist
                    // before any of those queries name them. Cached per isolate.

                    // --- Site notice ---
                    // Reads back what is stored regardless of the schedule, so the editor
                    // shows a notice that is queued or already expired instead of the
                    // empty state the public endpoint reports for one.
                    if (url.pathname === '/api/admin/notice' && request.method === 'GET') {
                        const row = await env.DB.prepare(
                            `SELECT ${NOTICE_COLUMNS} FROM site_notice WHERE id = 1`,
                        ).first<SiteNoticeRow>();
                        const stored = row && row.body ? serializeNotice(row) : null;
                        return withSecurityHeaders(
                            new Response(JSON.stringify({ notice: stored }), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            }),
                        );
                    }

                    if (url.pathname === '/api/admin/notice' && request.method === 'PUT') {
                        const parsedBody = await readSmallJsonBody(request);
                        if (!parsedBody.ok) {
                            return parsedBody.tooLarge
                                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
                        }
                        const body = parsedBody.value as any;
                        if (!body || typeof body.body !== 'string') {
                            return jsonError('INVALID_REQUEST', 'Missing notice body', 400);
                        }
                        const text = body.body.trim();
                        if (!text) return jsonError('INVALID_REQUEST', 'Notice body cannot be empty', 400);
                        if (text.length > MAX_NOTICE_BODY) {
                            return jsonError(
                                'INVALID_REQUEST',
                                `Notice body exceeds ${MAX_NOTICE_BODY} characters`,
                                400,
                            );
                        }
                        const level = body.level === 'warn' ? 'warn' : 'info';

                        // Per-locale overrides. Unknown locales and blank strings are
                        // dropped rather than rejected: the editor sends a field for every
                        // language it offers, and an untouched box is not an error.
                        let i18nJson: string | null = null;
                        if (body.i18n != null) {
                            if (typeof body.i18n !== 'object' || Array.isArray(body.i18n)) {
                                return jsonError('INVALID_REQUEST', 'i18n must be an object', 400);
                            }
                            const cleaned: Record<string, string> = {};
                            for (const [lang, value] of Object.entries(body.i18n as Record<string, unknown>)) {
                                if (!(NOTICE_LANGS as readonly string[]).includes(lang)) continue;
                                if (typeof value !== 'string') continue;
                                const trimmed = value.trim();
                                if (!trimmed) continue;
                                if (trimmed.length > MAX_NOTICE_BODY) {
                                    return jsonError(
                                        'INVALID_REQUEST',
                                        `Notice body for ${lang} exceeds ${MAX_NOTICE_BODY} characters`,
                                        400,
                                    );
                                }
                                cleaned[lang] = trimmed;
                            }
                            if (Object.keys(cleaned).length > 0) i18nJson = JSON.stringify(cleaned);
                        }

                        // `undefined` distinguishes "not a timestamp" from the null that
                        // means "no bound", which is why this cannot just coerce to Number.
                        const parseTs = (value: unknown): number | null | undefined => {
                            if (value == null) return null;
                            const n = Number(value);
                            return Number.isFinite(n) ? Math.floor(n) : undefined;
                        };
                        const startsAt = parseTs(body.startsAt);
                        const expiresAt = parseTs(body.expiresAt);
                        if (startsAt === undefined || expiresAt === undefined) {
                            return jsonError(
                                'INVALID_REQUEST',
                                'startsAt and expiresAt must be unix timestamps or null',
                                400,
                            );
                        }
                        if (startsAt != null && expiresAt != null && expiresAt <= startsAt) {
                            return jsonError('INVALID_REQUEST', 'expiresAt must be after startsAt', 400);
                        }

                        // revision bumps on every save and never resets, because clients key
                        // their "dismissed" flag on it: correcting the wording should reach
                        // everyone who had already dismissed the previous revision.
                        const saved = await env.DB.prepare(
                            `INSERT INTO site_notice (id, body, body_i18n, level, starts_at, expires_at, revision, updated_at)
               VALUES (1, ?1, ?2, ?3, ?4, ?5, 1, unixepoch())
               ON CONFLICT(id) DO UPDATE SET
                 body = ?1, body_i18n = ?2, level = ?3, starts_at = ?4, expires_at = ?5,
                 revision = site_notice.revision + 1, updated_at = unixepoch()
               RETURNING ${NOTICE_COLUMNS}`,
                        )
                            .bind(text, i18nJson, level, startsAt, expiresAt)
                            .first<SiteNoticeRow>();

                        return withSecurityHeaders(
                            new Response(JSON.stringify({ notice: saved ? serializeNotice(saved) : null }), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            }),
                        );
                    }

                    // Take the banner down. Blanks the body instead of dropping the row so
                    // the revision counter keeps climbing — see the site_notice note above.
                    if (url.pathname === '/api/admin/notice' && request.method === 'DELETE') {
                        await env.DB.prepare(
                            `UPDATE site_notice SET body = '', body_i18n = NULL, starts_at = NULL, expires_at = NULL,
                 revision = revision + 1, updated_at = unixepoch() WHERE id = 1`,
                        ).run();
                        return withSecurityHeaders(
                            new Response(JSON.stringify({ message: 'Notice cleared' }), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            }),
                        );
                    }
                    // Search users (with backup stats, paginated)
                    if (url.pathname === '/api/admin/users' && request.method === 'GET') {
                        const query = url.searchParams.get('q')?.trim();
                        // parseInt('abc') is NaN and a huge digit string overflows
                        // D1's bind; both used to reach the database and 500.
                        const pageParam = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
                        const page =
                            Number.isSafeInteger(pageParam) && pageParam >= 1 ? Math.min(pageParam, 1_000_000) : 1;
                        const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '20', 10);
                        const limit = Number.isSafeInteger(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 20;
                        const offset = (page - 1) * limit;
                        const whereClause = query ? 'WHERE username LIKE ?' : '';
                        const filterArgs = query ? [`%${query}%`] : [];
                        const countResult = await env.DB.prepare(`SELECT COUNT(*) AS total FROM users ${whereClause}`)
                            .bind(...filterArgs)
                            .first<{ total: number }>();
                        const total = countResult?.total ?? 0;

                        // Pick the page of users first, then aggregate only for those ids.
                        // Joining `content` before the LIMIT made SQLite finish grouping
                        // every user before it could sort by username and cut the page,
                        // and SUM(LENGTH(data)) reads each body in full — so one page of
                        // twenty users read every backup in the database.
                        const pageRows = await env.DB.prepare(
                            `SELECT id, username, created_at,
              CASE WHEN totp_secret IS NOT NULL AND totp_secret != '' THEN 1 ELSE 0 END AS has_totp
              FROM users ${whereClause} ORDER BY username ASC LIMIT ? OFFSET ?`,
                        )
                            .bind(...filterArgs, limit, offset)
                            .all<{ id: string; username: string; created_at: number; has_totp: number }>();
                        const ids = pageRows.results.map(u => u.id);
                        const placeholders = ids.map(() => '?').join(',');
                        const [backupAgg, passkeyAgg] =
                            ids.length === 0
                                ? [[], []]
                                : await Promise.all([
                                      env.DB.prepare(
                                          `SELECT user_id, COUNT(*) AS backup_count, MAX(created_at) AS last_backup_at, SUM(LENGTH(data)) AS total_backup_size
                FROM content WHERE user_id IN (${placeholders}) GROUP BY user_id`,
                                      )
                                          .bind(...ids)
                                          .all<{
                                              user_id: string;
                                              backup_count: number;
                                              last_backup_at: number;
                                              total_backup_size: number;
                                          }>()
                                          .then(r => r.results),
                                      env.DB.prepare(
                                          `SELECT user_id, COUNT(*) AS passkey_count FROM passkeys WHERE user_id IN (${placeholders}) GROUP BY user_id`,
                                      )
                                          .bind(...ids)
                                          .all<{ user_id: string; passkey_count: number }>()
                                          .then(r => r.results),
                                  ]);
                        const backupsByUser = new Map(backupAgg.map(r => [r.user_id, r]));
                        const passkeysByUser = new Map(passkeyAgg.map(r => [r.user_id, r.passkey_count]));
                        const users = pageRows.results.map(u => {
                            const b = backupsByUser.get(u.id);
                            return {
                                ...u,
                                backup_count: b?.backup_count ?? 0,
                                last_backup_at: b?.last_backup_at ?? null,
                                total_backup_size: b?.total_backup_size ?? 0,
                                passkey_count: passkeysByUser.get(u.id) ?? 0,
                            };
                        });
                        return withSecurityHeaders(
                            new Response(JSON.stringify({ users, total, page, limit }), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            }),
                        );
                    }

                    // Storage: what the database is made of. The number that was never
                    // visible anywhere until the day it hit the plan's cap. On demand
                    // only — SUM(LENGTH()) over `content` reads every backup body.
                    if (url.pathname === '/api/admin/storage' && request.method === 'GET') {
                        const sizeOf = (table: string, column: string | null) =>
                            env.DB.prepare(
                                `SELECT COUNT(*) AS rows_, ${column ? `COALESCE(SUM(LENGTH(${column})), 0)` : '0'} AS payload_bytes FROM ${table}`,
                            ).first<{ rows_: number; payload_bytes: number }>();
                        const tables: [string, string | null][] = [
                            ['content', 'data'],
                            ['dosage_shares', 'snapshot_json'],
                            ['users', null],
                            ['sessions', null],
                            ['passkeys', null],
                            ['backup_codes', null],
                            ['deletion_log', null],
                        ];
                        const rows = await Promise.all(
                            tables.map(async ([table, column]) => {
                                const r = await sizeOf(table, column);
                                return { table, rows: r?.rows_ ?? 0, payload_bytes: r?.payload_bytes ?? 0 };
                            }),
                        );
                        return withSecurityHeaders(
                            new Response(
                                JSON.stringify({
                                    tables: rows,
                                    payload_bytes: rows.reduce((sum, r) => sum + r.payload_bytes, 0),
                                    measured_at: Math.floor(Date.now() / 1000),
                                }),
                                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
                            ),
                        );
                    }

                    // List user backups (metadata only)
                    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups$/) && request.method === 'GET') {
                        const targetId = url.pathname.split('/')[4];
                        const backups = await env.DB.prepare(
                            'SELECT id, created_at, LENGTH(data) AS data_size FROM content WHERE user_id = ? ORDER BY created_at DESC',
                        )
                            .bind(targetId)
                            .all();
                        return withSecurityHeaders(
                            new Response(JSON.stringify(backups.results), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            }),
                        );
                    }

                    // Delete a specific backup
                    if (
                        url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups\/[^/]+$/) &&
                        request.method === 'DELETE'
                    ) {
                        const parts = url.pathname.split('/');
                        const targetId = parts[4];
                        const backupId = parts[6];
                        await env.DB.prepare('DELETE FROM content WHERE id = ? AND user_id = ?')
                            .bind(backupId, targetId)
                            .run();
                        return withSecurityHeaders(
                            new Response(JSON.stringify({ message: 'Backup deleted' }), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            }),
                        );
                    }

                    // Purge all backups for a user
                    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups$/) && request.method === 'DELETE') {
                        const targetId = url.pathname.split('/')[4];
                        await env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(targetId).run();
                        return withSecurityHeaders(
                            new Response(JSON.stringify({ message: 'All backups purged' }), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            }),
                        );
                    }

                    // Admin change user password
                    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/password$/) && request.method === 'POST') {
                        const targetId = url.pathname.split('/')[4];
                        const parsedBody = await readSmallJsonBody(request);
                        if (!parsedBody.ok) {
                            return parsedBody.tooLarge
                                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
                        }
                        const body = parsedBody.value as any;
                        const { newPassword } = body;
                        if (!newPassword) return jsonError('INVALID_REQUEST', 'Missing new password', 400);
                        const passVal = validatePassword(newPassword);
                        if (!passVal.valid) return jsonError('INVALID_REQUEST', passVal.error!, 400);
                        const hashedPassword = await bcrypt.hash(newPassword, 10);
                        // An admin reset is the operator's answer to "someone is in my
                        // account", so it has to evict whoever currently holds a session on
                        // it. Without this the intruder's 7-day JWT kept passing the session
                        // lookup in the middleware, and every request it made refreshed
                        // last_used_at so the idle timeout never fired either — the one
                        // recovery path an operator has left the foothold in place. The
                        // self-service change already does this, and so does the 2FA reset
                        // below. Unqualified DELETE is right here: the caller is the admin,
                        // whose token carries no `sid` and skips the session lookup, so this
                        // cannot sign the operator out.
                        // Counted before the batch — D1 exposes no portable per-statement
                        // row count, and the admin UI reports what was removed.
                        const sessRow = await env.DB.prepare(
                            `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?2 AND ${LIVE_SESSION_SQL}`,
                        )
                            .bind(Math.floor(Date.now() / 1000), targetId)
                            .first<{ n: number }>();
                        // A reset is a full credential reset, not just a new
                        // password: an intruder who enrolled a passkey or fresh
                        // backup codes would otherwise survive it.
                        await env.DB.batch([
                            env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(
                                hashedPassword,
                                targetId,
                            ),
                            env.DB.prepare(
                                'UPDATE users SET totp_secret = NULL, totp_last_step = NULL WHERE id = ?',
                            ).bind(targetId),
                            env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId),
                            env.DB.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(targetId),
                            env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(targetId),
                        ]);
                        return withSecurityHeaders(
                            new Response(
                                JSON.stringify({
                                    message: 'Password updated',
                                    sessionsRevoked: sessRow?.n ?? 0,
                                    credentialsCleared: true,
                                }),
                                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
                            ),
                        );
                    }

                    // Admin reset username
                    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/username$/) && request.method === 'PATCH') {
                        const targetId = url.pathname.split('/')[4];
                        const parsedBody = await readSmallJsonBody(request);
                        if (!parsedBody.ok) {
                            return parsedBody.tooLarge
                                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
                        }
                        const body = parsedBody.value as any;
                        const { username } = body;
                        if (!username) return jsonError('INVALID_REQUEST', 'Missing username', 400);
                        const trimmed = username.trim();
                        if (!validateUsername(trimmed))
                            return jsonError('INVALID_REQUEST', 'Invalid username format', 400);
                        if (reservedForAdmin(env, trimmed)) return jsonError('CONFLICT', 'Username already taken', 409);
                        const renamed = await env.DB.prepare(
                            `UPDATE users SET username = ?
                             WHERE id = ?
                               AND NOT EXISTS (
                                   SELECT 1 FROM users WHERE lower(username) = lower(?) AND id != ?
                               )`,
                        )
                            .bind(trimmed, targetId, trimmed, targetId)
                            .run();
                        if (Number(renamed.meta?.changes ?? 0) === 0)
                            return jsonError('CONFLICT', 'Username already taken', 409);
                        return withSecurityHeaders(
                            new Response(JSON.stringify({ message: 'Username updated' }), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            }),
                        );
                    }

                    // Admin reset avatar
                    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/avatar$/) && request.method === 'DELETE') {
                        const targetId = url.pathname.split('/')[4];
                        try {
                            await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${targetId}`);
                        } catch (e) {}
                        return withSecurityHeaders(
                            new Response(JSON.stringify({ message: 'Avatar reset' }), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            }),
                        );
                    }

                    // Admin read a user's 2FA posture
                    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/2fa$/) && request.method === 'GET') {
                        const targetId = url.pathname.split('/')[4];
                        const target = (await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?')
                            .bind(targetId)
                            .first()) as any;
                        if (!target) return jsonError('NOT_FOUND', 'User not found', 404);
                        const pkRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?')
                            .bind(targetId)
                            .first<{ n: number }>();
                        const bcRow = await env.DB.prepare(
                            'SELECT COUNT(*) AS n FROM backup_codes WHERE user_id = ? AND used_at IS NULL',
                        )
                            .bind(targetId)
                            .first<{ n: number }>();
                        const passkeys = pkRow?.n ?? 0;
                        // Deliberately never returns totp_secret itself — an admin needs to
                        // know whether a factor exists, not to be handed the seed that
                        // would let them mint codes as the user.
                        return withSecurityHeaders(
                            new Response(
                                JSON.stringify({
                                    totp: !!target.totp_secret,
                                    passkeys,
                                    backupCodes: bcRow?.n ?? 0,
                                    enabled: !!target.totp_secret || passkeys > 0,
                                }),
                                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
                            ),
                        );
                    }

                    // Admin disable / erase a user's 2FA.
                    // This is the recovery path for someone who lost their authenticator:
                    // the self-service DELETE /api/user/2fa demands a code from the very
                    // device they no longer have, and DELETE /api/user/passkeys/:id needs
                    // a login they can't complete, so without an admin route the account
                    // is stranded behind a factor nobody can present. `scope` defaults to
                    // every factor; a narrower scope drops one without touching the rest.
                    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/2fa$/) && request.method === 'DELETE') {
                        const targetId = url.pathname.split('/')[4];
                        const parsedBody = await readSmallJsonBody(request);
                        if (!parsedBody.ok) {
                            return parsedBody.tooLarge
                                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
                        }
                        const { scope } = parsedBody.value as any;
                        const which = scope === undefined || scope === null ? 'all' : String(scope);
                        if (!['all', 'totp', 'passkeys', 'backup_codes'].includes(which)) {
                            return jsonError('INVALID_REQUEST', 'Invalid scope', 400);
                        }
                        const target = (await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?')
                            .bind(targetId)
                            .first()) as any;
                        if (!target) return jsonError('NOT_FOUND', 'User not found', 404);

                        const clearTotp = which === 'all' || which === 'totp';
                        const clearPasskeys = which === 'all' || which === 'passkeys';
                        const clearBackupCodes = which === 'all' || which === 'backup_codes';

                        // Stripping a factor weakens the account, so whoever currently holds
                        // a session on it loses that session too: otherwise an attacker who
                        // enrolled their own authenticator on a hijacked account keeps the
                        // foothold that this very reset exists to evict. Clearing spent
                        // backup codes alone is not a downgrade, so it leaves sessions be.
                        const revokeSessions = clearTotp || clearPasskeys;

                        // Counted before the batch — D1 exposes no portable per-statement
                        // row count, and the admin UI reports exactly what was removed.
                        const pkRow = clearPasskeys
                            ? await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?')
                                  .bind(targetId)
                                  .first<{ n: number }>()
                            : null;
                        const bcRow = clearBackupCodes
                            ? await env.DB.prepare('SELECT COUNT(*) AS n FROM backup_codes WHERE user_id = ?')
                                  .bind(targetId)
                                  .first<{ n: number }>()
                            : null;
                        const sessRow = revokeSessions
                            ? await env.DB.prepare(
                                  `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?2 AND ${LIVE_SESSION_SQL}`,
                              )
                                  .bind(Math.floor(Date.now() / 1000), targetId)
                                  .first<{ n: number }>()
                            : null;

                        const statements: D1PreparedStatement[] = [];
                        // totp_last_step goes with the secret: a stale high-water mark left
                        // behind would reject the opening codes of whatever secret the user
                        // enrols next, since consumeTOTP compares steps against it.
                        if (clearTotp)
                            statements.push(
                                env.DB.prepare(
                                    'UPDATE users SET totp_secret = NULL, totp_last_step = NULL WHERE id = ?',
                                ).bind(targetId),
                            );
                        if (clearPasskeys)
                            statements.push(env.DB.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(targetId));
                        if (clearBackupCodes)
                            statements.push(
                                env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(targetId),
                            );
                        if (revokeSessions)
                            statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId));
                        await env.DB.batch(statements);

                        return withSecurityHeaders(
                            new Response(
                                JSON.stringify({
                                    message: '2FA cleared',
                                    scope: which,
                                    cleared: {
                                        totp: clearTotp && !!target.totp_secret,
                                        passkeys: pkRow?.n ?? 0,
                                        backupCodes: bcRow?.n ?? 0,
                                        sessions: sessRow?.n ?? 0,
                                    },
                                }),
                                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
                            ),
                        );
                    }

                    // Delete user
                    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+$/) && request.method === 'DELETE') {
                        const targetId = url.pathname.split('/').pop();
                        if (targetId === 'admin') {
                            return jsonError('INVALID_REQUEST', 'Cannot delete admin account', 400);
                        }
                        const target = (await env.DB.prepare('SELECT created_at FROM users WHERE id = ?')
                            .bind(targetId)
                            .first()) as any;
                        const deletedAt = Math.floor(Date.now() / 1000);
                        await ensureCommunityVoteSchema(env);
                        await env.DB.batch([
                            env.DB.prepare('DELETE FROM dosage_shares WHERE user_id = ?').bind(targetId),
                            env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(targetId),
                            env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId),
                            env.DB.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(targetId),
                            env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(targetId),
                            env.DB.prepare('DELETE FROM f2f_cli_codes WHERE user_id = ?').bind(targetId),
                            env.DB.prepare('DELETE FROM community_vote_ballots WHERE user_id = ?').bind(targetId),
                            /* F2F seats are tombstones: never delete the row. */
                            env.DB.prepare(
                                "UPDATE f2f_keys SET status = 'revoked', public_key = '', revoked_at = ?, updated_at = ? WHERE user_id = ?",
                            ).bind(deletedAt, deletedAt, targetId),
                            env.DB.prepare(
                                "UPDATE f2f_seats SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE user_id = ?",
                            ).bind(deletedAt, deletedAt, targetId),
                            env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId),
                        ]);
                        try {
                            await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${targetId}`);
                        } catch (e) {}
                        if (target) await logDeletion(env, 'admin', target?.created_at ?? null);
                        return withSecurityHeaders(
                            new Response(JSON.stringify({ message: 'User deleted' }), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            }),
                        );
                    }
                }

                // --- Session Management ---
                const sessionsResponse = await handleSessionsRoute(
                    createRequestContext(
                        request,
                        env,
                        ctx,
                        jwtSecret,
                        corsHeaders,
                        privateCacheHeaders,
                        withSecurityHeaders,
                        jsonError,
                        shareJson,
                        sessionInvalid,
                    ),
                    userId,
                    sessionId ?? null,
                );
                if (sessionsResponse) return sessionsResponse;

                // --- Two-Factor Authentication (TOTP) ---
                const twoFactorResponse = await handleTwoFactorRoute(
                    createRequestContext(
                        request,
                        env,
                        ctx,
                        jwtSecret,
                        corsHeaders,
                        privateCacheHeaders,
                        withSecurityHeaders,
                        jsonError,
                        shareJson,
                        sessionInvalid,
                    ),
                    userId,
                    jwtSecret,
                );
                if (twoFactorResponse) return twoFactorResponse;

                // --- Passkeys (WebAuthn) ---
                const passkeysResponse = await handlePasskeysRoute(
                    createRequestContext(
                        request,
                        env,
                        ctx,
                        jwtSecret,
                        corsHeaders,
                        privateCacheHeaders,
                        withSecurityHeaders,
                        jsonError,
                        shareJson,
                        sessionInvalid,
                    ),
                    userId,
                    jwtSecret,
                );
                if (passkeysResponse) return passkeysResponse;

                return jsonError('NOT_FOUND', 'Not Found', 404);
            } catch (e: any) {
                if (
                    e.name === 'JWTExpired' ||
                    e.name === 'JWSSignatureVerificationFailed' ||
                    e.name === 'JWTInvalid' ||
                    e.name === 'JWSInvalid' ||
                    /* JSON.parse's "Unexpected token ..." must not be read as
                       an auth failure; narrow the legacy message heuristic. */
                    (e.name !== 'SyntaxError' && e.message?.includes('token'))
                ) {
                    return sessionInvalid('Invalid token');
                }
                throw e;
            }
        } catch (err: any) {
            console.error('API Error:', err);
            // The one infrastructure failure worth naming to the client: a database
            // at its size cap fails every insert that needs the file to grow, while
            // writes that fit into freed pages still succeed — so from the outside it
            // looks like a per-user bug unless the code says otherwise.
            if (isStorageFullError(err)) {
                return jsonError(
                    'STORAGE_FULL',
                    'The server is out of storage space. Your data is safe on this device.',
                    507,
                );
            }
            if (isRowTooLargeError(err)) {
                return jsonError('TOO_LARGE', 'Backup exceeds the database row limit', 413);
            }
            // A deploy that skipped `wrangler d1 migrations apply` fails every
            // query on the new tables with a bare 500. Say so, so the operator
            // knows what to run and the page can say "not set up yet".
            if (isSchemaOutdatedError(err)) {
                return jsonError(
                    'SCHEMA_OUTDATED',
                    'The server database is missing a migration. Run wrangler d1 migrations apply.',
                    503,
                );
            }
            // Sanitize internal error messages for production
            // `url` is reconstructed from the request's Host header, which the caller
            // sets. Gating error verbosity on it meant `Host: localhost` turned raw
            // exception text back on for anyone who asked. Deployment config decides.
            const isProd = (env.ENVIRONMENT ?? 'production') !== 'development';
            const message = isProd ? 'Internal Server Error' : err.message || 'Internal Server Error';
            return jsonError('INTERNAL', message, 500);
        }
    },

    /**
     * Housekeeping on a clock (wrangler.toml `[triggers]`). Everything here used
     * to piggyback on user requests — a 5% or 10% dice roll inside some handler
     * — which meant it ran only when traffic happened to land on that handler,
     * and did a write on somebody's read.
     */
    async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(
            (async () => {
                const now = Math.floor(Date.now() / 1000);
                // Sessions whose token has expired or that have gone idle. The request
                // middleware only removes a session when its own token is presented, so
                // the ones that are simply never used again would otherwise stay forever.
                try {
                    const res = await env.DB.prepare(`DELETE FROM sessions WHERE NOT (${LIVE_SESSION_SQL})`)
                        .bind(now)
                        .run();
                    if ((res.meta?.changes ?? 0) > 0) console.log(`Swept ${res.meta.changes} dead sessions`);
                } catch (e) {
                    console.error('Failed to sweep sessions:', e);
                }
                await sweepExpiredShares(env);
                try {
                    await sweepF2fCohorts(env);
                } catch (e) {
                    console.error('Failed to sweep F2F cohorts:', e);
                }
            })(),
        );
    },
};
