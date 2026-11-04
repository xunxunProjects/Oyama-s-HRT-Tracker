import { isJsonObject } from '../../shareSnapshotSchema';
import { MAX_WRAPPED_SHARE_KEY_BYTES } from './shareConstants';

import type { Env } from './env';

export function sanitizeWrappedShareKey(raw: unknown): string | null {
    if (!isJsonObject(raw) || raw.cloud !== 1) return null;
    if (typeof raw.iv !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(raw.iv)) return null;
    if (typeof raw.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.data)) return null;
    const json = JSON.stringify({ cloud: 1, iv: raw.iv, data: raw.data });
    return json.length <= MAX_WRAPPED_SHARE_KEY_BYTES ? json : null;
}

export async function sweepExpiredShares(env: Env): Promise<void> {
    try {
        await env.DB.prepare(
            `UPDATE dosage_shares SET snapshot_json = 'null', password_hash = NULL, key_wrapped = NULL
       WHERE expires_at IS NOT NULL AND expires_at <= ?
         AND (snapshot_json != 'null' OR password_hash IS NOT NULL OR key_wrapped IS NOT NULL)`,
        )
            .bind(Math.floor(Date.now() / 1000))
            .run();
    } catch (e) {
        console.error('Failed to sweep expired shares:', e);
    }
}
