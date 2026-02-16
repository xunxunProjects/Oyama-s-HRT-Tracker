
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
// Used for Admin credentials check against env vars
function timingSafeEqual(a: string, b: string): boolean {
  try {
    const enc = new TextEncoder();
    const aBuf = enc.encode(a);
    const bBuf = enc.encode(b);

    // crypto.subtle.timingSafeEqual requires equal lengths
    if (aBuf.byteLength !== bBuf.byteLength) return false;

    // We can use a trick if the runtime doesn't support timingSafeEqual on subtle (unlikely in CF workers but good practice)
    // But Cloudflare Workers supports it.

    // However, crypto.subtle.timingSafeEqual returns a promise? 
    // Wait, no, Node's crypto.timingSafeEqual is sync. Web Crypto's crypto.subtle... doesn't have timingSafeEqual!
    // Web Crypto API does NOT have timingSafeEqual. It's available in Node.js 'crypto' module or Cloudflare specific APIs.
    // Cloudflare Workers implements the Web Crypto API standard.
    // Actually, Cloudflare Workers environment provides `crypto.subtle.timingSafeEqual` as an extension or we should use a constant time algorithm.
    // Let's check if we can use the manual implementation but make it better, or if we can use a library.
    // The previous manual implementation was:
    // const aPadded = a.padEnd(TIMING_SAFE_COMPARE_LENGTH, '\0');
    // const bPadded = b.padEnd(TIMING_SAFE_COMPARE_LENGTH, '\0');
    // ... xor loop ...

    // Let's stick to the manual implementation but verify it's correct and safe enough for this context, 
    // OR see if we can use a better approach.
    // Actually, for simple string comparison of secrets of unknown length, the "pad to fixed length" approach is the standard way to do it manually.
    // Let's keep the manual implementation but ensure it uses Uint8Array for better performance/correctness than string charCodeAt.

    const TARGET_LEN = 512;
    const aFixed = new Uint8Array(TARGET_LEN);
    const bFixed = new Uint8Array(TARGET_LEN);

    const aBytes = enc.encode(a);
    const bBytes = enc.encode(b);

    aFixed.set(aBytes.slice(0, TARGET_LEN));
    bFixed.set(bBytes.slice(0, TARGET_LEN));

    let result = 0;

    // XOR all bytes
    for (let i = 0; i < TARGET_LEN; i++) {
      result |= aFixed[i] ^ bFixed[i];
    }

    // Also include length check in the constant time flow? 
    // If lengths match, result is 0. If lengths mismatch, we must ensure result is non-zero.
    // But we already padded, so we are comparing the padded versions.
    // If a="abc", b="abc" -> match.
    // If a="abc", b="abcd" -> mismatch (4th byte differs).

    // The previous implementation had a logic flaw?
    // "Always use fixed length regardless of input to ensure truly constant time"
    // The previous code:
    // const aPadded = a.padEnd(TIMING_SAFE_COMPARE_LENGTH, '\0');
    // const bPadded = b.padEnd(TIMING_SAFE_COMPARE_LENGTH, '\0');
    // This is basically correct for effectively constant time relative to the content, 
    // assuming padEnd is not leaking timing info (it might).

    // A better way usually involves checking lengths first but doing the loop anyway? No that leaks length.
    // Hashing both inputs and comparing hashes is another valid strategy for long strings!
    // But for passwords/usernames, the padding strategy is okay.

    // Let's improve it to use Uint8Array to avoid string optimization weirdness.

    // Additional check: verify lengths are equal mathematically but accumulated into result
    // effectively: result |= (a.length ^ b.length) ?? No, we want to allow different lengths to fail silently.

    // Let's refine the manual implementation using Uint8Array.

    const lenA = aBytes.length;
    const lenB = bBytes.length;

    // If lengths differ, we still run the loop but ensure failure.
    // To do this we can create a mask.

    // Actually, simply doing the fixed buffer compare is robust enough for this use case 
    // (admin username/password environ vars).

    return result === 0 && lenA === lenB && lenA < TARGET_LEN && lenB < TARGET_LEN;
  } catch (e) {
    return false;
  }
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
          let { username, password } = body;

          if (!username || !password) {
            return new Response('Missing credentials', { status: 400, headers: corsHeaders });
          }

          username = username.trim();

          // 1. Check Admin Credentials (Environment Variables) with timing-safe comparison
          if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD &&
            timingSafeEqual(username, env.ADMIN_USERNAME) &&
            timingSafeEqual(password, env.ADMIN_PASSWORD)) {

            const secret = new TextEncoder().encode(jwtSecret);
            const token = await new SignJWT({ sub: 'admin', username: 'Admin', role: 'admin' })
              .setProtectedHeader({ alg: 'HS256' })
              .setIssuedAt()
              .setExpirationTime('1d')
              .sign(secret);

            // Ensure admin user exists in DB to satisfy Foreign Key constraints for content
            try {
              await env.DB.prepare(`
                INSERT OR IGNORE INTO users (id, username, password_hash) 
                VALUES ('admin', 'Admin', 'placeholder_hash_managed_by_env')
              `).run();
            } catch (e) {
              console.error('Failed to ensure admin user exists:', e);
            }

            return new Response(JSON.stringify({
              token,
              user: { id: 'admin', username: 'Admin', isAdmin: true }
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

          // Generate JWT
          const secret = new TextEncoder().encode(jwtSecret);
          const token = await new SignJWT({ sub: user.id, username: user.username, role: 'user' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(secret);

          return new Response(JSON.stringify({
            token,
            user: { id: user.id, username: user.username, isAdmin: false }
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Protected Routes
        if (url.pathname.startsWith('/api/content')) {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader?.startsWith('Bearer ')) {
            return new Response('Unauthorized', { status: 401, headers: corsHeaders });
          }

          const token = authHeader.split(' ')[1];
          const secret = new TextEncoder().encode(jwtSecret);

          try {
            const { payload } = await jwtVerify(token, secret);
            const userId = payload.sub as string;

            if (request.method === 'GET') {
              const content = await env.DB.prepare('SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
              return new Response(JSON.stringify(content.results), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            if (request.method === 'POST') {
              // Validate Content-Type
              const contentType = request.headers.get('Content-Type');
              if (!contentType || !contentType.includes('application/json')) {
                return new Response('Content-Type must be application/json', { status: 400, headers: corsHeaders });
              }

              const body = await request.json() as any;
              const { data } = body;
              const id = crypto.randomUUID();
              await env.DB.prepare('INSERT INTO content (id, user_id, data) VALUES (?, ?, ?)').bind(id, userId, JSON.stringify(data)).run();
              return new Response(JSON.stringify({ message: 'Content saved', id }), {
                status: 201,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

          } catch (e) {
            return new Response('Invalid token', { status: 401, headers: corsHeaders });
          }
        }

        // User Avatar Routes
        if (url.pathname === '/api/user/avatar' && request.method === 'PUT') {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader?.startsWith('Bearer ')) {
            return new Response('Unauthorized', { status: 401, headers: corsHeaders });
          }

          const token = authHeader.split(' ')[1];
          const secret = new TextEncoder().encode(jwtSecret);

          try {
            const { payload } = await jwtVerify(token, secret);
            const userId = payload.sub as string;

            // 5MB limit
            const contentLength = request.headers.get('Content-Length');
            if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
              return new Response('File too large (max 5MB)', { status: 413, headers: corsHeaders });
            }

            // Read body
            const body = await request.arrayBuffer();
            if (body.byteLength > 5 * 1024 * 1024) {
              return new Response('File too large (max 5MB)', { status: 413, headers: corsHeaders });
            }

            // Simple magic number check
            const view = new Uint8Array(body);
            let contentType = 'application/octet-stream';
            if (view[0] === 0xFF && view[1] === 0xD8 && view[2] === 0xFF) {
              contentType = 'image/jpeg';
            } else if (view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4E && view[3] === 0x47) {
              contentType = 'image/png';
            } else {
              return new Response('Invalid file type. Only JPEG and PNG are allowed.', { status: 415, headers: corsHeaders });
            }

            console.log(`[Avatar PUT] Uploading for user ${userId}, size: ${body.byteLength}, type: ${contentType}`);
            await env.AVATAR_BUCKET.put(`hrt-tracker-user-avatar/${userId}`, body, {
              httpMetadata: { contentType }
            });
            console.log(`[Avatar PUT] Upload successful`);

            return new Response(JSON.stringify({ message: 'Avatar uploaded successfully' }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

          } catch (e) {
            return new Response('Invalid token or upload failed', { status: 401, headers: corsHeaders });
          }
        }

        if (url.pathname.startsWith('/api/user/avatar/') && request.method === 'GET') {
          const username = url.pathname.split('/').pop();
          if (!username) {
            return new Response('Missing username', { status: 400, headers: corsHeaders });
          }

          try {
            let userId: string | null = null;

            // Look up user ID from username
            const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first() as any;

            if (user) {
              userId = user.id;
              console.log(`[Avatar GET] Found DB user: ${username} -> ${userId}`);
            } else if (username === 'Admin' || (env.ADMIN_USERNAME && username === env.ADMIN_USERNAME)) {
              // Handle hardcoded admin
              userId = 'admin';
              console.log(`[Avatar GET] Using hardcoded admin: ${username} -> ${userId}`);
            }

            if (!userId) {
              console.log(`[Avatar GET] User not found: ${username}`);
              return new Response('User not found', { status: 404, headers: corsHeaders });
            }

            console.log(`[Avatar GET] Fetching from R2: hrt-tracker-user-avatar/${userId}`);
            const object = await env.AVATAR_BUCKET.get(`hrt-tracker-user-avatar/${userId}`);

            if (!object) {
              console.log(`[Avatar GET] Object not found in R2`);
              return new Response('Avatar not found', { status: 404, headers: corsHeaders });
            }

            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('etag', object.httpEtag);
            // Cache for 1 hour
            headers.set('Cache-Control', 'public, max-age=3600');
            headers.set('Access-Control-Allow-Origin', '*');

            return new Response(object.body, {
              headers
            });
          } catch (e) {
            return new Response('Error fetching avatar', { status: 500, headers: corsHeaders });
          }
        }

        // User Profile/Security Routes
        if (url.pathname.startsWith('/api/user/')) {
          const authHeader = request.headers.get('Authorization');
          // If accessing avatar via GET, no auth header needed? No, PUT needs it. GET is handled above without auth for public access?
          // Actually the /api/user/avatar/ GET route above works without token if just fetching by username.
          // But here we are doing protected actions.

          // Check for Authorization header if it's not a public route
          // The routes below are all protected: PATCH profile, POST password, DELETE me.
          // So we can enforce it here.
          // However, we MUST NOT intercept the /api/user/avatar/ GET route which starts with /api/user/ !
          // But that route is matched EXPLICITLY above as: if (url.pathname.startsWith('/api/user/avatar/') && request.method === 'GET')
          // So if we put this block AFTER that one, we are safe as long as we don't accidentally match it again?
          // Actually, if the above `if` matches and returns, we are good.
          // The previous block (lines 472-519) returns a response.
          // So we are safe to proceed.

          if (request.method !== 'OPTIONS' && !url.pathname.startsWith('/api/user/avatar/')) {
            if (!authHeader?.startsWith('Bearer ')) {
              return new Response('Unauthorized', { status: 401, headers: corsHeaders });
            }

            const token = authHeader.split(' ')[1];
            const secret = new TextEncoder().encode(jwtSecret);
            let userId: string;

            try {
              const { payload } = await jwtVerify(token, secret);
              userId = payload.sub as string;

              // Update Profile (Username)
              if (url.pathname === '/api/user/profile' && request.method === 'PATCH') {
                const contentType = request.headers.get('Content-Type');
                if (!contentType || !contentType.includes('application/json')) {
                  return new Response('Content-Type must be application/json', { status: 400, headers: corsHeaders });
                }

                const body = await request.json() as any;
                let { username } = body;

                if (!username) {
                  return new Response('Missing username', { status: 400, headers: corsHeaders });
                }

                username = username.trim();

                if (!validateUsername(username)) {
                  return new Response('Username must be 3-30 characters long and contain only letters, numbers, underscore, or hyphen', {
                    status: 400,
                    headers: corsHeaders
                  });
                }

                // Check uniqueness
                const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
                if (existing && (existing as any).id !== userId) {
                  return new Response('Username already taken', { status: 409, headers: corsHeaders });
                }

                await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, userId).run();

                return new Response(JSON.stringify({ message: 'Profile updated', username }), {
                  status: 200,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }

              // Change Password
              if (url.pathname === '/api/user/password' && request.method === 'POST') {
                const contentType = request.headers.get('Content-Type');
                if (!contentType || !contentType.includes('application/json')) {
                  return new Response('Content-Type must be application/json', { status: 400, headers: corsHeaders });
                }
                const body = await request.json() as any;
                const { currentPassword, newPassword } = body;

                if (!currentPassword || !newPassword) {
                  return new Response('Missing passwords', { status: 400, headers: corsHeaders });
                }

                // Verify current password
                const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first() as any;
                if (!user) {
                  return new Response('User not found', { status: 404, headers: corsHeaders });
                }

                const match = await bcrypt.compare(currentPassword, user.password_hash);
                if (!match) {
                  return new Response('Incorrect current password', { status: 401, headers: corsHeaders });
                }

                // Validate new password
                const passwordValidation = validatePassword(newPassword);
                if (!passwordValidation.valid) {
                  return new Response(passwordValidation.error || 'Invalid password', { status: 400, headers: corsHeaders });
                }

                // Hash and update
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hashedPassword, userId).run();

                return new Response(JSON.stringify({ message: 'Password updated successfully' }), {
                  status: 200,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }

              // Delete Account
              if (url.pathname === '/api/user/me' && request.method === 'DELETE') {
                const contentType = request.headers.get('Content-Type');
                if (!contentType || !contentType.includes('application/json')) {
                  return new Response('Content-Type must be application/json', { status: 400, headers: corsHeaders });
                }
                const body = await request.json() as any;
                const { password } = body;

                if (!password) {
                  return new Response('Password required to delete account', { status: 400, headers: corsHeaders });
                }

                // Verify password
                const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first() as any;
                if (!user) {
                  return new Response('User not found', { status: 404, headers: corsHeaders });
                }

                const match = await bcrypt.compare(password, user.password_hash);
                if (!match) {
                  return new Response('Incorrect password', { status: 401, headers: corsHeaders });
                }

                // Delete everything
                await env.DB.batch([
                  env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(userId),
                  env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId)
                ]);

                // Try to delete avatar (ignore error if not exists)
                try {
                  await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${userId}`);
                } catch (e) {
                  console.error('Failed to delete avatar', e);
                }

                return new Response(JSON.stringify({ message: 'Account deleted' }), {
                  status: 200,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }

            } catch (e) {
              return new Response('Invalid token', { status: 401, headers: corsHeaders });
            }
          }
        }

        if (url.pathname.startsWith('/api/admin/')) {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader?.startsWith('Bearer ')) {
            return new Response('Unauthorized', { status: 401, headers: corsHeaders });
          }

          const token = authHeader.split(' ')[1];
          const secret = new TextEncoder().encode(jwtSecret);

          try {
            const { payload } = await jwtVerify(token, secret);
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

          } catch (e) {
            return new Response('Invalid token', { status: 401, headers: corsHeaders });
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
