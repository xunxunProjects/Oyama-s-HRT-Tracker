import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  AVATAR_BUCKET: R2Bucket;
}

// Rate limiting map (in-memory, simple implementation)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const MAX_RATE_LIMIT_ENTRIES = 10000; // Prevent unbounded memory growth

function checkRateLimit(ip: string, maxRequests = 5, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  // Periodic cleanup if the map gets too large (triggered probabilistically to avoid DoS)
  if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES && Math.random() < 0.1) {
    let count = 0;
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
        count++;
      }
      if (count > 500) break; // Clean in small batches
    }
  }

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) return false;
  record.count++;
  return true;
}

function withSecurityHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('X-Content-Type-Options', 'nosniff');
  newResponse.headers.set('X-Frame-Options', 'DENY');
  newResponse.headers.set('X-XSS-Protection', '1; mode=block');
  newResponse.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;");
  return newResponse;
}

// Timing-safe string comparison
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
    return (result === 0) && (aBytes.length === bBytes.length) && (aBytes.length <= TARGET_LEN);
  } catch (e) {
    return false;
  }
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const WEAK_SECRETS = new Set([
  'secret', 'fallback-secret', 'fallback_secret', 'test-secret',
  'dev-secret', 'default', 'password', '123456', 'changeme',
]);

function validateJWTSecret(secret: string | undefined): string {
  if (!secret) throw new Error('JWT_SECRET environment variable must be set.');
  if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters long.');
  const lowerSecret = secret.toLowerCase();
  for (const weak of WEAK_SECRETS) {
    if (lowerSecret.includes(weak)) throw new Error(`JWT_SECRET contains weak pattern "${weak}".`);
  }
  return secret;
}

function validateUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < MIN_PASSWORD_LENGTH) return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` };
  if (password.length > MAX_PASSWORD_LENGTH) return { valid: false, error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters long` };
  return { valid: true };
}

let cachedJWTSecret: string | null = null;
function getValidatedJWTSecret(env: Env): string {
  if (cachedJWTSecret === null) cachedJWTSecret = validateJWTSecret(env.JWT_SECRET);
  return cachedJWTSecret;
}

// Lazily ensure the transparency deletion_log table exists.
// This lets the feature deploy without requiring a manual migration on
// existing databases. Cached per worker instance.
// --- TOTP Helpers (RFC 6238 / RFC 4226) ---
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/\s/g, '').replace(/=+$/, '');
  const bytes: number[] = [];
  let buf = 0, bitsLeft = 0;
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_CHARS.indexOf(clean[i]);
    if (val < 0) throw new Error(`Invalid base32 char: ${clean[i]}`);
    buf = (buf << 5) | val;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      bytes.push((buf >> bitsLeft) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function base32Encode(bytes: Uint8Array): string {
  let result = '';
  let buf = 0, bitsLeft = 0;
  for (const byte of bytes) {
    buf = (buf << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      bitsLeft -= 5;
      result += BASE32_CHARS[(buf >> bitsLeft) & 0x1f];
    }
  }
  if (bitsLeft > 0) result += BASE32_CHARS[(buf << (5 - bitsLeft)) & 0x1f];
  return result;
}

function generateTOTPSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

async function hotp(secret: string, counter: number): Promise<string> {
  const keyBytes = base32Decode(secret);
  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter % 0x100000000, false);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, counterBuf);
  const hmac = new Uint8Array(sig);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return (code % 1_000_000).toString().padStart(6, '0');
}

async function verifyTOTP(secret: string, token: string, windowSize = 1): Promise<boolean> {
  if (!/^\d{6}$/.test(token)) return false;
  const T = Math.floor(Date.now() / 1000 / 30);
  for (let i = -windowSize; i <= windowSize; i++) {
    if (await hotp(secret, T + i) === token) return true;
  }
  return false;
}

