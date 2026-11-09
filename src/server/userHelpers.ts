import type { Env } from './env';

export async function logDeletion(env: Env, reason: 'self' | 'admin', userCreatedAt: number | null): Promise<void> {
    try {
        await env.DB.prepare('INSERT INTO deletion_log (reason, user_created_at) VALUES (?, ?)')
            .bind(reason, userCreatedAt)
            .run();
    } catch (e) {
        console.error('Failed to log deletion:', e);
    }
}

/**
 * Whether an admin has kept this account as a memorial. A memorial account
 * keeps everything it holds and its share links, but nobody can sign in to it
 * or change it any more. Reads false while migration 0015 is not applied yet,
 * so a deploy that runs ahead of the migration still lets everyone sign in.
 */
export async function isMemorialAccount(env: { DB: D1Database }, userId: string): Promise<boolean> {
    try {
        const row = await env.DB.prepare('SELECT memorial_at FROM users WHERE id = ?')
            .bind(userId)
            .first<{ memorial_at: number | null }>();
        return row?.memorial_at != null;
    } catch {
        return false;
    }
}

export const MEMORIAL_MESSAGE = 'This account is kept as a memorial and can no longer be signed in to.';
