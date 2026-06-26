// Event broadcast when the server reports that the current session is no
// longer valid (expired JWT, idle-revoked session, or signed-out elsewhere).
// AuthContext listens for this to clear the stale session and prompt re-login,
// instead of leaving the UI in a broken "logged-in but every request 401s"
// state.
export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

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
