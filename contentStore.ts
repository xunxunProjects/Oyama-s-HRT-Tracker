import { selectBackupsToKeep } from './backupPolicy';
import type { Env } from './worker';

/**
 * Content-row storage shared by the website API and the tool API.
 *
 * Both namespaces read and write the same `content` rows and the same
 * retention policy; keeping the SQL here is what stops the tool routes from
 * growing a second, subtly different copy of it.
 */

export interface ContentMeta {
    id: string;
    created_at: number;
    data_size: number;
}

export type ContentRow = Record<string, unknown>;

export async function listContent(env: Env, userId: string): Promise<ContentMeta[]> {
    const content = await env.DB.prepare(
        'SELECT id, created_at, LENGTH(data) AS data_size FROM content WHERE user_id = ? ORDER BY created_at DESC',
    )
        .bind(userId)
        .all();
    return content.results as unknown as ContentMeta[];
}

export async function latestContent(env: Env, userId: string): Promise<ContentRow | null> {
    return (await env.DB.prepare('SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
        .bind(userId)
        .first()) as ContentRow | null;
}

export async function getContent(env: Env, userId: string, id: string): Promise<ContentRow | null> {
    return (await env.DB.prepare('SELECT * FROM content WHERE id = ? AND user_id = ?')
        .bind(id, userId)
        .first()) as ContentRow | null;
}

/**
 * Insert a revision and prune to the retention policy. Which revisions
 * survive is decided in backupPolicy.ts — one per generation, then the
 * newest — rather than "the newest N", which the client's few-seconds-after-
 * every-edit uploads turned into a log of the last minute.
 *
 * With `expectedBase`, the insert is conditional on that id still being the
 * newest revision. The condition lives in the INSERT statement so two clients
 * holding the same base cannot both pass a read-then-write check. Returns
 * null when the condition fails; the caller refetches and reports a conflict.
 */
export async function storeContent(
    env: Env,
    userId: string,
    data: unknown,
    expectedBase?: string,
): Promise<string | null> {
    const id = crypto.randomUUID();
    if (expectedBase !== undefined) {
        const inserted = await env.DB.prepare(
            `INSERT INTO content (id, user_id, data)
             SELECT ?, ?, ?
             WHERE COALESCE(
                 (SELECT id FROM content WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1),
                 ''
             ) = ?`,
        )
            .bind(id, userId, JSON.stringify(data), userId, expectedBase)
            .run();
        if (Number(inserted.meta?.changes ?? 0) === 0) {
            return null;
        }
    } else {
        await env.DB.prepare('INSERT INTO content (id, user_id, data) VALUES (?, ?, ?)')
            .bind(id, userId, JSON.stringify(data))
            .run();
    }
    const revisions = await env.DB.prepare(
        'SELECT id, created_at FROM content WHERE user_id = ? ORDER BY created_at DESC',
    )
        .bind(userId)
        .all<{ id: string; created_at: number }>();
    const keep = selectBackupsToKeep(revisions.results, id);
    const stale = revisions.results.filter(r => !keep.has(r.id)).map(r => r.id);
    if (stale.length > 0) {
        await env.DB.prepare(`DELETE FROM content WHERE user_id = ? AND id IN (${stale.map(() => '?').join(',')})`)
            .bind(userId, ...stale)
            .run();
    }
    return id;
}
