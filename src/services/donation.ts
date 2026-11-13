import { apiEndpoint, apiErrorFrom, apiFetch } from './apiClient';

export interface DonationAddresses {
    monero: string;
    bitcoin: string;
    /** The day the Bitcoin address was last rotated, or null. */
    bitcoinUpdatedAt: string | null;
    updatedAt: number;
}

export interface DonationDraft {
    monero: string;
    bitcoin: string;
    bitcoinUpdatedAt: string | null;
}

export const donationService = {
    /** Public read. Unauthenticated by design: donors are not signed in. */
    async get(): Promise<DonationAddresses | null> {
        const res = await fetch(apiEndpoint('/api/donation'));
        if (!res.ok) throw await apiErrorFrom(res);
        const body = (await res.json()) as { donation: DonationAddresses | null };
        return body.donation;
    },

    /** Admin read. Returns a draft even before both addresses are filled. */
    async getStored(token: string): Promise<DonationAddresses | null> {
        const res = await apiFetch(apiEndpoint('/api/admin/donation'), {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw await apiErrorFrom(res);
        const body = (await res.json()) as { donation: DonationAddresses | null };
        return body.donation;
    },

    async save(token: string, draft: DonationDraft): Promise<DonationAddresses | null> {
        const res = await apiFetch(apiEndpoint('/api/admin/donation'), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(draft),
        });
        if (!res.ok) throw await apiErrorFrom(res);
        const body = (await res.json()) as { donation: DonationAddresses | null };
        return body.donation;
    },
};
