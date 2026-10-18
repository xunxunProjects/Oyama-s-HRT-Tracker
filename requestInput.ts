// What the worker reads off an incoming request before any handler logic: the
// client address for rate limits, and small JSON bodies under a size cap.
//
// These live outside worker.ts because workerd treats every named export of
// the main module as an entrypoint and refuses to start when one is a plain
// value, so helpers that tests import cannot be exported from there.

// Uniform cap for the small JSON request bodies (auth, passkey, 2FA); large
// payloads have their own limits and file routes do not go through this.
export const MAX_JSON_BODY_BYTES = 64 * 1024;

/**
 * The client address for rate-limit keys and session records, or null when the
 * deployment has none (TRUSTED_IP_SOURCE=none, Tor/I2P mirrors). Callers must
 * cope with null by not keying an address bucket on a shared 'unknown'.
 */
export function getClientIP(request: Request, env: { TRUSTED_IP_SOURCE?: string }): string | null {
    const source = (env.TRUSTED_IP_SOURCE || 'cf').trim().toLowerCase();
    if (source === 'none' || source === 'off') return null;
    if (source === 'x-forwarded-for' || source === 'xff') {
        // The proxy appends the address it saw to whatever the client sent, so
        // only the last hop is one it vouches for.
        const last = request.headers.get('X-Forwarded-For')?.split(',').pop()?.trim();
        return last || null;
    }
    return request.headers.get('CF-Connecting-IP')?.trim() || null;
}

/**
 * Reads a JSON request body for the small JSON endpoints. The body is consumed
 * chunk by chunk and reading stops as soon as the accumulated size passes the
 * cap, so an oversized (or chunked, Content-Length-less) payload never gets
 * buffered in full by this application. That bounds what the handler holds,
 * not the runtime's network buffers: a single stream chunk is allocated by the
 * runtime before we see it. Malformed JSON and invalid UTF-8 are reported as
 * request errors instead of letting them reach the outer catch as a 500.
 * Bigger payloads have their own dedicated limits and do not use this.
 * Callers with a tighter budget than MAX_JSON_BODY_BYTES can pass their own
 * cap (the share-access body, for example, is limited to 1 KiB).
 */
export async function readSmallJsonBody(
    request: Request,
    maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<{ ok: boolean; value: any; tooLarge: boolean }> {
    if (!request.body) {
        return { ok: true, value: {}, tooLarge: false };
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;

            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                try {
                    await reader.cancel();
                } catch {
                    // The stream may already have been cancelled or closed.
                }
                return { ok: false, value: undefined, tooLarge: true };
            }
            chunks.push(value);
        }
    } catch {
        return { ok: false, value: undefined, tooLarge: false };
    } finally {
        reader.releaseLock();
    }

    try {
        const bytes = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }

        const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const value = raw.length > 0 ? JSON.parse(raw) : {};
        return { ok: true, value: value ?? {}, tooLarge: false };
    } catch {
        return { ok: false, value: undefined, tooLarge: false };
    }
}
