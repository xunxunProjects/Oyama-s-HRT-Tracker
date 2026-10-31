import { describe, expect, it, vi } from 'vitest';
import {
    decryptShareSnapshot,
    encryptShareSnapshot,
    generateShareKey,
    MAX_DECOMPRESSED_SHARE_BYTES,
    parseShareFragment,
    shareUrlWithKey,
    unwrapShareKey,
    wrapShareKey,
} from '../src/services/shareCrypto';
import { sanitizeEncryptedShareSnapshot } from '../shareSnapshotSchema';
import { aesGcmEncrypt } from '../src/utils/cryptoCompat';

const snapshot = {
    version: 1,
    mode: 'transfem',
    timezone: 'Europe/Berlin',
    createdAt: 1_760_000_000_000,
    events: [
        { id: 'a', route: 'injection', timeH: 489_000, doseMG: 5, ester: 'EV', extras: {} },
        { id: 'b', route: 'sublingual', timeH: 489_024, doseMG: 2, ester: 'E2', extras: { sublingualTheta: 0.11 } },
    ],
    simulation: null,
};

const cloudKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const otherCloudKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));

describe('share link encryption', () => {
    it('opens with the key it was sealed with', async () => {
        const key = generateShareKey();
        const sealed = await encryptShareSnapshot(snapshot, key);
        expect(await decryptShareSnapshot(sealed, key)).toEqual(snapshot);
    });

    it('keeps the plaintext out of what the server stores', async () => {
        const sealed = await encryptShareSnapshot(snapshot, generateShareKey());
        const stored = JSON.stringify(sealed);
        expect(stored).not.toContain('Europe/Berlin');
        expect(stored).not.toContain('injection');
        expect(sanitizeEncryptedShareSnapshot(sealed).envelope).toEqual(sealed);
    });

    it('refuses a wrong, missing or truncated key', async () => {
        const key = generateShareKey();
        const sealed = await encryptShareSnapshot(snapshot, key);
        expect(await decryptShareSnapshot(sealed, generateShareKey())).toBeNull();
        expect(await decryptShareSnapshot(sealed, key.slice(0, 40))).toBeNull();
        expect(await decryptShareSnapshot(sealed, '')).toBeNull();
    });

    it('refuses ciphertext that was changed', async () => {
        const key = generateShareKey();
        const sealed = await encryptShareSnapshot(snapshot, key);
        const bytes = Uint8Array.from(atob(sealed.data), c => c.charCodeAt(0));
        bytes[0] ^= 1;
        const tampered = { ...sealed, data: btoa(String.fromCharCode(...bytes)) };
        expect(await decryptShareSnapshot(tampered, key)).toBeNull();
    });

    it('drops fields a snapshot should never carry', async () => {
        const key = generateShareKey();
        const sealed = await encryptShareSnapshot(
            { ...snapshot, username: 'someone', events: [{ ...snapshot.events[0], note: 'private' }] },
            key,
        );
        const opened = await decryptShareSnapshot(sealed, key);
        expect(opened).not.toHaveProperty('username');
        expect(opened?.events[0]).not.toHaveProperty('note');
    });

    it('rejects a payload of the wrong shape after decrypting', async () => {
        const key = generateShareKey();
        const sealed = await encryptShareSnapshot({ ...snapshot, mode: 'other' }, key);
        expect(await decryptShareSnapshot(sealed, key)).toBeNull();
    });

    it('refuses a compressed snapshot that expands past the decompression limit', async () => {
        const key = generateShareKey();
        // Zeroes compress to a tiny envelope but expand well past the maximum
        // snapshot size. The viewer must stop before buffering it all.
        const bomb = new Uint8Array(MAX_DECOMPRESSED_SHARE_BYTES + 1024);
        const compressed = new Uint8Array(
            await new Response(new Blob([bomb]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(),
        );
        const keyBytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
        const iv = new Uint8Array(12);
        const sealed = {
            e2ee: 1 as const,
            z: 1 as const,
            iv: btoa(String.fromCharCode(...iv)),
            data: btoa(
                String.fromCharCode(
                    ...(await aesGcmEncrypt(
                        keyBytes,
                        iv,
                        compressed,
                        new TextEncoder().encode('hrt-share-snapshot-v1'),
                    )),
                ),
            ),
        };
        expect(sanitizeEncryptedShareSnapshot(sealed).envelope).toEqual(sealed);

        let decompressedBytes = 0;
        const original = Response.prototype.arrayBuffer;
        (Response.prototype as any).arrayBuffer = async function (this: Response) {
            const buffer = await original.call(this);
            decompressedBytes = buffer.byteLength;
            return buffer;
        };
        try {
            expect(await decryptShareSnapshot(sealed, key)).toBeNull();
        } finally {
            (Response.prototype as any).arrayBuffer = original;
        }
        // Before the fix this was the full expansion.
        expect(decompressedBytes).toBe(0);
    });

    it('accepts output exactly at the limit and rejects one byte over', async () => {
        const key = generateShareKey();
        const sealed = await encryptShareSnapshot(snapshot, key);
        const exact = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
        expect(await decryptShareSnapshot(sealed, key, exact)).toEqual(snapshot);
        expect(await decryptShareSnapshot(sealed, key, exact - 1)).toBeNull();
    });

    it('rejects deeply nested JSON before parsing it', async () => {
        const key = generateShareKey();
        let deep: unknown = 1;
        for (let i = 0; i < 100; i++) deep = [deep];
        const sealed = await encryptShareSnapshot(deep, key);
        const parse = vi.spyOn(JSON, 'parse');
        try {
            expect(await decryptShareSnapshot(sealed, key)).toBeNull();
            expect(parse).not.toHaveBeenCalled();
        } finally {
            parse.mockRestore();
        }
    });
});

describe('live link keys', () => {
    it('unwrap with the cloud key that wrapped them, and nothing else', async () => {
        const key = generateShareKey();
        const wrapped = await wrapShareKey(key, 'transmasc', cloudKey);
        expect(await unwrapShareKey(wrapped, cloudKey)).toEqual({ key, mode: 'transmasc' });
        expect(await unwrapShareKey(wrapped, otherCloudKey)).toBeNull();
    });

    it('cannot be swapped for a share snapshot or the other way round', async () => {
        const key = generateShareKey();
        const wrapped = await wrapShareKey(key, 'transfem', cloudKey);
        // Same AES key bytes, different purpose: the associated data keeps them apart.
        const sameBytes = cloudKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        expect(await decryptShareSnapshot({ e2ee: 1, z: 0, iv: wrapped.iv, data: wrapped.data }, sameBytes)).toBeNull();
    });
});

describe('share link fragments', () => {
    it('round-trip the token and key', () => {
        const token = 'A'.repeat(43);
        const key = generateShareKey();
        const url = shareUrlWithKey(`https://example.org/share/#${token}`, key);
        expect(parseShareFragment(new URL(url).hash.slice(1))).toEqual({ token, key });
    });

    it('read a link from before encryption as token only', () => {
        expect(parseShareFragment('B'.repeat(43))).toEqual({ token: 'B'.repeat(43), key: null });
    });
});
