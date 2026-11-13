import type { RequestContext } from '../../../worker';
import { hrtCapability } from '../../../hrtPairing';
import { handleHrtService } from '../../../hrtPairing';
import { handleF2fService } from '../../../f2f';
import { toolVersionBody } from '../../../toolApi';
import { exchangeF2fCliCode } from '../../../f2f';
import { handleCommunityVotePublic } from '../../../communityVoteServer';
import { getClientIP, readSmallJsonBody } from '../../../requestInput';
import { checkRateLimit } from '../rateLimit';
import { NOTICE_COLUMNS, type SiteNoticeRow, serializeNotice } from '../notice';
import { handleDonationPublic, readDonationPayout, upsertDonationTrade, validateMoneroAddress } from '../donation';
import { createAnonPayInvoice, parseInvoiceRequest, parseTrocadorTrade, webhookKeyMatches } from '../trocador';

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

    // /api/donation GET
    if (url.pathname === '/api/donation' && request.method === 'GET') {
        const clientIP = getClientIP(request, env);
        const limitKey = clientIP ? `donation:${clientIP}` : 'donation:global-noip';
        if (!(await checkRateLimit(env, limitKey, clientIP ? 60 : 300))) {
            return jsonError('RATE_LIMITED', 'Too many requests. Please try again later.', 429, {
                'Retry-After': '60',
            });
        }

        const result = await handleDonationPublic(env);
        return withSecurityHeaders(
            new Response(JSON.stringify(result.body), {
                status: result.status,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=60',
                },
            }),
        );
    }

    // /api/donation/invoice POST
    // Creates an indirect Trocador invoice. The payout address never leaves the
    // server, and the donor cannot edit the destination or amount.
    if (url.pathname === '/api/donation/invoice' && request.method === 'POST') {
        const clientIP = getClientIP(request, env);
        const limitKey = clientIP ? `donation:invoice:${clientIP}` : 'donation:invoice:global-noip';
        if (!(await checkRateLimit(env, limitKey, clientIP ? 10 : 30))) {
            return jsonError('RATE_LIMITED', 'Too many requests. Please try again later.', 429, {
                'Retry-After': '60',
            });
        }

        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const parsed = parseInvoiceRequest(parsedBody.value);
        if ('error' in parsed) return jsonError('INVALID_REQUEST', parsed.error, 400);

        const payout = await readDonationPayout(env);
        if (!payout || !validateMoneroAddress(payout)) {
            return jsonError('UNAVAILABLE', 'Trocador donations are not configured', 503);
        }

        const publicOrigin = (env.PUBLIC_APP_ORIGIN || url.origin).replace(/\/$/, '');
        const webhookKey = env.TROCADOR_WEBHOOK_KEY ?? '';
        const webhookUrl =
            webhookKey && publicOrigin.startsWith('https://') ? `${publicOrigin}/api/donation/webhook` : '';

        try {
            const invoice = await createAnonPayInvoice({
                tickerFrom: parsed.value.ticker,
                networkFrom: parsed.value.network,
                payoutAddress: payout,
                webhookUrl,
                webhookKey: webhookUrl ? webhookKey : '',
            });
            return withSecurityHeaders(
                new Response(JSON.stringify({ invoice: { id: invoice.id, url: invoice.url } }), {
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                    },
                }),
            );
        } catch {
            return jsonError('UPSTREAM_ERROR', 'Could not create the exchange invoice. Please try again.', 502);
        }
    }

    // /api/donation/webhook POST
    // Trocador signs the request with the Webhook-Key header. The trade is
    // recorded idempotently because Trocador only retains it for about 14 days.
    if (url.pathname === '/api/donation/webhook' && request.method === 'POST') {
        const expected = env.TROCADOR_WEBHOOK_KEY ?? '';
        if (!expected) return jsonError('UNAVAILABLE', 'Webhook is not configured', 503);
        if (!webhookKeyMatches(request.headers.get('Webhook-Key'), expected)) {
            return jsonError('FORBIDDEN', 'Forbidden', 403);
        }

        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const trade = parseTrocadorTrade(parsedBody.value);
        if (!trade) return jsonError('INVALID_REQUEST', 'Invalid trade body', 400);
        await upsertDonationTrade(env, trade, parsedBody.value);

        return withSecurityHeaders(
            new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
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

    // Avatar GET (public)
    if (url.pathname.startsWith('/api/user/avatar/') && request.method === 'GET') {
        const clientIP = getClientIP(request, env);
        if (!(await checkRateLimit(env, clientIP ? `avatar:${clientIP}` : 'avatar:global-noip', 300))) {
            return jsonError('RATE_LIMITED', 'Too many requests. Please try again later.', 429, {
                'Retry-After': '60',
            });
        }
        const username = url.pathname.split('/').pop();
        const genericNotFound = () => jsonError('NOT_FOUND', 'Not found', 404);

        try {
            const user = (await env.DB.prepare('SELECT id FROM users WHERE username = ?')
                .bind(username)
                .first()) as any;
            const userId = user ? user.id : username === 'Admin' ? 'admin' : null;
            if (!userId) return genericNotFound();

            const object = await env.AVATAR_BUCKET.get(`hrt-tracker-user-avatar/${userId}`);
            if (!object) {
                return withSecurityHeaders(
                    new Response(null, {
                        status: 204,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'no-store',
                        },
                    }),
                );
            }

            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('Access-Control-Allow-Origin', '*');
            headers.set('Cache-Control', 'public, max-age=3600');
            return withSecurityHeaders(new Response(object.body, { headers }));
        } catch (e) {
            return genericNotFound();
        }
    }

    // F2F CLI token exchange (public)
    if (url.pathname === '/api/f2f/cli/token') {
        if (request.method !== 'POST') {
            return jsonError('INVALID_REQUEST', 'method not allowed', 405);
        }
        const clientIP = getClientIP(request, env);
        const limitKey = clientIP ? `f2f-cli-token:${clientIP}` : 'f2f-cli-token:global-noip';
        if (!(await checkRateLimit(env, limitKey, clientIP ? 10 : 30))) {
            return jsonError('RATE_LIMITED', 'Too many requests. Please try again later.', 429, {
                'Retry-After': '60',
            });
        }
        return withSecurityHeaders(await exchangeF2fCliCode(request, env, ctx.jwtSecret));
    }

    // Tool API public surface
    if (url.pathname === '/api/tool/v1/version' && request.method === 'GET') {
        return withSecurityHeaders(
            new Response(JSON.stringify(toolVersionBody(env)), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            }),
        );
    }
    if (url.pathname === '/api/tool/v1/compute' && request.method === 'POST') {
        return jsonError('NOT_IMPLEMENTED', 'Server compute is reserved for a future version', 501);
    }
    if (url.pathname.startsWith('/api/tool/v1/hrt/')) {
        const hrtResponse = await handleHrtService(request, env, url);
        if (hrtResponse) return withSecurityHeaders(hrtResponse);
    }
    if (url.pathname.startsWith('/api/tool/v1/f2f/')) {
        const f2fResponse = await handleF2fService(request, env, url);
        if (f2fResponse) return withSecurityHeaders(f2fResponse);
    }

    return null;
}
