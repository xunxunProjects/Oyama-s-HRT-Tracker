// Event broadcast when the server reports that the current session is no
// longer valid (expired JWT, idle-revoked session, or signed-out elsewhere).
// AuthContext listens for this to clear the stale session and prompt re-login,
// instead of leaving the UI in a broken "logged-in but every request 401s"
// state.
export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

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
