/**
 * Trocador AnonPay invoices.
 *
 * Non-Monero donations are never paid to a project address. The worker creates
 * an indirect AnonPay invoice; Trocador's partner receives the donor's coin and
 * sends XMR to the project's payout subaddress. The payout address stays on the
 * server and is never returned by the public API.
 *
 * The invoice is deliberately `direct=False`: a shareable direct URL lets the
 * donor edit the address and amount, and it would also expose the payout
 * address. `remove_direct_pay=True` prevents a same-currency direct payment.
 */

export const ANONPAY_ENDPOINT = 'https://trocador.app/anonpay/';
export const ANONPAY_STATUS_PREFIX = 'https://trocador.app/anonpay/status/';
export const MIN_KYC_RATING = 'A';

export interface InvoiceRequest {
    ticker: string;
    network: string;
}

export type InvoiceRequestResult = { ok: true; value: InvoiceRequest } | { ok: false; error: string };

export interface AnonPayInvoiceInput {
    tickerFrom: string;
    networkFrom: string;
    payoutAddress: string;
    webhookUrl: string;
    webhookKey: string;
}

export interface AnonPayInvoice {
    id: string;
    url: string;
    statusUrl: string | null;
}

export interface TrocadorTrade {
    id: string;
    status: string;
    tickerFrom: string | null;
    networkFrom: string | null;
    amountFrom: string | null;
    amountTo: string | null;
}

const TICKER = /^[a-z0-9]{2,12}$/;
const NETWORK = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,31}$/;
const TRADE_ID = /^[A-Za-z0-9]{6,32}$/;

/**
 * Validate the public search input. The ticker is normalised to lower case;
 * the network is kept exactly as typed because Trocador distinguishes
 * `Mainnet`, `TRC20`, `ERC20` and other network names.
 */
export function parseInvoiceRequest(body: unknown): InvoiceRequestResult {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'Invalid JSON body' };
    }
    const raw = body as Record<string, unknown>;
    const ticker = typeof raw.ticker === 'string' ? raw.ticker.trim().toLowerCase() : '';
    const network = typeof raw.network === 'string' ? raw.network.trim() : '';

    if (!ticker || !TICKER.test(ticker)) {
        return { ok: false, error: 'Enter a ticker such as btc, eth or usdt' };
    }
    if (ticker === 'xmr') {
        return { ok: false, error: 'Use the direct Monero address instead' };
    }
    if (!network || !NETWORK.test(network)) {
        return { ok: false, error: 'Enter the network, for example Mainnet or TRC20' };
    }
    return { ok: true, value: { ticker, network } };
}

/** Build the indirect AnonPay URL. The API key never appears in the URL. */
export function buildAnonPayUrl(input: AnonPayInvoiceInput): string {
    const url = new URL(ANONPAY_ENDPOINT);
    const params = url.searchParams;
    params.set('ticker_to', 'xmr');
    params.set('network_to', 'Mainnet');
    params.set('address', input.payoutAddress);
    params.set('ticker_from', input.tickerFrom.trim().toLowerCase());
    params.set('network_from', input.networkFrom.trim());
    params.set('donation', 'True');
    params.set('editable', 'True');
    params.set('remove_direct_pay', 'True');
    params.set('min_kycrating', MIN_KYC_RATING);
    params.set('direct', 'False');
    params.set('fiat_equiv', 'USD');
    params.set('name', "Oyama's HRT Tracker");
    params.set('description', 'Donation, converted to Monero');
    if (input.webhookUrl) {
        params.set('webhook', input.webhookUrl);
        if (input.webhookKey) params.set('webhook_key', input.webhookKey);
    }
    return url.toString();
}

function validTrocadorUrl(value: unknown, id: string, status: boolean): string | null {
    if (typeof value !== 'string' || !value) return null;
    try {
        const url = new URL(value);
        if (url.origin !== 'https://trocador.app') return null;
        const expected = status ? `/anonpay/status/${id}` : `/anonpay/${id}`;
        if (url.pathname.replace(/\/$/, '') !== expected) return null;
        return url.toString();
    } catch {
        return null;
    }
}

/** Parse the indirect invoice response without trusting an arbitrary URL. */
export function parseAnonPayInvoice(body: unknown): AnonPayInvoice | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const raw = body as Record<string, unknown>;
    const id = typeof raw.ID === 'string' ? raw.ID.trim() : typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!TRADE_ID.test(id)) return null;

    const fallback = `https://trocador.app/anonpay/${id}`;
    const url = raw.url == null ? fallback : validTrocadorUrl(raw.url, id, false);
    if (!url) return null;
    const statusUrl = raw.status_url == null ? null : validTrocadorUrl(raw.status_url, id, true);
    if (raw.status_url != null && !statusUrl) return null;
    return { id, url, statusUrl };
}

export async function createAnonPayInvoice(
    input: AnonPayInvoiceInput,
    fetchImpl: typeof fetch = fetch,
): Promise<AnonPayInvoice> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
        const res = await fetchImpl(buildAnonPayUrl(input), {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Trocador rejected the invoice (${res.status})`);
        const body: unknown = await res.json().catch(() => null);
        const invoice = parseAnonPayInvoice(body);
        if (!invoice) throw new Error('Trocador returned an unexpected invoice');
        return invoice;
    } finally {
        clearTimeout(timer);
    }
}

function stringOrNull(value: unknown): string | null {
    if (typeof value === 'string') return value.trim() || null;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
}

function pick(raw: Record<string, unknown>, snake: string, camel: string): string | null {
    return stringOrNull(raw[snake] ?? raw[camel]);
}

/** Tolerant webhook body parser; the raw body is still stored for auditing. */
export function parseTrocadorTrade(body: unknown): TrocadorTrade | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const raw = body as Record<string, unknown>;
    const id = typeof raw.ID === 'string' ? raw.ID.trim() : typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!TRADE_ID.test(id)) return null;
    const statusRaw = typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : '';
    if (!/^[a-z][a-z ]{2,31}$/.test(statusRaw)) return null;
    return {
        id,
        status: statusRaw.replace(/\s+/g, ' '),
        tickerFrom: pick(raw, 'ticker_from', 'tickerFrom'),
        networkFrom: pick(raw, 'network_from', 'networkFrom'),
        amountFrom: pick(raw, 'amount_from', 'amountFrom'),
        amountTo: pick(raw, 'amount_to', 'amountTo'),
    };
}

/** Constant-time-ish comparison for the `Webhook-Key` header. */
export function webhookKeyMatches(provided: string | null, expected: string): boolean {
    if (!provided || !expected) return false;
    const a = new TextEncoder().encode(provided);
    const b = new TextEncoder().encode(expected);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}
