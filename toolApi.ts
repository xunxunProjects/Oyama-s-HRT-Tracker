/**
 * `/api/tool/v1/*` contract helpers.
 *
 * The route dispatch lives in worker.ts so the tool namespace shares the
 * existing JWT, session, rate-limit, login and content plumbing. This module
 * owns the version advertisement, the extra fields the CLI expects on a login
 * response, and the authenticated snapshot routes.
 */

import { MAX_CLOUD_BACKUP_BYTES } from './backupPolicy';
import { getContent, latestContent, listContent, storeContent } from './contentStore';
import { readSmallJsonBody } from './requestInput';
import type { ApiErrorCode, Env } from './worker';

export const TOOL_API_VERSION = 1;
export const TOOL_MIN_VERSION = '0.1.0';
export const TOOL_TRANSPORTS = ['tls'] as const;

export const toolServerTime = (): string => new Date().toISOString();

export const toolVersionBody = (env?: Pick<Env, 'HRT_RAW_ENABLED' | 'HRT_SERVICE_TOKEN'>) => ({
    apiVersion: TOOL_API_VERSION,
    minToolVersion: TOOL_MIN_VERSION,
    transport: [...TOOL_TRANSPORTS],
    serverTime: toolServerTime(),
    hrt: {
        supported:
            env?.HRT_RAW_ENABLED === '1' &&
            typeof env.HRT_SERVICE_TOKEN === 'string' &&
            env.HRT_SERVICE_TOKEN.length >= 16,
        version: 1,
    },
});

/** Add the tool fields to a successful login response, leaving errors alone. */
export function addToolLoginFields<T extends Record<string, unknown>>(
    body: T,
): T & {
    apiVersion: number;
    serverTime: string;
    transport: string[];
} {
    return {
        ...body,
        apiVersion: TOOL_API_VERSION,
        serverTime: toolServerTime(),
        transport: [...TOOL_TRANSPORTS],
    };
}

export interface ToolAuthContext {
    userId: string;
    sessionId: string | null;
    username: string;
    role: string;
}

export interface ToolResponders {
    json(body: unknown, status?: number, headers?: Record<string, string>): Response;
    error(code: ApiErrorCode, message: string, status: number, headers?: Record<string, string>): Response;
    /** The existing `content-write:<userId>` limiter. */
    allowWrite(): Promise<boolean>;
}

interface SnapshotBody {
    id: string;
    createdAt: number;
    data: unknown;
}

const snapshotBody = (row: Record<string, unknown>): SnapshotBody => ({
    id: String(row.id),
    createdAt: Number(row.created_at),
    data: row.data === null || row.data === undefined ? null : JSON.parse(String(row.data)),
});

const baseRevision = (request: Request): string | null => {
    const raw = request.headers.get('If-Match') ?? request.headers.get('X-HRT-Base-Revision');
    if (!raw) return null;
    if (raw === '*') return '*';
    /* Weak validators are still the id the client means; the comparison is
       against our revision id, not an HTTP entity tag. */
    let value = raw.startsWith('W/') ? raw.slice(2) : raw;
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    return value;
};

/**
 * Dispatch a request that has already passed JWT and session validation.
 * Returns null only for a path outside this namespace, so the caller can
 * fall through to the existing routes.
 */
export async function handleToolProtected(
    request: Request,
    env: Env,
    auth: ToolAuthContext,
    respond: ToolResponders,
): Promise<Response | null> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/tool/v1/')) return null;
    const method = request.method;

    if (path === '/api/tool/v1/me' && method === 'GET') {
        return respond.json({
            user: { id: auth.userId, username: auth.username, isAdmin: auth.role === 'admin' },
            serverTime: toolServerTime(),
            apiVersion: TOOL_API_VERSION,
        });
    }

    if (path === '/api/tool/v1/logout' && method === 'POST') {
        if (auth.sessionId) {
            await env.DB.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?')
                .bind(auth.sessionId, auth.userId)
                .run();
        }
        return respond.json({ ok: true });
    }

    if (path === '/api/tool/v1/snapshot') {
        if (method === 'GET') {
            const row = await latestContent(env, auth.userId);
            if (!row) return respond.error('NO_SNAPSHOT', 'No snapshot stored', 404);
            return respond.json(snapshotBody(row));
        }
        if (method === 'PUT') {
            if (!(await respond.allowWrite())) {
                return respond.error('RATE_LIMITED', 'Too many backups. Please try again later.', 429, {
                    'Retry-After': '60',
                });
            }
            /* Streamed and cancelled at the cap: a chunked body without a
               Content-Length cannot buffer the isolate out of memory. */
            const parsedBody = await readSmallJsonBody(request, MAX_CLOUD_BACKUP_BYTES);
            if (!parsedBody.ok) {
                return parsedBody.tooLarge
                    ? respond.error('TOO_LARGE', 'Backup exceeds the 2 MiB limit', 413)
                    : respond.error('INVALID_REQUEST', 'Invalid JSON body', 400);
            }
            const data = (parsedBody.value as { data?: unknown } | null)?.data;
            if (data === undefined) {
                return respond.error('INVALID_REQUEST', 'Missing data', 400);
            }

            let base = baseRevision(request);
            if (base === '*') {
                const newest = await latestContent(env, auth.userId);
                if (!newest) {
                    return respond.json(
                        {
                            code: 'CONFLICT',
                            message: 'Snapshot has changed; merge and retry',
                            current: null,
                        },
                        409,
                    );
                }
                base = String(newest.id);
            }
            const id = await storeContent(env, auth.userId, data, base ?? undefined);
            if (id === null) {
                const newest = await latestContent(env, auth.userId);
                return respond.json(
                    {
                        code: 'CONFLICT',
                        message: 'Snapshot has changed; merge and retry',
                        current: newest ? { id: String(newest.id), createdAt: Number(newest.created_at) } : null,
                    },
                    409,
                );
            }
            const row = await getContent(env, auth.userId, id);
            return respond.json({ id, createdAt: row ? Number(row.created_at) : Math.floor(Date.now() / 1000) }, 201);
        }
    }

    if (path === '/api/tool/v1/snapshots' && method === 'GET') {
        const rows = await listContent(env, auth.userId);
        return respond.json(
            rows.map(row => ({
                id: row.id,
                createdAt: Number(row.created_at),
                dataSize: Number(row.data_size),
            })),
        );
    }

    const match = /^\/api\/tool\/v1\/snapshot\/([^/]+)$/.exec(path);
    if (match && method === 'GET') {
        /* Revision ids are UUIDs minted by crypto.randomUUID. Reject anything
           else before decoding, so malformed percent-encoding is a 404 rather
           than a URIError on the way to the outer catch. */
        const id = match[1];
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
            return respond.error('NO_SNAPSHOT', 'No snapshot with that id', 404);
        }
        const row = await getContent(env, auth.userId, id);
        if (!row) return respond.error('NO_SNAPSHOT', 'No snapshot with that id', 404);
        return respond.json(snapshotBody(row));
    }

    return respond.error('NOT_FOUND', 'Not found', 404);
}
