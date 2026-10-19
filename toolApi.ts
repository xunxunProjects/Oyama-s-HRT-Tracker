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
import type { Env } from './worker';

export const TOOL_API_VERSION = 1;
export const TOOL_MIN_VERSION = '0.1.0';
export const TOOL_TRANSPORTS = ['tls'] as const;

export const toolServerTime = (): string => new Date().toISOString();

export const toolVersionBody = () => ({
    apiVersion: TOOL_API_VERSION,
    minToolVersion: TOOL_MIN_VERSION,
    transport: [...TOOL_TRANSPORTS],
    serverTime: toolServerTime(),
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
    error(code: string, message: string, status: number, headers?: Record<string, string>): Response;
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
    if (!raw || raw === '*') return null;
    return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
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
            const declaredLength = Number(request.headers.get('Content-Length'));
            if (Number.isFinite(declaredLength) && declaredLength > MAX_CLOUD_BACKUP_BYTES) {
                return respond.error('TOO_LARGE', 'Backup exceeds the 2 MiB limit', 413);
            }
            const rawBody = await request.text();
            if (new TextEncoder().encode(rawBody).byteLength > MAX_CLOUD_BACKUP_BYTES) {
                return respond.error('TOO_LARGE', 'Backup exceeds the 2 MiB limit', 413);
            }
            let parsed: unknown;
            try {
                parsed = JSON.parse(rawBody);
            } catch {
                return respond.error('INVALID_REQUEST', 'Invalid JSON body', 400);
            }
            const data = (parsed as { data?: unknown } | null)?.data;
            if (data === undefined) {
                return respond.error('INVALID_REQUEST', 'Missing data', 400);
            }

            const base = baseRevision(request);
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
        const row = await getContent(env, auth.userId, decodeURIComponent(match[1]));
        if (!row) return respond.error('NO_SNAPSHOT', 'No snapshot with that id', 404);
        return respond.json(snapshotBody(row));
    }

    return respond.error('NOT_FOUND', 'Not found', 404);
}
