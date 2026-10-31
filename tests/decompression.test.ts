import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { decompressData } from '../logic';

const encode = (text: string): string => Buffer.from(gzipSync(Buffer.from(text))).toString('base64');

describe('backup decompression', () => {
    it('opens a normal compressed backup', async () => {
        const text = JSON.stringify({ events: [] });
        expect(await decompressData(encode(text), 1024)).toBe(text);
    });

    it('rejects a backup that expands past the caller limit', async () => {
        await expect(decompressData(encode('A'.repeat(4096)), 1024)).rejects.toThrow(
            'decompressed output is too large',
        );
    });
});
