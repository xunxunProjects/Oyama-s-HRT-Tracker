import { ApiError, apiErrorFrom, apiFetch } from './apiClient';

type AdminReauthPrompt = (adminToken: string) => Promise<string | null>;

let promptHandler: AdminReauthPrompt | null = null;
let cached: { adminToken: string; token: string; expiresAt: number } | null = null;
let inFlight: Promise<string | null> | null = null;

/**
 * The admin page registers the password line once. Keeping the prompt here
 * lets every admin service call ask for re-authentication without threading a
 * callback through each one.
 */
export function setAdminReauthPrompt(handler: AdminReauthPrompt | null): void {
    promptHandler = handler;
}

function reauthRequiredResponse(): Response {
    return new Response(
        JSON.stringify({
            code: 'ADMIN_REAUTH_REQUIRED',
            message: 'Admin re-authentication required',
        }),
        {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        },
    );
}

async function getStepUpToken(adminToken: string, force = false): Promise<string | null> {
    if (!force && cached && cached.adminToken === adminToken && cached.expiresAt > Date.now()) {
        return cached.token;
    }
    if (!promptHandler) return null;
    if (inFlight) return inFlight;

    const handler = promptHandler;
    inFlight = (async () => {
        const password = await handler(adminToken);
        if (!password) return null;

        const res = await apiFetch('/api/admin/reauth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({ password }),
        });
        if (!res.ok) throw await apiErrorFrom(res);

        const body = (await res.json()) as { token?: unknown; expiresAt?: unknown };
        if (typeof body.token !== 'string') {
            throw new ApiError(500, 'INVALID_RESPONSE', 'Admin re-authentication returned no token');
        }
        const expiresAt = typeof body.expiresAt === 'number' ? body.expiresAt : Date.now() + 5 * 60 * 1000;
        cached = {
            adminToken,
            token: body.token,
            // Refresh a little before the server's deadline.
            expiresAt: expiresAt - 5_000,
        };
        return body.token;
    })().finally(() => {
        inFlight = null;
    });

    return inFlight;
}

function sendWithStepUp(adminToken: string, path: string, init: RequestInit, stepUp: string): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${adminToken}`);
    headers.set('X-Admin-Reauth', stepUp);
    return apiFetch(path, { ...init, headers });
}

/**
 * Perform an admin write. The first call in a few minutes asks for the admin
 * password once; the short-lived server token is cached in memory only. A
 * stale token is cleared and the request is retried once, so a password change
 * or a just-expired step-up does not lose the operator's action.
 */
export async function adminWrite(adminToken: string, path: string, init: RequestInit = {}): Promise<Response> {
    let stepUp = await getStepUpToken(adminToken);
    if (!stepUp) return reauthRequiredResponse();

    let response = await sendWithStepUp(adminToken, path, init, stepUp);
    if (response.status === 403) {
        const body = (await response
            .clone()
            .json()
            .catch(() => null)) as { code?: unknown } | null;
        if (body?.code === 'ADMIN_REAUTH_REQUIRED') {
            cached = null;
            stepUp = await getStepUpToken(adminToken, true);
            if (!stepUp) return reauthRequiredResponse();
            response = await sendWithStepUp(adminToken, path, init, stepUp);
        }
    }
    return response;
}
