import { describe, expect, it, vi } from 'vitest';
import {
    buildAnonPayUrl,
    createAnonPayInvoice,
    parseAnonPayInvoice,
    parseInvoiceRequest,
    parseTrocadorTrade,
    webhookKeyMatches,
} from '../src/server/trocador';

const PAYOUT = '83cW4PFAGbjT1RiP1q5HG2gcKWqZXG4DRGcyXvPDBzUmVxMi6LgXZGjZn8hLp6CT6hCzysxyiS6H9Ss8JqQGqmKE9neYCm9';

describe('parseInvoiceRequest', () => {
    it('normalises the ticker and keeps an explicit network', () => {
        expect(parseInvoiceRequest({ ticker: ' USDT ', network: 'TRC20' })).toEqual({
            ok: true,
            value: { ticker: 'usdt', network: 'TRC20' },
        });
    });

    it('rejects a missing ticker or network', () => {
        expect(parseInvoiceRequest({ ticker: '', network: 'Mainnet' }).ok).toBe(false);
        expect(parseInvoiceRequest({ ticker: 'btc', network: '  ' }).ok).toBe(false);
    });

    it('rejects characters that do not belong in a ticker', () => {
        expect(parseInvoiceRequest({ ticker: 'btc<script>', network: 'Mainnet' }).ok).toBe(false);
    });
});

describe('buildAnonPayUrl', () => {
    it('builds an indirect donation invoice that pays out in Monero', () => {
        const url = new URL(
            buildAnonPayUrl({
                tickerFrom: 'btc',
                networkFrom: 'Mainnet',
                payoutAddress: PAYOUT,
                webhookUrl: 'https://tracker.example/api/donation/webhook',
                webhookKey: 'secret-key',
            }),
        );
        expect(url.origin).toBe('https://trocador.app');
        expect(url.pathname).toBe('/anonpay/');
        expect(url.searchParams.get('ticker_to')).toBe('xmr');
        expect(url.searchParams.get('network_to')).toBe('Mainnet');
        expect(url.searchParams.get('ticker_from')).toBe('btc');
        expect(url.searchParams.get('network_from')).toBe('Mainnet');
        expect(url.searchParams.get('address')).toBe(PAYOUT);
        expect(url.searchParams.get('donation')).toBe('True');
        expect(url.searchParams.get('editable')).toBe('True');
        expect(url.searchParams.get('remove_direct_pay')).toBe('True');
        expect(url.searchParams.get('min_kycrating')).toBe('A');
        expect(url.searchParams.get('direct')).toBe('False');
        expect(url.searchParams.get('webhook')).toBe('https://tracker.example/api/donation/webhook');
        expect(url.searchParams.get('webhook_key')).toBe('secret-key');
    });

    it('omits webhook parameters when no webhook is configured', () => {
        const url = new URL(
            buildAnonPayUrl({
                tickerFrom: 'eth',
                networkFrom: 'Mainnet',
                payoutAddress: PAYOUT,
                webhookUrl: '',
                webhookKey: '',
            }),
        );
        expect(url.searchParams.get('webhook')).toBeNull();
        expect(url.searchParams.get('webhook_key')).toBeNull();
    });
});

describe('parseAnonPayInvoice', () => {
    it('accepts the documented response shape', () => {
        expect(
            parseAnonPayInvoice({
                ID: 'CRHYXLH5Zr',
                url: 'https://trocador.app/anonpay/CRHYXLH5Zr',
                status_url: 'https://trocador.app/anonpay/status/CRHYXLH5Zr',
            }),
        ).toEqual({
            id: 'CRHYXLH5Zr',
            url: 'https://trocador.app/anonpay/CRHYXLH5Zr',
            statusUrl: 'https://trocador.app/anonpay/status/CRHYXLH5Zr',
        });
    });

    it('rejects a response that points somewhere else', () => {
        expect(
            parseAnonPayInvoice({
                ID: 'CRHYXLH5Zr',
                url: 'https://evil.example/anonpay/CRHYXLH5Zr',
            }),
        ).toBeNull();
    });

    it('rejects a missing or malformed id', () => {
        expect(parseAnonPayInvoice({ url: 'https://trocador.app/anonpay/CRHYXLH5Zr' })).toBeNull();
        expect(parseAnonPayInvoice({ ID: '../etc/passwd', url: 'https://trocador.app/anonpay/x' })).toBeNull();
    });
});

describe('parseTrocadorTrade', () => {
    it('reads the trade id and status from a webhook body', () => {
        expect(parseTrocadorTrade({ ID: 'CRHYXLH5Zr', status: 'Finished' })).toMatchObject({
            id: 'CRHYXLH5Zr',
            status: 'finished',
        });
    });

    it('rejects a body without a trade id', () => {
        expect(parseTrocadorTrade({ status: 'finished' })).toBeNull();
    });
});

describe('webhookKeyMatches', () => {
    it('compares the whole key', () => {
        expect(webhookKeyMatches('secret-key', 'secret-key')).toBe(true);
        expect(webhookKeyMatches('secret-kez', 'secret-key')).toBe(false);
        expect(webhookKeyMatches('', 'secret-key')).toBe(false);
        expect(webhookKeyMatches('secret-key', '')).toBe(false);
    });
});

describe('createAnonPayInvoice', () => {
    it('calls Trocador and parses the invoice', async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        ID: 'CRHYXLH5Zr',
                        url: 'https://trocador.app/anonpay/CRHYXLH5Zr',
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                ),
        );

        const invoice = await createAnonPayInvoice(
            {
                tickerFrom: 'btc',
                networkFrom: 'Mainnet',
                payoutAddress: PAYOUT,
                webhookUrl: '',
                webhookKey: '',
            },
            fetchMock as unknown as typeof fetch,
        );

        expect(invoice.id).toBe('CRHYXLH5Zr');
        expect(fetchMock).toHaveBeenCalledOnce();
        const requested = new URL(String(fetchMock.mock.calls.at(0)?.at(0)));
        expect(requested.searchParams.get('ticker_from')).toBe('btc');
    });

    it('throws when Trocador rejects the request', async () => {
        const fetchMock = vi.fn(async () => new Response('nope', { status: 502 }));
        await expect(
            createAnonPayInvoice(
                {
                    tickerFrom: 'btc',
                    networkFrom: 'Mainnet',
                    payoutAddress: PAYOUT,
                    webhookUrl: '',
                    webhookKey: '',
                },
                fetchMock as unknown as typeof fetch,
            ),
        ).rejects.toThrow('Trocador');
    });
});
