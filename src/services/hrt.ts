import { apiEndpoint, apiErrorFrom } from './apiClient';

export interface HrtStatus {
    holdUntil: number | null;
    blockedCount: number;
    passwordAdvice: boolean;
}

export interface HrtRequest {
    id: string;
    fingerprint: string;
    deviceName: string;
    country: string | null;
    ip: string | null;
    status: 'pending' | 'approved' | 'denied' | 'expired' | string;
    createdAt: number;
    expiresAt: number;
    approvedAt: number | null;
    deniedAt: number | null;
}

export interface HrtDevice {
    id: string;
    fingerprint: string;
    name: string;
    createdAt: number;
    lastSeenAt: number | null;
    expiresAt: number;
    revokedAt: number | null;
}

export interface HrtTrustedIp {
    id: string;
    ip: string | null;
    prefix: number;
    label: string;
    createdAt: number;
    lastUsedAt: number | null;
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

export const hrtService = {
    /** Public: whether this deployment has the hrt-tool pairing surface enabled. */
    capability: async (): Promise<boolean> => {
        try {
            const response = await fetch(apiEndpoint('/api/hrt/capability'), {
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) return false;
            const body = (await response.json()) as { supported?: unknown };
            return body.supported === true;
        } catch {
            return false;
        }
    },
    status: (token: string) => request<HrtStatus>(token, '/api/hrt/status'),
    requests: async (token: string) => (await request<{ requests: HrtRequest[] }>(token, '/api/hrt/requests')).requests,
    approve: (token: string, id: string, code: string) =>
        request<{ ok: true }>(token, `/api/hrt/requests/${id}/approve`, { body: { code } }),
    deny: (token: string, id: string) => request<{ ok: true }>(token, `/api/hrt/requests/${id}/deny`, { body: {} }),
    devices: async (token: string) => (await request<{ devices: HrtDevice[] }>(token, '/api/hrt/devices')).devices,
    revoke: (token: string, id: string) => request<{ ok: true }>(token, `/api/hrt/devices/${id}/revoke`, { body: {} }),
    trustedIps: async (token: string) =>
        (await request<{ trustedIps: HrtTrustedIp[] }>(token, '/api/hrt/trusted-ips')).trustedIps,
    addTrustedIp: (token: string, ip: string, label: string, password: string) =>
        request<{ ok: true }>(token, '/api/hrt/trusted-ips', { body: { ip, label, password } }),
    removeTrustedIp: (token: string, id: string) =>
        request<{ ok: true }>(token, `/api/hrt/trusted-ips/${id}`, { method: 'DELETE' }),
};
