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
