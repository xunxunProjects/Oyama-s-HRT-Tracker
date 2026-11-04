import type { RequestContext } from '../../../worker';
import { hrtCapability } from '../../../hrtPairing';
import { handleCommunityVotePublic } from '../../../communityVoteServer';
import { getClientIP } from '../../../requestInput';
import { checkRateLimit } from '../rateLimit';
import { NOTICE_COLUMNS, type SiteNoticeRow, serializeNotice } from '../notice';

export async function handlePublicRoutes(ctx: RequestContext): Promise<Response | null> {
    const { request, env, url, corsHeaders, jsonError, withSecurityHeaders } = ctx;

    // /api/hrt/capability
    if (url.pathname === '/api/hrt/capability' && request.method === 'GET') {
        return withSecurityHeaders(
            new Response(JSON.stringify({ supported: hrtCapability(env).supported }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            }),
        );
    }

    // /api/transparency
    if (url.pathname === '/api/transparency' && request.method === 'GET') {
        const clientIP = getClientIP(request, env);
        const limitKey = clientIP ? `transparency:${clientIP}` : 'transparency:global-noip';
        if (!(await checkRateLimit(env, limitKey, clientIP ? 30 : 60))) {
            return jsonError('RATE_LIMITED', 'Too many requests. Please try again later.', 429, {
                'Retry-After': '60',
            });
        }

        const now = Math.floor(Date.now() / 1000);
        const day = 86400;
        const HOUR = 3600;

        const [
            totalUsersRow,
            totalBackupsRow,
            newUsers7dRow,
            newUsers24hRow,
            adminDelRow,
            selfDelRow,
            adminDel7dRow,
            selfDel7dRow,
            recentRows,
        ] = await Promise.all([
            env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id != 'admin'").first<{ n: number }>(),
            env.DB.prepare('SELECT COUNT(*) AS n FROM content').first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id != 'admin' AND created_at >= ?")
                .bind(now - 7 * day)
                .first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id != 'admin' AND created_at >= ?")
                .bind(now - day)
                .first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'admin'").first<{
                n: number;
            }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'self'").first<{
                n: number;
            }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'admin' AND deleted_at >= ?")
                .bind(now - 7 * day)
                .first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'self' AND deleted_at >= ?")
                .bind(now - 7 * day)
                .first<{ n: number }>(),
            env.DB.prepare(
                "SELECT id, created_at FROM users WHERE id != 'admin' ORDER BY created_at DESC LIMIT 10",
            ).all<{ id: string; created_at: number }>(),
        ]);

        const recent = (recentRows.results || []).map(r => ({
            anon_id: String(r.id)
                .replace(/[^a-f0-9]/gi, '')
                .slice(0, 4)
                .toLowerCase()
                .padEnd(4, '0'),
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

        return withSecurityHeaders(
            new Response(JSON.stringify(body), {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=15',
                },
            }),
        );
    }

    // /api/vote GET
    if (url.pathname === '/api/vote' && request.method === 'GET') {
        const clientIP = getClientIP(request, env);
        const limitKey = clientIP ? `vote:public:${clientIP}` : 'vote:public:global-noip';
        if (!(await checkRateLimit(env, limitKey, clientIP ? 60 : 300))) {
            return jsonError('RATE_LIMITED', 'Too many requests. Please try again later.', 429, {
                'Retry-After': '60',
            });
        }

        const result = await handleCommunityVotePublic(env);
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

    // /api/notice GET
    if (url.pathname === '/api/notice' && request.method === 'GET') {
        const clientIP = getClientIP(request, env);
        const limitKey = clientIP ? `notice:${clientIP}` : 'notice:global-noip';
        if (!(await checkRateLimit(env, limitKey, clientIP ? 60 : 300))) {
            return jsonError('RATE_LIMITED', 'Too many requests. Please try again later.', 429, {
                'Retry-After': '60',
            });
        }

        const row = await env.DB.prepare(
            `SELECT ${NOTICE_COLUMNS} FROM site_notice WHERE id = 1`,
        ).first<SiteNoticeRow>();

        const nowTs = Math.floor(Date.now() / 1000);
        const live =
            !!row &&
            !!row.body &&
            (row.starts_at == null || nowTs >= row.starts_at) &&
            (row.expires_at == null || nowTs < row.expires_at);

        return withSecurityHeaders(
            new Response(JSON.stringify({ notice: live ? serializeNotice(row!) : null }), {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=60',
                },
            }),
        );
    }

    return null;
}
