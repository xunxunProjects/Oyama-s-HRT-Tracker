import { DoseEvent, HRTMode, SimulationResult } from '../../logic';
import { apiFetch } from './apiClient';

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
    createdAt: number;
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
}

export interface LockedShare {
    passwordRequired: true;
    createdAt: number;
    expiresAt: number | null;
}

export interface ShareSummary {
    id: string;
    createdAt: number;
    expiresAt: number | null;
    passwordRequired: boolean;
    expired: boolean;
}

export class ShareApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
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
    return new ShareApiError(
        response.status,
        body?.code ?? 'SHARE_REQUEST_FAILED',
        body?.message ?? `Share request failed (${response.status})`,
    );
};

const apiEndpoint = (path: string): string => {
    if (typeof window === 'undefined') return path;
    return window.location.protocol === 'http:' || window.location.protocol === 'https:'
        ? path
        : `https://hrt.mahiro.uk${path}`;
};

export const sharingService = {
    async create(
        authToken: string,
        snapshot: SharedDosageSnapshot,
        options: { password?: string; expiresAt: number },
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

    async revoke(authToken: string, shareId: string): Promise<void> {
        const response = await apiFetch(apiEndpoint(`/api/shares/${encodeURIComponent(shareId)}`), {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` },
        });
        if (!response.ok) throw await readError(response);
    },
};
