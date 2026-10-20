import { apiEndpoint, apiErrorFrom } from './apiClient';

export interface F2fKey {
    id: string;
    fingerprint: string;
    publicKey: string;
    status: 'active' | 'retired' | 'revoked' | string;
    createdAt: number;
}

export interface F2fStatus {
    registered: boolean;
    cohort?: {
        id: string;
        state: string;
        memberCount: number;
        totalSeats: number;
    };
    seat?: number;
    key?: F2fKey | null;
    escrow?: {
        publicKey: string;
        fingerprint: string;
    } | null;
}

export interface F2fMemberKey {
    fingerprint: string;
    publicKey: string;
    status: 'active' | 'retired' | string;
    createdAt: number;
}

export interface F2fMember {
    seat: number;
    username: string;
    keys: F2fMemberKey[];
}

async function request<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await fetch(apiEndpoint(path), {
        method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        headers: {
            Authorization: `Bearer ${token}`,
            ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    if (!response.ok) {
        throw await apiErrorFrom(response);
    }
    return (await response.json()) as T;
}

export const f2fService = {
    status: (token: string) => request<F2fStatus>(token, '/api/f2f/status'),
    upload: (token: string, publicKey: string, fingerprint: string) =>
        request<{ cohort_id: string; seat: number; key_id: string; fingerprint: string; status: string }>(
            token,
            '/api/f2f/keys',
            { body: { public_key: publicKey, fingerprint } },
        ),
    retire: (token: string, keyId: string) =>
        request<{ ok: true; status: string }>(token, '/api/f2f/keys/retire', {
            body: { key_id: keyId },
        }),
    revoke: (token: string, keyId: string) =>
        request<{ ok: true; status: string }>(token, '/api/f2f/keys/revoke', {
            body: { key_id: keyId },
        }),
    createCliCode: (token: string) =>
        request<{ code: string; expires_at: number }>(token, '/api/f2f/cli/codes', {
            method: 'POST',
        }),
    members: async (token: string, cohortId: string) => {
        const result = await request<{ cohort: { id: string; state: string }; members: F2fMember[] }>(
            token,
            `/api/f2f/cohorts/${cohortId}/members`,
        );
        return result.members;
    },
    keyring: async (token: string, cohortId: string) => {
        const response = await fetch(apiEndpoint(`/api/f2f/cohorts/${cohortId}/keyring`), {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
            throw await apiErrorFrom(response);
        }
        return response.text();
    },
};
