import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { decompressGzipWithLimit } from '../src/services/boundedDecompression';

const gzip = (text: string): Uint8Array => new Uint8Array(gzipSync(Buffer.from(text)));

describe('bounded gzip decompression', () => {
    it('returns the output when it is exactly at the limit', async () => {
        const output = await decompressGzipWithLimit(gzip('hello'), 5);
        expect(new TextDecoder().decode(output)).toBe('hello');
    });

    it('rejects the first byte over the limit', async () => {
        await expect(decompressGzipWithLimit(gzip('hello'), 4)).rejects.toThrow('decompressed output is too large');
    });

    it('applies the limit to the total output of concatenated gzip members', async () => {
        const input = new Uint8Array([...gzip('AAA'), ...gzip('BBB')]);
        await expect(decompressGzipWithLimit(input, 5)).rejects.toThrow('decompressed output is too large');
        const output = await decompressGzipWithLimit(input, 6);
        expect(new TextDecoder().decode(output)).toBe('AAABBB');
    });

    it('accepts a high-ratio payload that stays under the absolute limit by design', async () => {
        // This is the residual documented in the review: the defence is a
        // byte ceiling, not a compression-ratio ceiling. A viewer that keeps
        // reopening a live link must be stopped at the polling layer.
        const input = new Uint8Array(gzipSync(Buffer.alloc(4 * 1024 * 1024)));
        expect((4 * 1024 * 1024) / input.byteLength).toBeGreaterThan(1000);
        const output = await decompressGzipWithLimit(input, 8 * 1024 * 1024);
        expect(output.byteLength).toBe(4 * 1024 * 1024);
    });
});
