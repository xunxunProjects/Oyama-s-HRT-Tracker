import { describe, expect, it } from 'vitest';
import { MAX_JSON_BODY_BYTES, readSmallJsonBody } from '../worker';

// readSmallJsonBody must stop reading once the body passes MAX_JSON_BODY_BYTES
// instead of buffering first and checking after. The chunked cases below fail
// if it ever regresses to request.text().

function stringRequest(body: string): Request {
    return new Request('https://example.com/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
}

function byteRequest(bytes: Uint8Array): Request {
    return new Request('https://example.com/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bytes,
    });
}

function chunkStream(chunks: Uint8Array[], onPull?: () => void): ReadableStream<Uint8Array> {
    let index = 0;
    return new ReadableStream<Uint8Array>({
        pull(controller) {
            onPull?.();
            if (index >= chunks.length) {
                controller.close();
                return;
            }
            controller.enqueue(chunks[index]);
            index += 1;
        },
    });
}

function streamRequest(stream: ReadableStream<Uint8Array>): Request {
    // Node's fetch implementation requires duplex: 'half' for streaming bodies;
    // workers-types does not declare it, hence the cast.
    return new Request('https://example.com/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: stream,
        duplex: 'half',
    } as unknown as RequestInit);
}

const encoder = new TextEncoder();

describe('readSmallJsonBody', () => {
    it('accepts a valid JSON body below the cap', async () => {
        const result = await readSmallJsonBody(stringRequest('{"a":1}'));
        expect(result.ok).toBe(true);
        expect(result.tooLarge).toBe(false);
        expect(result.value).toEqual({ a: 1 });
    });

    it('accepts a body of exactly 64 KiB', async () => {
        const payload = 'x'.repeat(MAX_JSON_BODY_BYTES - 8);
        const body = `{"a":"${payload}"}`;
        expect(encoder.encode(body).byteLength).toBe(MAX_JSON_BODY_BYTES);

        const result = await readSmallJsonBody(stringRequest(body));
        expect(result.ok).toBe(true);
        expect(result.tooLarge).toBe(false);
        expect(result.value.a.length).toBe(payload.length);
    });

    it('rejects a body one byte over 64 KiB', async () => {
        const body = `{"a":"${'x'.repeat(MAX_JSON_BODY_BYTES - 7)}"}`;
        expect(encoder.encode(body).byteLength).toBe(MAX_JSON_BODY_BYTES + 1);

        const result = await readSmallJsonBody(stringRequest(body));
        expect(result.ok).toBe(false);
        expect(result.tooLarge).toBe(true);
        expect(result.value).toBeUndefined();
    });

    it('stops reading a chunked oversized body without Content-Length', async () => {
        const chunks = Array.from({ length: 10 }, () => encoder.encode('x'.repeat(10 * 1024)));
        let pulls = 0;
        const request = streamRequest(
            chunkStream(chunks, () => {
                pulls += 1;
            }),
        );
        expect(request.headers.get('content-length')).toBeNull();

        const result = await readSmallJsonBody(request);
        expect(result.ok).toBe(false);
        expect(result.tooLarge).toBe(true);
        // 10 chunks would be 100 KiB; the cap is crossed after 7 of them, so the
        // remaining chunks must never be pulled into the handler.
        expect(pulls).toBeLessThan(chunks.length);
    });

    it('reports malformed JSON without marking it oversized', async () => {
        const result = await readSmallJsonBody(stringRequest('{"a":'));
        expect(result.ok).toBe(false);
        expect(result.tooLarge).toBe(false);
    });

    it('reports invalid UTF-8 as a malformed body', async () => {
        const result = await readSmallJsonBody(byteRequest(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])));
        expect(result.ok).toBe(false);
        expect(result.tooLarge).toBe(false);
    });

    it('treats a request without a body as an empty object', async () => {
        const result = await readSmallJsonBody(new Request('https://example.com/api/test', { method: 'POST' }));
        expect(result.ok).toBe(true);
        expect(result.value).toEqual({});
    });
});
