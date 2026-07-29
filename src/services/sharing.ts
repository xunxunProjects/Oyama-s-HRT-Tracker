import { DoseEvent, HRTMode, SimulationResult } from '../../logic';
import { apiEndpoint, apiFetch } from './apiClient';

export interface SharedDosageSnapshot {
    version: 1;
    mode: HRTMode;
    timezone: string;
    createdAt: number;
    events: DoseEvent[];
    simulation: SimulationResult | null;
}

export interface ShareDetails {
    passwordRequired: boolean;
    live: boolean;
    createdAt: number;
    updatedAt: number;
    expiresAt: number | null;
    snapshot: SharedDosageSnapshot;
}

export interface CreatedShare {
    id: string;
    token: string;
    url: string;
    createdAt: number;
    expiresAt: number | null;
    passwordRequired: boolean;
    live: boolean;
    mode: HRTMode;
    updatedAt: number;
}

export interface LockedShare {
    passwordRequired: true;
    live: boolean;
    createdAt: number;
    updatedAt: number;
    expiresAt: number | null;
}

export interface ShareSummary {
    id: string;
    createdAt: number;
    expiresAt: number | null;
    passwordRequired: boolean;
    live: boolean;
    mode: HRTMode | null;
    updatedAt: number;
    expired: boolean;
}

export class ShareApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly retryAfterMs: number | null = null,
    ) {
        super(message);
        this.name = 'ShareApiError';
    }
}

const readError = async (response: Response): Promise<ShareApiError> => {
    let body: { code?: string; message?: string } | null = null;
    try {
        body = await response.json() as { code?: string; message?: string };
    } catch {
        // The worker also has plain-text error responses outside share routes.
    }
    const retryAfterSeconds = Number(response.headers.get('Retry-After'));
    return new ShareApiError(
        response.status,
        body?.code ?? 'SHARE_REQUEST_FAILED',
        body?.message ?? `Share request failed (${response.status})`,
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1_000
            : null,
    );
};

export const sharingService = {
    async create(
        authToken: string,
        snapshot: SharedDosageSnapshot,
        options: { password?: string; expiresAt: number; live?: boolean },
    ): Promise<CreatedShare> {
        const response = await apiFetch(apiEndpoint('/api/shares'), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                snapshot,
                password: options.password || undefined,
                expiresAt: options.expiresAt,
                live: options.live ?? false,
            }),
        });
        if (!response.ok) throw await readError(response);
        return await response.json() as CreatedShare;
    },

    async open(token: string): Promise<ShareDetails | LockedShare> {
        const response = await fetch(apiEndpoint('/api/shares/access'), {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({ token }),
        });
        if (response.status === 401) {
            const body = await response.json() as LockedShare & { code?: string };
            if (body.code === 'PASSWORD_REQUIRED' || body.passwordRequired) return body;
        }
        if (!response.ok) throw await readError(response);
        return await response.json() as ShareDetails;
    },

    async unlock(token: string, password: string): Promise<ShareDetails> {
        const response = await fetch(apiEndpoint('/api/shares/access'), {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({ token, password }),
        });
        if (!response.ok) throw await readError(response);
        return await response.json() as ShareDetails;
    },

    async list(authToken: string): Promise<ShareSummary[]> {
        const response = await apiFetch(apiEndpoint('/api/shares'), {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Accept': 'application/json',
            },
            cache: 'no-store',
        });
        if (!response.ok) throw await readError(response);
        const body = await response.json() as { shares: ShareSummary[] };
        return body.shares;
    },

    async syncLive(
        authToken: string,
        snapshot: SharedDosageSnapshot,
        signal?: AbortSignal,
    ): Promise<{ updated: number; updatedAt: number }> {
        const response = await apiFetch(apiEndpoint('/api/shares/live'), {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ snapshot }),
            signal,
        });
        if (!response.ok) throw await readError(response);
        return await response.json() as { updated: number; updatedAt: number };
    },

    async revoke(authToken: string, shareId: string): Promise<void> {
        const response = await apiFetch(apiEndpoint(`/api/shares/${encodeURIComponent(shareId)}`), {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` },
        });
        if (!response.ok) throw await readError(response);
    },
};

export const LIVE_SHARES_CHANGED_EVENT = 'hrt-live-shares-changed';

export const notifyLiveSharesChanged = (): void => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(LIVE_SHARES_CHANGED_EVENT));
};
