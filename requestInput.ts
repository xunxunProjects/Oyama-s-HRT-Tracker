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
 * deployment has none. Callers must cope with null by not keying an address
 * bucket on a shared 'unknown'.
 *
 * Both headers are client-controlled unless something trusted in front of the
 * app overwrites them. `cf` and `x-forwarded-for` are therefore opt-in: the
 * default is `none`, not a guessed header. A deployment behind Cloudflare sets
 * `cf`; one behind exactly one trusted reverse proxy sets `x-forwarded-for`.
 */
export function getClientIP(request: Request, env: { TRUSTED_IP_SOURCE?: string }): string | null {
    const source = (env.TRUSTED_IP_SOURCE || 'none').trim().toLowerCase();
    if (source === 'x-forwarded-for' || source === 'xff') {
        // The proxy appends the address it saw to whatever the client sent, so
        // only the last hop is one it vouches for.
        const last = request.headers.get('X-Forwarded-For')?.split(',').pop()?.trim();
        return last || null;
    }
    // Only the explicitly configured Cloudflare source is trusted. An unknown
    // or misspelled value must fail closed instead of silently reading a
    // client-supplied header.
    if (source === 'cf') return request.headers.get('CF-Connecting-IP')?.trim() || null;
    return null;
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
export async function readSmallBody(
    request: Request,
    maxBytes: number,
): Promise<{ ok: boolean; bytes: Uint8Array; tooLarge: boolean }> {
    if (!request.body) {
        return { ok: true, bytes: new Uint8Array(0), tooLarge: false };
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
                return { ok: false, bytes: new Uint8Array(0), tooLarge: true };
            }
            chunks.push(value);
        }
    } catch {
        return { ok: false, bytes: new Uint8Array(0), tooLarge: false };
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { ok: true, bytes, tooLarge: false };
}

export async function readSmallJsonBody(
    request: Request,
    maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<{ ok: boolean; value: any; tooLarge: boolean }> {
    const body = await readSmallBody(request, maxBytes);
    if (!body.ok) {
        return { ok: false, value: undefined, tooLarge: body.tooLarge };
    }
    try {
        const raw = new TextDecoder('utf-8', { fatal: true }).decode(body.bytes);
        const value = raw.length > 0 ? JSON.parse(raw) : {};
        return { ok: true, value: value ?? {}, tooLarge: false };
    } catch {
        return { ok: false, value: undefined, tooLarge: false };
    }
}