// --- Sessions table lazy creation ---
let sessionsEnsured = false;
async function ensureSessions(env: Env): Promise<void> {
  if (sessionsEnsured) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        last_used_at INTEGER DEFAULT (unixepoch()),
        device_info TEXT,
        ip TEXT
      )`
    ).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)').run();
    sessionsEnsured = true;
  } catch (e) {
    console.error('Failed to ensure sessions table:', e);
  }
}

// --- TOTP secret column lazy creation ---
let totpColumnEnsured = false;
async function ensureTotpColumn(env: Env): Promise<void> {
  if (totpColumnEnsured) return;
  try {
    await env.DB.prepare('ALTER TABLE users ADD COLUMN totp_secret TEXT').run();
  } catch (_) {
    // Column likely already exists
  }
  totpColumnEnsured = true;
}

let deletionLogEnsured = false;
async function ensureDeletionLog(env: Env): Promise<void> {
  if (deletionLogEnsured) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS deletion_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reason TEXT NOT NULL,
        user_created_at INTEGER,
        deleted_at INTEGER DEFAULT (unixepoch())
      )`
    ).run();
    // Best-effort indexes
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_deletion_log_deleted_at ON deletion_log(deleted_at)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_deletion_log_reason ON deletion_log(reason)').run();
    deletionLogEnsured = true;
  } catch (e) {
    console.error('Failed to ensure deletion_log table:', e);
  }
}

