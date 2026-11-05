import type { Env } from './env';
import { MAX_SHARE_EXPIRY_MS } from '../../shareExpiry';

export const MAX_SHARE_REQUEST_BYTES = 2 * 1024 * 1024;
export const MAX_ACTIVE_SHARES_PER_USER = 20;
export const MAX_EXPIRED_SHARE_TOMBSTONES_PER_USER = 20;
export const MAX_SHARE_EXPIRY_SECONDS = Math.floor(MAX_SHARE_EXPIRY_MS / 1000);
export const MAX_WRAPPED_SHARE_KEY_BYTES = 1024;
export const MAX_LIVE_UPDATES_PER_REQUEST = MAX_ACTIVE_SHARES_PER_USER;

export function shareOriginFor(url: URL, env: Env): string {
    const host = url.hostname.toLowerCase();
    if (host.endsWith('.onion') || host.endsWith('.i2p')) {
        return url.origin;
    }
    return (env.PUBLIC_APP_ORIGIN || url.origin).replace(/\/+$/, '');
}
