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
        let { username, password } = body;
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

        const secret = new TextEncoder().encode(jwtSecret);
        const token = await new SignJWT({ sub: user.id, username: user.username, role: 'user' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
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

        // Content
        if (url.pathname.startsWith('/api/content')) {
          if (request.method === 'GET') {
            const content = await env.DB.prepare('SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
            return withSecurityHeaders(new Response(JSON.stringify(content.results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
          if (request.method === 'POST') {
            const { data } = await request.json() as any;
            const id = crypto.randomUUID();
            await env.DB.prepare('INSERT INTO content (id, user_id, data) VALUES (?, ?, ?)').bind(id, userId, JSON.stringify(data)).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Content saved', id }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
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
            const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first() as any;

            const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
            const passwordHash = user ? user.password_hash : dummyHash;
            const passwordValid = await bcrypt.compare(password, passwordHash);

            if (!user || !passwordValid) return withSecurityHeaders(new Response('Incorrect password', { status: 401, headers: corsHeaders }));

            await env.DB.batch([
              env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(userId),
              env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId)
            ]);
            try { await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${userId}`); } catch (e) { }
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
          if (url.pathname === '/api/admin/users' && request.method === 'GET') {
            const users = await env.DB.prepare('SELECT id, username FROM users ORDER BY username ASC').all();
            return withSecurityHeaders(new Response(JSON.stringify(users.results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
          if (url.pathname.match(/\/api\/admin\/users\/.+/) && request.method === 'DELETE') {
            const targetId = url.pathname.split('/').pop();
            await env.DB.batch([
              env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(targetId),
              env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId)
            ]);
            try { await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${targetId}`); } catch (e) { }
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'User deleted' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
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