async function logDeletion(env: Env, reason: 'self' | 'admin', userCreatedAt: number | null): Promise<void> {
  try {
    await ensureDeletionLog(env);
    await env.DB.prepare('INSERT INTO deletion_log (reason, user_created_at) VALUES (?, ?)')
      .bind(reason, userCreatedAt).run();
  } catch (e) {
    console.error('Failed to log deletion:', e);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Static Assets (Non-API)
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    // 2. API Routes
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS, PATCH, PUT',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Validate JWT secret first — if misconfigured return 503 not 500
      let jwtSecret: string;
      try {
        jwtSecret = getValidatedJWTSecret(env);
      } catch (configErr: any) {
        console.error('Worker misconfiguration:', configErr);
        return withSecurityHeaders(new Response('Service unavailable: server configuration error', { status: 503, headers: corsHeaders }));
      }

      // Rate limiting for auth/sensitive endpoints
      const sensitivePaths = ['/api/login', '/api/register', '/api/user/password', '/api/user/me'];
      if (sensitivePaths.some(p => url.pathname === p)) {
        let clientIP = request.headers.get('CF-Connecting-IP') ||
          request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
          request.headers.get('X-Real-IP');

        if (!clientIP) return withSecurityHeaders(new Response('Unable to identify client IP', { status: 400, headers: corsHeaders }));
        if (!checkRateLimit(clientIP, 10, 60000)) { // Slightly relaxed but broader coverage
          return withSecurityHeaders(new Response('Too many requests. Please try again later.', { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } }));
        }
      }

      // -- Public API Routes --

      // Transparency: public aggregate stats. No PII exposed.
      if (url.pathname === '/api/transparency' && request.method === 'GET') {
        // Only trust CF-Connecting-IP on a public, unauthenticated endpoint.
        // X-Forwarded-For / X-Real-IP can be spoofed by clients and would
        // allow trivial rate-limit evasion.
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!checkRateLimit(`transparency:${clientIP}`, 30, 60000)) {
          return withSecurityHeaders(new Response('Too many requests. Please try again later.', {
            status: 429, headers: { ...corsHeaders, 'Retry-After': '60' }
          }));
        }

        await ensureDeletionLog(env);
        const now = Math.floor(Date.now() / 1000);
        const day = 86400;
        const HOUR = 3600;

        const [totalUsersRow, totalBackupsRow, newUsers7dRow, newUsers24hRow,
          adminDelRow, selfDelRow, adminDel7dRow, selfDel7dRow, recentRows] = await Promise.all([
            env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id != 'admin'").first<{ n: number }>(),
            env.DB.prepare('SELECT COUNT(*) AS n FROM content').first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id != 'admin' AND created_at >= ?").bind(now - 7 * day).first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id != 'admin' AND created_at >= ?").bind(now - day).first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'admin'").first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'self'").first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'admin' AND deleted_at >= ?").bind(now - 7 * day).first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'self' AND deleted_at >= ?").bind(now - 7 * day).first<{ n: number }>(),
            // Recent registrations — anonymized. We expose only a short
            // non-reversible prefix of the hex-only portion of the UUID plus
            // the creation timestamp. No username is ever returned.
            env.DB.prepare("SELECT id, created_at FROM users WHERE id != 'admin' ORDER BY created_at DESC LIMIT 10").all<{ id: string; created_at: number }>(),
          ]);

        const recent = (recentRows.results || []).map(r => ({
          // Only hex chars, first 4 — enough to visually distinguish entries
          // but too short to enable enumeration.
          anon_id: String(r.id).replace(/[^a-f0-9]/gi, '').slice(0, 4).toLowerCase().padEnd(4, '0'),
          // Round timestamp to the nearest hour. The UI only displays
          // coarse relative times ("X hours ago"), and rounding prevents
          // an attacker from correlating an exact registration moment
          // with an external signal to re-identify an anonymized entry.
          created_at: Math.floor((r.created_at ?? 0) / HOUR) * HOUR,
        }));

        const body = {
          total_users: totalUsersRow?.n ?? 0,
          total_backups: totalBackupsRow?.n ?? 0,
          new_users_24h: newUsers24hRow?.n ?? 0,
          new_users_7d: newUsers7dRow?.n ?? 0,
          admin_deleted_count: adminDelRow?.n ?? 0,
          self_deleted_count: selfDelRow?.n ?? 0,
          admin_deleted_7d: adminDel7dRow?.n ?? 0,
          self_deleted_7d: selfDel7dRow?.n ?? 0,
          recent_registrations: recent,
          server_time: now,
        };

        return withSecurityHeaders(new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=15',
          },
        }));
      }

      // Register
      if (url.pathname === '/api/register' && request.method === 'POST') {
        const body = await request.json() as any;
        let { username, password } = body;
        if (!username || !password) return withSecurityHeaders(new Response('Missing credentials', { status: 400, headers: corsHeaders }));

        username = username.trim();
        if (!validateUsername(username)) return withSecurityHeaders(new Response('Invalid username format', { status: 400, headers: corsHeaders }));
        const passVal = validatePassword(password);
        if (!passVal.valid) return withSecurityHeaders(new Response(passVal.error, { status: 400, headers: corsHeaders }));

        const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
        if (existing) return withSecurityHeaders(new Response('Username already taken', { status: 409, headers: corsHeaders }));

        const hashedPassword = await bcrypt.hash(password, 10);
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').bind(id, username, hashedPassword).run();

        return withSecurityHeaders(new Response(JSON.stringify({ message: 'User registered' }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
      }

      // Login
      if (url.pathname === '/api/login' && request.method === 'POST') {
        const body = await request.json() as any;
        let { username, password, totp_code } = body;
        if (!username || !password) return withSecurityHeaders(new Response('Missing credentials', { status: 400, headers: corsHeaders }));
        username = username.trim();

        // Admin login check
        // Guard against undefined/empty env vars allowing "null" or "undefined" login
        const adminU = env.ADMIN_USERNAME;
        const adminP = env.ADMIN_PASSWORD;

        if (adminU && adminP && adminU.length > 0 && adminP.length > 0 &&
          timingSafeEqual(username, adminU) && timingSafeEqual(password, adminP)) {
          const secret = new TextEncoder().encode(jwtSecret);
          const token = await new SignJWT({ sub: 'admin', username: 'Admin', role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1d').sign(secret);
          await env.DB.prepare("INSERT OR IGNORE INTO users (id, username, password_hash) VALUES ('admin', 'Admin', 'env_managed')").run();
          return withSecurityHeaders(new Response(JSON.stringify({ token, user: { id: 'admin', username: 'Admin', isAdmin: true } }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
        }

        // DB User check
        const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first() as any;

        // Anti-timing leak: Always run a bcrypt comparison even if user doesn't exist
        const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC'; // Randomized-looking dummy
        const passwordHash = user ? user.password_hash : dummyHash;
        const passwordValid = await bcrypt.compare(password, passwordHash);

        if (!user || !passwordValid) {
          return withSecurityHeaders(new Response('Invalid credentials', { status: 401, headers: corsHeaders }));
        }

        // 2FA check
        await ensureTotpColumn(env);
        const userWithTotp = await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?').bind(user.id).first() as any;
        if (userWithTotp?.totp_secret) {
          if (!totp_code) {
            return withSecurityHeaders(new Response(JSON.stringify({ needs2FA: true }), {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }));
          }
          const totpValid = await verifyTOTP(userWithTotp.totp_secret, String(totp_code));
          if (!totpValid) {
            return withSecurityHeaders(new Response('Invalid 2FA code', { status: 401, headers: corsHeaders }));
          }
        }

        // Create session
        await ensureSessions(env);
        const sessionId = crypto.randomUUID();
        const userAgent = (request.headers.get('User-Agent') || 'Unknown').slice(0, 500);
        const loginIP = request.headers.get('CF-Connecting-IP') ||
          request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
        ctx.waitUntil(
          env.DB.prepare('INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)')
            .bind(sessionId, user.id, userAgent, loginIP).run()
        );

        const secret = new TextEncoder().encode(jwtSecret);
        const token = await new SignJWT({ sub: user.id, username: user.username, role: 'user', sid: sessionId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
        return withSecurityHeaders(new Response(JSON.stringify({ token, user: { id: user.id, username: user.username, isAdmin: false } }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
      }

      // Avatar GET (Public)
      if (url.pathname.startsWith('/api/user/avatar/') && request.method === 'GET') {
        const username = url.pathname.split('/').pop();
        const genericNotFound = () => withSecurityHeaders(new Response('Not found', { status: 404, headers: corsHeaders }));

        try {
          const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first() as any;
          const userId = user ? user.id : (username === 'Admin' ? 'admin' : null);
          if (!userId) return genericNotFound();

          const object = await env.AVATAR_BUCKET.get(`hrt-tracker-user-avatar/${userId}`);
          if (!object) return genericNotFound();

          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set('Access-Control-Allow-Origin', '*');
          headers.set('Cache-Control', 'public, max-age=3600');
          return withSecurityHeaders(new Response(object.body, { headers }));
        } catch (e) {
          return genericNotFound();
        }
      }

      // -- Protected API Routes --
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return withSecurityHeaders(new Response('Unauthorized', { status: 401, headers: corsHeaders }));
      const token = authHeader.split(' ')[1];
      const secret = new TextEncoder().encode(jwtSecret);

      try {
        const { payload } = await jwtVerify(token, secret);
        const userId = payload.sub as string;
        const sessionId = (payload as any).sid as string | undefined;

        // Session validation (only for user JWTs with a session ID)
        if (sessionId && payload.role !== 'admin') {
          await ensureSessions(env);
          const session = await env.DB.prepare('SELECT last_used_at FROM sessions WHERE id = ? AND user_id = ?').bind(sessionId, userId).first() as any;
          if (!session) {
            return withSecurityHeaders(new Response('Session expired or revoked', { status: 401, headers: corsHeaders }));
          }
          // Lazy last_used_at update (only if >5 min stale)
          const nowTs = Math.floor(Date.now() / 1000);
          if (nowTs - (session.last_used_at ?? 0) > 300) {
            ctx.waitUntil(env.DB.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').bind(nowTs, sessionId).run());
          }
        }

        // Content
        if (url.pathname.startsWith('/api/content')) {
          if (url.pathname === '/api/content' && request.method === 'GET') {
            const metaOnly = url.searchParams.get('meta') === '1';
            if (metaOnly) {
              const content = await env.DB.prepare('SELECT id, created_at, LENGTH(data) AS data_size FROM content WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
              return withSecurityHeaders(new Response(JSON.stringify(content.results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
            }
            const content = await env.DB.prepare('SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
            return withSecurityHeaders(new Response(JSON.stringify(content.results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
          if (url.pathname === '/api/content' && request.method === 'POST') {
            const { data } = await request.json() as any;
            const id = crypto.randomUUID();
            await env.DB.prepare('INSERT INTO content (id, user_id, data) VALUES (?, ?, ?)').bind(id, userId, JSON.stringify(data)).run();
            // Auto-prune: keep only the latest 10 backups per user
            const MAX_BACKUPS = 10;
            const old = await env.DB.prepare(
              'SELECT id FROM content WHERE user_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?'
            ).bind(userId, MAX_BACKUPS).all();
            if (old.results.length > 0) {
              const ids = old.results.map((r: any) => r.id);
              await env.DB.prepare(
                `DELETE FROM content WHERE id IN (${ids.map(() => '?').join(',')})`
              ).bind(...ids).run();
            }
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Content saved', id }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
          // Delete a specific backup (user can only delete their own)
          if (url.pathname.match(/^\/api\/content\/[^/]+$/) && request.method === 'DELETE') {
            const backupId = url.pathname.split('/').pop();
            await env.DB.prepare('DELETE FROM content WHERE id = ? AND user_id = ?').bind(backupId, userId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Backup deleted' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
          // Load a specific backup by ID
          if (url.pathname.match(/^\/api\/content\/[^/]+$/) && request.method === 'GET') {
            const backupId = url.pathname.split('/').pop();
            const row = await env.DB.prepare('SELECT * FROM content WHERE id = ? AND user_id = ?').bind(backupId, userId).first();
            if (!row) return withSecurityHeaders(new Response('Not found', { status: 404, headers: corsHeaders }));
            return withSecurityHeaders(new Response(JSON.stringify(row), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
        }

        // Profile / Password / Delete Me
        if (url.pathname.startsWith('/api/user/')) {
          if (url.pathname === '/api/user/profile' && request.method === 'PATCH') {
            let { username } = await request.json() as any;
            username = username.trim();
            if (!validateUsername(username)) return withSecurityHeaders(new Response('Invalid username', { status: 400, headers: corsHeaders }));
            const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
            if (existing && (existing as any).id !== userId) return withSecurityHeaders(new Response('Username taken', { status: 409, headers: corsHeaders }));
            await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, userId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Profile updated', username }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          if (url.pathname === '/api/user/password' && request.method === 'POST') {
            const { currentPassword, newPassword } = await request.json() as any;
            const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first() as any;

            const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
            const passwordHash = user ? user.password_hash : dummyHash;
            const passwordValid = await bcrypt.compare(currentPassword, passwordHash);

            if (!user || !passwordValid) return withSecurityHeaders(new Response('Incorrect password', { status: 401, headers: corsHeaders }));

            const passVal = validatePassword(newPassword);
            if (!passVal.valid) return withSecurityHeaders(new Response(passVal.error, { status: 400, headers: corsHeaders }));
            const hashed = await bcrypt.hash(newPassword, 10);
            await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hashed, userId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Password updated' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          if (url.pathname === '/api/user/me' && request.method === 'DELETE') {
            const { password } = await request.json() as any;
            const user = await env.DB.prepare('SELECT password_hash, created_at FROM users WHERE id = ?').bind(userId).first() as any;

            const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
            const passwordHash = user ? user.password_hash : dummyHash;
            const passwordValid = await bcrypt.compare(password, passwordHash);

            if (!user || !passwordValid) return withSecurityHeaders(new Response('Incorrect password', { status: 401, headers: corsHeaders }));

            await env.DB.batch([
              env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(userId),
              env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
              env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId)
            ]);
            try { await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${userId}`); } catch (e) { }
            await logDeletion(env, 'self', user?.created_at ?? null);
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Account deleted' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
        }

        // Avatar PUT
        if (url.pathname === '/api/user/avatar' && request.method === 'PUT') {
          const body = await request.arrayBuffer();
          if (body.byteLength > 5 * 1024 * 1024) return withSecurityHeaders(new Response('File too large', { status: 413, headers: corsHeaders }));
          const view = new Uint8Array(body);
          let contentType = (view[0] === 0xFF && view[1] === 0xD8) ? 'image/jpeg' : (view[0] === 0x89 && view[1] === 0x50 ? 'image/png' : null);
          if (!contentType) return withSecurityHeaders(new Response('Invalid file type', { status: 415, headers: corsHeaders }));
          await env.AVATAR_BUCKET.put(`hrt-tracker-user-avatar/${userId}`, body, { httpMetadata: { contentType } });
          return withSecurityHeaders(new Response(JSON.stringify({ message: 'Avatar uploaded' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
        }

        // Admin
        if (url.pathname.startsWith('/api/admin/')) {
          if (payload.role !== 'admin') return withSecurityHeaders(new Response('Forbidden', { status: 403, headers: corsHeaders }));

          // Search users (with backup stats, paginated)
          if (url.pathname === '/api/admin/users' && request.method === 'GET') {
            const query = url.searchParams.get('q')?.trim();
            const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
            const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
            const offset = (page - 1) * limit;
            const whereClause = query ? 'WHERE u.username LIKE ?' : '';
            const countSql = `SELECT COUNT(DISTINCT u.id) AS total FROM users u ${query ? 'WHERE u.username LIKE ?' : ''}`;
            const countResult = query
              ? await env.DB.prepare(countSql).bind(`%${query}%`).first<{ total: number }>()
              : await env.DB.prepare(countSql).first<{ total: number }>();
            const total = countResult?.total ?? 0;
            const sql = `SELECT u.id, u.username, u.created_at,
              COUNT(c.id) AS backup_count,
              MAX(c.created_at) AS last_backup_at,
              COALESCE(SUM(LENGTH(c.data)), 0) AS total_backup_size
              FROM users u LEFT JOIN content c ON u.id = c.user_id
              ${whereClause}
              GROUP BY u.id ORDER BY u.username ASC LIMIT ? OFFSET ?`;
            const users = query
              ? await env.DB.prepare(sql).bind(`%${query}%`, limit, offset).all()
              : await env.DB.prepare(sql).bind(limit, offset).all();
            return withSecurityHeaders(new Response(JSON.stringify({ users: users.results, total, page, limit }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // List user backups (metadata only)
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups$/) && request.method === 'GET') {
            const targetId = url.pathname.split('/')[4];
            const backups = await env.DB.prepare('SELECT id, created_at, LENGTH(data) AS data_size FROM content WHERE user_id = ? ORDER BY created_at DESC').bind(targetId).all();
            return withSecurityHeaders(new Response(JSON.stringify(backups.results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Delete a specific backup
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups\/[^/]+$/) && request.method === 'DELETE') {
            const parts = url.pathname.split('/');
            const targetId = parts[4];
            const backupId = parts[6];
            await env.DB.prepare('DELETE FROM content WHERE id = ? AND user_id = ?').bind(backupId, targetId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Backup deleted' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Purge all backups for a user
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups$/) && request.method === 'DELETE') {
            const targetId = url.pathname.split('/')[4];
            await env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(targetId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'All backups purged' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Admin change user password
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/password$/) && request.method === 'POST') {
            const targetId = url.pathname.split('/')[4];
            const body = await request.json() as any;
            const { newPassword } = body;
            if (!newPassword) return withSecurityHeaders(new Response('Missing new password', { status: 400, headers: corsHeaders }));
            const passVal = validatePassword(newPassword);
            if (!passVal.valid) return withSecurityHeaders(new Response(passVal.error!, { status: 400, headers: corsHeaders }));
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hashedPassword, targetId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Password updated' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Admin reset username
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/username$/) && request.method === 'PATCH') {
            const targetId = url.pathname.split('/')[4];
            const body = await request.json() as any;
            const { username } = body;
            if (!username) return withSecurityHeaders(new Response('Missing username', { status: 400, headers: corsHeaders }));
            const trimmed = username.trim();
            if (!validateUsername(trimmed)) return withSecurityHeaders(new Response('Invalid username format', { status: 400, headers: corsHeaders }));
            const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(trimmed, targetId).first();
            if (existing) return withSecurityHeaders(new Response('Username already taken', { status: 409, headers: corsHeaders }));
            await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(trimmed, targetId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Username updated' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Admin reset avatar
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/avatar$/) && request.method === 'DELETE') {
            const targetId = url.pathname.split('/')[4];
            try { await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${targetId}`); } catch (e) { }
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Avatar reset' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Delete user
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+$/) && request.method === 'DELETE') {
            const targetId = url.pathname.split('/').pop();
            if (targetId === 'admin') {
              return withSecurityHeaders(new Response('Cannot delete admin account', { status: 400, headers: corsHeaders }));
            }
            const target = await env.DB.prepare('SELECT created_at FROM users WHERE id = ?').bind(targetId).first() as any;
            await env.DB.batch([
              env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(targetId),
              env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId)
            ]);
            try { await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${targetId}`); } catch (e) { }
            if (target) await logDeletion(env, 'admin', target?.created_at ?? null);
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'User deleted' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
        }

        // --- Session Management ---
        if (url.pathname.startsWith('/api/user/sessions')) {
          await ensureSessions(env);

          // GET /api/user/sessions — list all sessions for this user
          if (url.pathname === '/api/user/sessions' && request.method === 'GET') {
            const rows = await env.DB.prepare(
              'SELECT id, created_at, last_used_at, device_info, ip FROM sessions WHERE user_id = ? ORDER BY last_used_at DESC'
            ).bind(userId).all();
            const currentSid = sessionId ?? null;
            const sessions = (rows.results || []).map((s: any) => ({
              id: s.id,
              created_at: s.created_at,
              last_used_at: s.last_used_at,
              device_info: s.device_info,
              ip: s.ip,
              is_current: s.id === currentSid,
            }));
            return withSecurityHeaders(new Response(JSON.stringify(sessions), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // DELETE /api/user/sessions — terminate all other sessions (keep current)
          if (url.pathname === '/api/user/sessions' && request.method === 'DELETE') {
            if (sessionId) {
              await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(userId, sessionId).run();
            } else {
              await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
            }
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Other sessions terminated' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // DELETE /api/user/sessions/:id — terminate a specific session
          if (url.pathname.match(/^\/api\/user\/sessions\/[^/]+$/) && request.method === 'DELETE') {
            const targetSid = url.pathname.split('/').pop()!;
            await env.DB.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').bind(targetSid, userId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Session terminated' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
        }

        // --- Two-Factor Authentication (TOTP) ---
        if (url.pathname.startsWith('/api/user/2fa')) {
          await ensureTotpColumn(env);

          // GET /api/user/2fa/status
          if (url.pathname === '/api/user/2fa/status' && request.method === 'GET') {
            const row = await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?').bind(userId).first() as any;
            return withSecurityHeaders(new Response(JSON.stringify({ enabled: !!(row?.totp_secret) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // POST /api/user/2fa/setup — generate a new TOTP secret (not saved yet)
          if (url.pathname === '/api/user/2fa/setup' && request.method === 'POST') {
            const userRow = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first() as any;
            const username = userRow?.username ?? userId;
            const totpSecret = generateTOTPSecret();
            const issuer = 'HRT Tracker';
            const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${totpSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
            return withSecurityHeaders(new Response(JSON.stringify({ secret: totpSecret, uri }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // POST /api/user/2fa/enable — verify code and save secret to DB
          if (url.pathname === '/api/user/2fa/enable' && request.method === 'POST') {
            const { secret: totpSecret, code } = await request.json() as any;
            if (!totpSecret || !code) return withSecurityHeaders(new Response('Missing secret or code', { status: 400, headers: corsHeaders }));
            // Validate secret format (base32 chars, 16-32 chars)
            if (!/^[A-Z2-7]{16,64}$/i.test(totpSecret)) return withSecurityHeaders(new Response('Invalid secret format', { status: 400, headers: corsHeaders }));
            const valid = await verifyTOTP(totpSecret, String(code));
            if (!valid) return withSecurityHeaders(new Response('Invalid 2FA code', { status: 400, headers: corsHeaders }));
            await env.DB.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').bind(totpSecret, userId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: '2FA enabled' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // DELETE /api/user/2fa — disable 2FA (requires current password + TOTP code)
          if (url.pathname === '/api/user/2fa' && request.method === 'DELETE') {
            const { password, code } = await request.json() as any;
            if (!password || !code) return withSecurityHeaders(new Response('Missing password or code', { status: 400, headers: corsHeaders }));
            const userRow = await env.DB.prepare('SELECT password_hash, totp_secret FROM users WHERE id = ?').bind(userId).first() as any;
            if (!userRow) return withSecurityHeaders(new Response('User not found', { status: 404, headers: corsHeaders }));
            const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
            const passValid = await bcrypt.compare(password, userRow.password_hash ?? dummyHash);
            if (!passValid) return withSecurityHeaders(new Response('Incorrect password', { status: 401, headers: corsHeaders }));
            if (!userRow.totp_secret) return withSecurityHeaders(new Response('2FA is not enabled', { status: 400, headers: corsHeaders }));
            const totpValid = await verifyTOTP(userRow.totp_secret, String(code));
            if (!totpValid) return withSecurityHeaders(new Response('Invalid 2FA code', { status: 400, headers: corsHeaders }));
            await env.DB.prepare('UPDATE users SET totp_secret = NULL WHERE id = ?').bind(userId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: '2FA disabled' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
        }

        return withSecurityHeaders(new Response('Not Found', { status: 404, headers: corsHeaders }));

      } catch (e: any) {
        if (e.name === 'JWTTokenExpired' || e.name === 'JWSSignatureVerificationFailed' || e.message?.includes('token')) {
          return withSecurityHeaders(new Response('Invalid token', { status: 401, headers: corsHeaders }));
        }
        throw e;
      }

    } catch (err: any) {
      console.error('API Error:', err);
      // Sanitize internal error messages for production
      const isProd = url.hostname !== 'localhost' && !url.hostname.includes('127.0.0.1');
      const message = isProd ? 'Internal Server Error' : (err.message || 'Internal Server Error');
      return withSecurityHeaders(new Response(message, { status: 500, headers: corsHeaders }));
    }
  },
};
