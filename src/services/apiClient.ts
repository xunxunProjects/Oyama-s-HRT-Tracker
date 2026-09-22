// Event broadcast when the server reports that the current session is no
// longer valid (expired JWT, idle-revoked session, or signed-out elsewhere).
// AuthContext listens for this to clear the stale session and prompt re-login,
// instead of leaving the UI in a broken "logged-in but every request 401s"
// state.
export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

/**
 * A failed API call. `code` is what the worker put in its `{ code, message }`
 * body, so callers can tell a 2 MiB overflow from a rate limit from a full
 * database without matching on English text; `message` is that body's
 * human-readable line, or the raw text of a non-JSON error.
 *
 * `NETWORK` is minted client-side for a fetch that never got a response.
 */
export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly retryAfterMs: number | null = null,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/** Read a non-2xx response into an ApiError, whatever shape the body has. */
export async function apiErrorFrom(res: Response): Promise<ApiError> {
    const text = await res.text().catch(() => '');
    let code = `HTTP_${res.status}`;
    let message = text || res.statusText || `Request failed (${res.status})`;
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
            if (typeof parsed.code === 'string') code = parsed.code;
            if (typeof parsed.message === 'string') message = parsed.message;
        }
    } catch { /* plain-text body */ }
    const retryAfter = Number(res.headers.get('Retry-After'));
    return new ApiError(res.status, code, message, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null);
}

/** The code on an ApiError, or `NETWORK` for anything that never reached the server. */
export function apiErrorCode(err: unknown): string {
    return err instanceof ApiError ? err.code : 'NETWORK';
}

const configuredApiOrigin = (() => {
    const value = import.meta.env.VITE_API_ORIGIN?.trim();
    if (!value) return '';
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('VITE_API_ORIGIN must be an absolute HTTP(S) URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('VITE_API_ORIGIN must use HTTP or HTTPS');
    }
    return value.replace(/\/+$/, '');
})();

/**
 * Resolve an API path against an optional build-time origin. Normal web and
 * self-hosted builds default to same-origin requests. Desktop/custom-protocol
 * builds can set VITE_API_ORIGIN without embedding a production hostname in
 * application code.
 */
export function apiEndpoint(path: string): string {
    if (!path.startsWith('/')) throw new Error('API paths must start with "/"');
    return configuredApiOrigin ? `${configuredApiOrigin}${path}` : path;
}

/**
 * Thin wrapper around `fetch` for talking to our API.
 *
 * The worker tags session-level 401s (missing/expired/revoked token) with the
 * `X-Session-Invalid` header. Business-logic 401s — e.g. an incorrect password
 * on change-password / delete-account — are NOT tagged, so they flow through to
 * the caller untouched and never trigger a sign-out.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await fetch(input, init);
    if (res.status === 401 && res.headers.get('X-Session-Invalid') === '1') {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        }
    }
    return res;
}
