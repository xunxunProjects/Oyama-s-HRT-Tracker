
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

// Rate limiting map (in-memory, simple implementation)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
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
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Validate JWT secret
function validateJWTSecret(secret: string | undefined): string {
  if (!secret || secret === 'fallback-secret' || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and be at least 32 characters long. Never use default/fallback secrets in production.');
  }
  return secret;
}

// Validate username for security
function validateUsername(username: string): boolean {
  // Username must be 3-30 characters, alphanumeric plus underscore and hyphen
  const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
  return usernameRegex.test(username);
}

// Validate password strength
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must be at most 128 characters long' };
  }
  return { valid: true };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API Routes
    if (url.pathname.startsWith('/api/')) {
      // CORS headers
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      try {
        // Validate JWT secret at startup
        const jwtSecret = validateJWTSecret(env.JWT_SECRET);
        
        // Rate limiting for authentication endpoints
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (url.pathname === '/api/login' || url.pathname === '/api/register') {
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
          const { username, password } = body;
          
          if (!username || !password) {
            return new Response('Missing username or password', { status: 400, headers: corsHeaders });
          }

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
          const { username, password } = body;
          
          if (!username || !password) {
            return new Response('Missing credentials', { status: 400, headers: corsHeaders });
          }

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

        // Admin Routes
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
