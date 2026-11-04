import type { RequestContext } from '../../../worker';

const SESSION_IDLE_TIMEOUT_SECONDS = 3 * 24 * 60 * 60;
const SESSION_JWT_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const LIVE_SESSION_SQL = `created_at > ?1 - ${SESSION_JWT_LIFETIME_SECONDS} AND last_used_at > ?1 - ${SESSION_IDLE_TIMEOUT_SECONDS}`;

export async function handleSessionsRoute(
    ctx: RequestContext,
    userId: string,
    sessionId: string | null,
): Promise<Response | null> {
    const { request, env, url, corsHeaders, privateCacheHeaders, withSecurityHeaders } = ctx;
    if (!url.pathname.startsWith('/api/user/sessions')) return null;
    console.error('handleSessionsRoute called', url.pathname, request.method);

    if (url.pathname === '/api/user/sessions' && request.method === 'GET') {
        const rows = await env.DB.prepare(
            `SELECT id, created_at, last_used_at, device_info, ip FROM sessions WHERE user_id = ?2 AND ${LIVE_SESSION_SQL} ORDER BY last_used_at DESC`,
        )
            .bind(Math.floor(Date.now() / 1000), userId)
            .all();
        const currentSid = sessionId ?? null;
        const sessions = (rows.results || []).map((s: any) => ({
            id: s.id,
            created_at: s.created_at,
            last_used_at: s.last_used_at,
            device_info: s.device_info,
            ip: s.ip,
            is_current: s.id === currentSid,
        }));
        return withSecurityHeaders(
            new Response(JSON.stringify(sessions), {
                status: 200,
                headers: {
                    ...corsHeaders,
                    ...privateCacheHeaders,
                    'Content-Type': 'application/json',
                },
            }),
        );
    }

    if (url.pathname === '/api/user/sessions' && request.method === 'DELETE') {
        if (sessionId) {
            await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(userId, sessionId).run();
        } else {
            await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
        }
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Other sessions terminated' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    if (url.pathname.match(/^\/api\/user\/sessions\/[^/]+$/) && request.method === 'DELETE') {
        const targetSid = url.pathname.split('/').pop()!;
        await env.DB.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').bind(targetSid, userId).run();
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Session terminated' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    return null;
}
