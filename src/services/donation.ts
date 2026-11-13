import { apiEndpoint, apiErrorFrom, apiFetch } from './apiClient';

export interface DonationConfig {
    /** The public direct-donation Monero subaddress. */
    monero: string | null;
    /** True when the server has a Trocador payout address configured. */
    trocador: boolean;
}

export interface DonationAddresses {
    monero: string;
    moneroPayout: string;
    updatedAt: number;
}

export interface DonationDraft {
    monero: string;
    moneroPayout: string;
}

export interface DonationInvoice {
    id: string;
    url: string;
}

export const donationService = {
    /** Public read. Unauthenticated by design: donors are not signed in. */
    async get(): Promise<DonationConfig> {
        const res = await fetch(apiEndpoint('/api/donation'));
        if (!res.ok) throw await apiErrorFrom(res);
        const body = (await res.json()) as {
            donation: { monero: string } | null;
            trocador?: boolean;
        };
        return {
            monero: body.donation?.monero ?? null,
            trocador: Boolean(body.trocador),
        };
    },

    /** Admin read. Returns empty strings before the operator fills them in. */
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

    /**
     * Create an indirect Trocador invoice. The payout address stays on the
     * server; the response is only the checkout id and URL.
     */
    async createInvoice(ticker: string, network: string): Promise<DonationInvoice> {
        const res = await apiFetch(apiEndpoint('/api/donation/invoice'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker, network }),
        });
        if (!res.ok) throw await apiErrorFrom(res);
        const body = (await res.json()) as { invoice: DonationInvoice };
        return body.invoice;
    },
};
