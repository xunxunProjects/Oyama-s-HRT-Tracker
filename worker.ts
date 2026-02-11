
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

// --- TOTP Implementation (RFC 6238) ---

const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_ISSUER = 'HRT-Tracker';
const TOTP_WINDOW = 1; // Allow ±1 step for clock skew

function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanInput = input.replace(/[= ]/g, '').toUpperCase();
  let bits = '';
  for (const char of cleanInput) {
    const val = alphabet.indexOf(char);
    if (val === -1) throw new Error('Invalid base32 character');
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

function base32Encode(data: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of data) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += alphabet[parseInt(chunk, 2)];
  }
  return result;
}

async function generateTOTPCode(secret: Uint8Array, time: number): Promise<string> {
  const counter = Math.floor(time / TOTP_PERIOD);
  const counterBytes = new ArrayBuffer(8);
  const view = new DataView(counterBytes);
  view.setUint32(4, counter, false);

  const key = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes));
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);

  return (code % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

async function verifyTOTP(secret: string, code: string): Promise<boolean> {
  const secretBytes = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000);

  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const expected = await generateTOTPCode(secretBytes, now + i * TOTP_PERIOD);
    if (expected === code) return true;
  }
  return false;
}

function generateTOTPSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(bytes);
}

// Rate limiting map (in-memory, simple implementation)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const MAX_RATE_LIMIT_ENTRIES = 10000; // Prevent unbounded memory growth

function checkRateLimit(ip: string, maxRequests = 5, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    // Clean up expired entries periodically to prevent memory leak
    if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
      for (const [key, value] of rateLimitMap.entries()) {
        if (now > value.resetTime) {
          rateLimitMap.delete(key);
        }
      }
    }

    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

// Timing-safe string comparison
// Note: For true constant-time comparison in production, use crypto.subtle.timingSafeEqual
function timingSafeEqual(a: string, b: string): boolean {
  // Always use fixed length regardless of input to ensure truly constant time
  const aPadded = a.padEnd(TIMING_SAFE_COMPARE_LENGTH, '\0');
  const bPadded = b.padEnd(TIMING_SAFE_COMPARE_LENGTH, '\0');

  let result = 0;
  for (let i = 0; i < TIMING_SAFE_COMPARE_LENGTH; i++) {
    result |= aPadded.charCodeAt(i) ^ bPadded.charCodeAt(i);
  }
  return result === 0;
}

// Constants for validation
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const TIMING_SAFE_COMPARE_LENGTH = 512;

// Common weak secrets to reject (using Set for O(1) lookup)
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

// Validate JWT secret
function validateJWTSecret(secret: string | undefined): string {
  if (!secret) {
    throw new Error('JWT_SECRET environment variable must be set. Never deploy without a secure JWT secret.');
  }

  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long for adequate security.');
  }

  // Check against common weak secrets (case-insensitive)
  const lowerSecret = secret.toLowerCase();
  for (const weak of WEAK_SECRETS) {
    if (lowerSecret.includes(weak)) {
      throw new Error(`JWT_SECRET contains weak/common pattern "${weak}". Use a cryptographically random secret.`);
    }
  }

  return secret;
}

// Validate username for security
function validateUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

