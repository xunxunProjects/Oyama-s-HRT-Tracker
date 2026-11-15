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
import { timingSafeEqual } from './src/server/security';
import { signLoginDevicePass, loginDevicePassValid } from './src/server/loginDevice';
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
import { handleAdminRoute } from './src/server/routes/admin';
import { handleUserProfileRoute } from './src/server/routes/userProfile';
import { handleContentRoute } from './src/server/routes/content';
import { handleSharesRoute } from './src/server/routes/shares';
import { handleAuthRoute } from './src/server/routes/auth';
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
    // Only this origin may frame the app: the developer simulator shows the
    // app inside its own device frame (`/?sim=touch`), and any other site is
    // still refused, so clickjacking stays out.
    newResponse.headers.set('X-Frame-Options', 'SAMEORIGIN');
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
    newResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
    newResponse.headers.set(
        'Content-Security-Policy',
        // font-src allows data: because Vite inlines the smallest KaTeX font
        // into the stylesheet. Scripts stay 'self' only: the bundle has no
        // inline or blob: scripts.
        "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self';",
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
    err instanceof Error &&
    (/Exceeded maximum DB size/i.test(err.message) || err.message.includes('STORAGE_BUDGET_EXCEEDED'));

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

import {
    MAX_NOTICE_BODY,
    NOTICE_COLUMNS,
    NOTICE_LANGS,
    type SiteNoticeRow,
    serializeNotice,
} from './src/server/notice';

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

            // Auth (register, login, passkey-options, passkey-verify)
            const authResponse = await handleAuthRoute(
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
                jwtSecret,
            );
            if (authResponse) return authResponse;

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

                // A pairing token is a tool credential, not a web session. It
                // must not reach account, sharing or HRT-management routes.
                if (payload.hrt === true && !url.pathname.startsWith('/api/tool/v1/')) {
                    return jsonError('FORBIDDEN', 'This token is limited to tool operations', 403);
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
                    if (!(await hrtDeviceMatchesToken(request, env, userId, payload))) {
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
                const adminResponse = await handleAdminRoute(
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
                    payload,
                );
                if (adminResponse) return adminResponse;

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
