import { getContent, listContent, storeContent } from '../../../contentStore';
import { checkRateLimit } from '../rateLimit';
import { MAX_CLOUD_BACKUP_BYTES } from '../../../backupPolicy';
import { readSmallJsonBody } from '../../../requestInput';

import type { RequestContext } from '../../../worker';

export async function handleContentRoute(ctx: RequestContext, userId: string): Promise<Response | null> {
    const { request, env, url, corsHeaders, withSecurityHeaders, jsonError } = ctx;

    if (!url.pathname.startsWith('/api/content')) return null;

    if (url.pathname === '/api/content' && request.method === 'GET') {
        const content = await listContent(env, userId);
        return withSecurityHeaders(
            new Response(JSON.stringify(content), {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                },
            }),
        );
    }

    if (url.pathname === '/api/content' && request.method === 'POST') {
        if (!(await checkRateLimit(env, `content-write:${userId}`, 20))) {
            return jsonError('RATE_LIMITED', 'Too many backups. Please try again later.', 429, {
                'Retry-After': '60',
            });
        }
        const parsedBody = await readSmallJsonBody(request, MAX_CLOUD_BACKUP_BYTES);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Backup exceeds the 2 MiB limit', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const data = (parsedBody.value as { data?: unknown } | null)?.data;
        if (data === undefined) {
            return jsonError('INVALID_REQUEST', 'Missing data', 400);
        }
        const id = await storeContent(env, userId, data);
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Content saved', id }), {
                status: 201,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                },
            }),
        );
    }

    if (url.pathname.match(/^\/api\/content\/[^/]+$/) && request.method === 'DELETE') {
        const backupId = url.pathname.split('/').pop();
        await env.DB.prepare('DELETE FROM content WHERE id = ? AND user_id = ?').bind(backupId, userId).run();
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Backup deleted' }), {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                },
            }),
        );
    }

    if (url.pathname.match(/^\/api\/content\/[^/]+$/) && request.method === 'GET') {
        const backupId = url.pathname.split('/').pop()!;
        const row = await getContent(env, userId, backupId);
        if (!row) return jsonError('NOT_FOUND', 'Not found', 404);
        return withSecurityHeaders(
            new Response(JSON.stringify(row), {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                },
            }),
        );
    }

    return null;
}