// Validate password strength
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { valid: false, error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters long` };
  }
  return { valid: true };
}

// Cache validated JWT secret to avoid re-validation on every request
let cachedJWTSecret: string | null = null;

function getValidatedJWTSecret(env: Env): string {
  if (cachedJWTSecret === null) {
    cachedJWTSecret = validateJWTSecret(env.JWT_SECRET);
  }
  return cachedJWTSecret;
}

// Merge two arrays by a unique ID field, keeping newer records by timestamp field.
// Tie-breaking: when timestamps are equal, local (second array) records take precedence.
// This same rule is applied in the client-side merge in src/services/cloud.ts.
function mergeById(cloudArr: any[], localArr: any[], idField: string, timestampField: string): any[] {
  const map = new Map<string, any>();

  for (const item of cloudArr) {
    if (item && item[idField]) {
      map.set(item[idField], item);
    }
  }

  for (const item of localArr) {
    if (!item || !item[idField]) continue;
    const existing = map.get(item[idField]);
    if (!existing) {
      map.set(item[idField], item);
    } else {
      // Keep the record with the newer timestamp
      const existingTime = existing[timestampField] || 0;
      const newTime = item[timestampField] || 0;
      if (newTime >= existingTime) {
        map.set(item[idField], item);
      }
    }
  }

  return Array.from(map.values());
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API Routes
    if (url.pathname.startsWith('/api/')) {
      // CORS headers
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      try {
        // Get validated JWT secret (cached after first validation)
        const jwtSecret = getValidatedJWTSecret(env);

        // Rate limiting for authentication endpoints
        if (url.pathname === '/api/login' || url.pathname === '/api/register') {
          // Get client IP - prefer CF-Connecting-IP as it cannot be spoofed
          let clientIP = request.headers.get('CF-Connecting-IP');

          // Fallback to X-Forwarded-For (parse first IP only, as it can be comma-separated)
          if (!clientIP) {
            const forwardedFor = request.headers.get('X-Forwarded-For');
            if (forwardedFor) {
              clientIP = forwardedFor.split(',')[0].trim();
            }
          }

          // Fallback to X-Real-IP
          if (!clientIP) {
            clientIP = request.headers.get('X-Real-IP');
          }

          // Reject requests without identifiable IP to prevent rate limit bypass
          if (!clientIP) {
            return new Response('Unable to identify client IP', {
              status: 400,
              headers: corsHeaders
            });
          }

          // Check rate limit
          if (!checkRateLimit(clientIP, 5, 60000)) {
            return new Response('Too many requests. Please try again later.', {
              status: 429,
              headers: { ...corsHeaders, 'Retry-After': '60' }
            });
          }
        }
        if (url.pathname === '/api/register' && request.method === 'POST') {
          // Validate Content-Type
          const contentType = request.headers.get('Content-Type');
          if (!contentType || !contentType.includes('application/json')) {
            return new Response('Content-Type must be application/json', { status: 400, headers: corsHeaders });
          }

          const body = await request.json() as any;
          let { username, password } = body;

          if (!username || !password) {
            return new Response('Missing username or password', { status: 400, headers: corsHeaders });
          }

          username = username.trim();

          // Validate username format
          if (!validateUsername(username)) {
            return new Response('Username must be 3-30 characters long and contain only letters, numbers, underscore, or hyphen', {
              status: 400,
              headers: corsHeaders
            });
          }

          // Validate password strength
          const passwordValidation = validatePassword(password);
          if (!passwordValidation.valid) {
            return new Response(passwordValidation.error || 'Invalid password', { status: 400, headers: corsHeaders });
          }

          // Check if user exists
          const existing = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
          if (existing) {
            return new Response('Username already taken', { status: 409, headers: corsHeaders });
          }

          const hashedPassword = await bcrypt.hash(password, 10);
          const id = crypto.randomUUID();

          await env.DB.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').bind(id, username, hashedPassword).run();

          return new Response(JSON.stringify({ message: 'User registered successfully' }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (url.pathname === '/api/login' && request.method === 'POST') {
          // Validate Content-Type
          const contentType = request.headers.get('Content-Type');
          if (!contentType || !contentType.includes('application/json')) {
            return new Response('Content-Type must be application/json', { status: 400, headers: corsHeaders });
          }

          const body = await request.json() as any;
          let { username, password, totpCode } = body;

          if (!username || !password) {
            return new Response('Missing credentials', { status: 400, headers: corsHeaders });
          }

          username = username.trim();

          // 1. Check Admin Credentials (Environment Variables) with timing-safe comparison
          // Note: Admin accounts use env-var credentials and don't support TOTP 2FA.
          // To protect admin access, use strong env-var passwords and restrict access at the infrastructure level.
          if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD &&
            timingSafeEqual(username, env.ADMIN_USERNAME) &&
            timingSafeEqual(password, env.ADMIN_PASSWORD)) {

            const secret = new TextEncoder().encode(jwtSecret);
            const token = await new SignJWT({ sub: 'admin', username: 'Admin', role: 'admin' })
              .setProtectedHeader({ alg: 'HS256' })
              .setIssuedAt()
              .setExpirationTime('1d')
              .sign(secret);

            return new Response(JSON.stringify({
              token,
              user: { id: 'admin', username: 'Admin', isAdmin: true, totpEnabled: false }
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // 2. Check Database Users
          const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first() as any;
          if (!user) {
            // Use generic error message to prevent username enumeration
            return new Response('Invalid credentials', { status: 401, headers: corsHeaders });
          }

          const match = await bcrypt.compare(password, user.password_hash);
          if (!match) {
            return new Response('Invalid credentials', { status: 401, headers: corsHeaders });
          }

          // 3. Check 2FA if enabled
          if (user.totp_enabled && user.totp_secret) {
            if (!totpCode) {
              // Signal that 2FA is required
              return new Response(JSON.stringify({ requires2FA: true }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            // Validate TOTP code format
            if (typeof totpCode !== 'string' || !/^\d{6}$/.test(totpCode)) {
              return new Response('Invalid 2FA code format', { status: 400, headers: corsHeaders });
            }

            const valid = await verifyTOTP(user.totp_secret, totpCode);
            if (!valid) {
              return new Response('Invalid 2FA code', { status: 401, headers: corsHeaders });
            }
          }

          // Generate JWT
          const secret = new TextEncoder().encode(jwtSecret);
          const token = await new SignJWT({ sub: user.id, username: user.username, role: 'user' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(secret);

          return new Response(JSON.stringify({
            token,
            user: { id: user.id, username: user.username, isAdmin: false, totpEnabled: !!user.totp_enabled }
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Protected Routes
        if (url.pathname.startsWith('/api/content') || url.pathname.startsWith('/api/totp/')) {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader?.startsWith('Bearer ')) {
            return new Response('Unauthorized', { status: 401, headers: corsHeaders });
          }

          const token = authHeader.split(' ')[1];
          const secret = new TextEncoder().encode(jwtSecret);

          // Verify JWT — only auth errors should return 401
          let payload: any;
          try {
            const result = await jwtVerify(token, secret);
            payload = result.payload;
          } catch (e) {
            return new Response('Invalid or expired token', { status: 401, headers: corsHeaders });
          }

          const userId = payload.sub as string;

          // --- TOTP Management Endpoints ---

          if (url.pathname === '/api/totp/setup' && request.method === 'POST') {
            const totpSecret = generateTOTPSecret();
            const otpauthUrl = `otpauth://totp/${TOTP_ISSUER}:${encodeURIComponent(payload.username as string)}?secret=${totpSecret}&issuer=${TOTP_ISSUER}&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;

            // Store the secret but don't enable yet (user must verify first)
            await env.DB.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').bind(totpSecret, userId).run();

            return new Response(JSON.stringify({ secret: totpSecret, otpauthUrl }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          if (url.pathname === '/api/totp/verify' && request.method === 'POST') {
            const contentType = request.headers.get('Content-Type');
            if (!contentType || !contentType.includes('application/json')) {
              return new Response('Content-Type must be application/json', { status: 400, headers: corsHeaders });
            }

            const body = await request.json() as any;
            const { code } = body;

            if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
              return new Response('Invalid code format', { status: 400, headers: corsHeaders });
            }

            const user = await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?').bind(userId).first() as any;
            if (!user?.totp_secret) {
              return new Response('TOTP not set up', { status: 400, headers: corsHeaders });
            }

            const valid = await verifyTOTP(user.totp_secret, code);
            if (!valid) {
              return new Response('Invalid code', { status: 401, headers: corsHeaders });
            }

            // Enable TOTP
            await env.DB.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').bind(userId).run();

            return new Response(JSON.stringify({ message: '2FA enabled successfully' }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          if (url.pathname === '/api/totp/disable' && request.method === 'POST') {
            const contentType = request.headers.get('Content-Type');
            if (!contentType || !contentType.includes('application/json')) {
              return new Response('Content-Type must be application/json', { status: 400, headers: corsHeaders });
            }

            const body = await request.json() as any;
            const { code } = body;

            if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
              return new Response('Invalid code format', { status: 400, headers: corsHeaders });
            }

            const user = await env.DB.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?').bind(userId).first() as any;
            if (!user?.totp_enabled || !user?.totp_secret) {
              return new Response('2FA is not enabled', { status: 400, headers: corsHeaders });
            }

            const valid = await verifyTOTP(user.totp_secret, code);
            if (!valid) {
              return new Response('Invalid code', { status: 401, headers: corsHeaders });
            }

            await env.DB.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?').bind(userId).run();

            return new Response(JSON.stringify({ message: '2FA disabled successfully' }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // --- Content Endpoints ---

          if (url.pathname === '/api/content' && request.method === 'GET') {
            const content = await env.DB.prepare('SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
            return new Response(JSON.stringify(content.results), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          if (url.pathname === '/api/content' && request.method === 'POST') {
            // Validate Content-Type
            const contentType = request.headers.get('Content-Type');
            if (!contentType || !contentType.includes('application/json')) {
              return new Response('Content-Type must be application/json', { status: 400, headers: corsHeaders });
            }

            const body = await request.json() as any;
            const { data, encrypted } = body;
            const id = crypto.randomUUID();
            await env.DB.prepare('INSERT INTO content (id, user_id, data, encrypted) VALUES (?, ?, ?, ?)').bind(id, userId, JSON.stringify(data), encrypted ? 1 : 0).run();
            return new Response(JSON.stringify({ message: 'Content saved', id }), {
              status: 201,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // --- Data Merge Endpoint ---
          // Merges local data with cloud data using union-by-ID strategy:
          // - Events and lab results are merged by ID (union)
          // - For duplicate IDs, the record with the newer timestamp is kept
          // - Weight uses the latest value
          // The client sends E2EE-encrypted data; the server stores it opaquely.
          if (url.pathname === '/api/content/merge' && request.method === 'POST') {
            const contentType = request.headers.get('Content-Type');
            if (!contentType || !contentType.includes('application/json')) {
              return new Response('Content-Type must be application/json', { status: 400, headers: corsHeaders });
            }

            const body = await request.json() as any;
            const { data, encrypted } = body;

            // Fetch the latest cloud backup for this user
            const existing = await env.DB.prepare(
              'SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
            ).bind(userId).first() as any;

            const id = crypto.randomUUID();

            if (!existing) {
              // No existing cloud data — just save directly
              await env.DB.prepare('INSERT INTO content (id, user_id, data, encrypted) VALUES (?, ?, ?, ?)')
                .bind(id, userId, JSON.stringify(data), encrypted ? 1 : 0).run();

              return new Response(JSON.stringify({
                message: 'Data saved (no prior backup to merge)',
                id,
                merged: false
              }), {
                status: 201,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            // If data is E2EE, server cannot merge — return both payloads for client-side merge
            if (encrypted || existing.encrypted) {
              return new Response(JSON.stringify({
                message: 'E2EE data requires client-side merge',
                cloudData: JSON.parse(existing.data),
                cloudCreatedAt: existing.created_at,
                requiresClientMerge: true
              }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            // Server-side merge for plaintext data
            let cloudData: any;
            try {
              cloudData = JSON.parse(existing.data);
            } catch {
              // Corrupted cloud data — overwrite with local
              await env.DB.prepare('INSERT INTO content (id, user_id, data, encrypted) VALUES (?, ?, ?, 0)')
                .bind(id, userId, JSON.stringify(data)).run();

              return new Response(JSON.stringify({
                message: 'Cloud data was corrupted; saved local data',
                id,
                merged: false
              }), {
                status: 201,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            const localData = data;

            // Merge events by ID (union, keep newer by timestamp)
            const mergedEvents = mergeById(
              cloudData.events || [],
              localData.events || [],
              'id',
              'timestamp'
            );

            // Merge lab results by ID
            const mergedLabResults = mergeById(
              cloudData.labResults || [],
              localData.labResults || [],
              'id',
              'timestamp'
            );

            // Merge dose templates by ID
            const mergedTemplates = mergeById(
              cloudData.doseTemplates || [],
              localData.doseTemplates || [],
              'id',
              'createdAt'
            );

            // Weight: use the latest export timestamp
            const localExportTime = localData.meta?.exportedAt ? new Date(localData.meta.exportedAt).getTime() : 0;
            const cloudExportTime = cloudData.meta?.exportedAt ? new Date(cloudData.meta.exportedAt).getTime() : 0;
            const mergedWeight = localExportTime >= cloudExportTime
              ? (localData.weight ?? cloudData.weight ?? 70)
              : (cloudData.weight ?? localData.weight ?? 70);

            const mergedData = {
              meta: { version: 1, exportedAt: new Date().toISOString(), merged: true },
              weight: mergedWeight,
              events: mergedEvents,
              labResults: mergedLabResults,
              doseTemplates: mergedTemplates
            };

            // Save merged result as new content entry
            await env.DB.prepare('INSERT INTO content (id, user_id, data, encrypted) VALUES (?, ?, ?, 0)')
              .bind(id, userId, JSON.stringify(mergedData)).run();

            return new Response(JSON.stringify({
              message: 'Data merged successfully',
              id,
              merged: true,
              data: mergedData
            }), {
              status: 201,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // Admin Routes
        if (url.pathname.startsWith('/api/admin/')) {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader?.startsWith('Bearer ')) {
            return new Response('Unauthorized', { status: 401, headers: corsHeaders });
          }

          const token = authHeader.split(' ')[1];
          const secret = new TextEncoder().encode(jwtSecret);

          // Verify JWT — only auth errors should return 401
          let payload: any;
          try {
            const result = await jwtVerify(token, secret);
            payload = result.payload;
          } catch (e) {
            return new Response('Invalid or expired token', { status: 401, headers: corsHeaders });
          }

          if (payload.role !== 'admin') {
            return new Response('Forbidden', { status: 403, headers: corsHeaders });
          }

          if (url.pathname === '/api/admin/users' && request.method === 'GET') {
            const users = await env.DB.prepare('SELECT id, username FROM users ORDER BY username ASC').all();
            return new Response(JSON.stringify(users.results), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          if (url.pathname.match(/\/api\/admin\/users\/.+/) && request.method === 'DELETE') {
            const userId = url.pathname.split('/').pop();
            if (!userId) {
              return new Response('Missing user ID', { status: 400, headers: corsHeaders });
            }

            await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
            // Also delete related content to keep DB clean
            await env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(userId).run();

            return new Response(JSON.stringify({ message: 'User deleted' }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        return new Response('Not Found', { status: 404, headers: corsHeaders });

      } catch (err: any) {
        return new Response(err.message || 'Internal Server Error', { status: 500, headers: corsHeaders });
      }
    }

    // Static Assets
    return env.ASSETS.fetch(request);
  },
};
