
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
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
        if (url.pathname === '/api/register' && request.method === 'POST') {
          const body = await request.json() as any;
          const { username, password } = body;
          if (!username || !password) return new Response('Missing username or password', { status: 400, headers: corsHeaders });

          // Check if user exists
          const existing = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
          if (existing) return new Response('Username already taken', { status: 409, headers: corsHeaders });

          const hashedPassword = await bcrypt.hash(password, 10);
          const id = crypto.randomUUID();

          await env.DB.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').bind(id, username, hashedPassword).run();

          return new Response(JSON.stringify({ message: 'User registered successfully' }), { status: 201, headers: corsHeaders });
        }

        if (url.pathname === '/api/login' && request.method === 'POST') {
          const body = await request.json() as any;
          const { username, password } = body;
          if (!username || !password) return new Response('Missing credentials', { status: 400, headers: corsHeaders });

          const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first() as any;
          if (!user) return new Response('Invalid credentials', { status: 401, headers: corsHeaders });

          const match = await bcrypt.compare(password, user.password_hash);
          if (!match) return new Response('Invalid credentials', { status: 401, headers: corsHeaders });

          // Generate JWT
          const secret = new TextEncoder().encode(env.JWT_SECRET || 'fallback-secret');
          const token = await new SignJWT({ sub: user.id, username: user.username })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(secret);

          return new Response(JSON.stringify({ token, user: { id: user.id, username: user.username } }), { status: 200, headers: corsHeaders });
        }

        // Protected Routes
        if (url.pathname.startsWith('/api/content')) {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

          const token = authHeader.split(' ')[1];
          const secret = new TextEncoder().encode(env.JWT_SECRET || 'fallback-secret');

          try {
            const { payload } = await jwtVerify(token, secret);
            const userId = payload.sub as string;

            if (request.method === 'GET') {
              const content = await env.DB.prepare('SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
              return new Response(JSON.stringify(content.results), { status: 200, headers: corsHeaders });
            }

            if (request.method === 'POST') {
              const body = await request.json() as any;
              const { data } = body;
              const id = crypto.randomUUID();
              await env.DB.prepare('INSERT INTO content (id, user_id, data) VALUES (?, ?, ?)').bind(id, userId, JSON.stringify(data)).run();
              return new Response(JSON.stringify({ message: 'Content saved', id }), { status: 201, headers: corsHeaders });
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
