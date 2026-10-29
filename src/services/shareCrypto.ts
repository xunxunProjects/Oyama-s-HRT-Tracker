import { HRTMode } from '../../logic';
import { EncryptedShareSnapshot, sanitizeShareSnapshot } from '../../shareSnapshotSchema';
import { aesGcmDecrypt, aesGcmEncrypt, randomBytes } from '../utils/cryptoCompat';

// End-to-end encryption for dosage share links.
//
// Each link gets its own random AES-256-GCM key. The key travels only in the
// link's fragment (`/share/#<token>.<key>`), which browsers never send to a
// server, so the service stores ciphertext it has no way to read. A live link
// also needs its key on the owner's other devices, so the key is sealed
// ("wrapped") with the owner's cloud backup key and stored next to the link:
// readable by any device that can read their backups, and by nothing else.

// AES-GCM comes from cryptoCompat, so this also works on a plain-http
// self-host where the browser hides Web Crypto.

// Domain separation: the owner's cloud key also seals their backups, and a
// wrapped share key must never be mistaken for one, or the other way round.
const SNAPSHOT_AAD = new TextEncoder().encode('hrt-share-snapshot-v1');
const WRAP_AAD = new TextEncoder().encode('hrt-share-key-v1');

const SHARE_KEY_REGEX = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url

const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
};

const base64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

const toBase64Url = (bytes: Uint8Array): string =>
    bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (value: string): Uint8Array =>
    base64ToBytes(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4));

/**
 * Decompressed snapshots are not bounded by the ciphertext size: gzip can
 * expand a link-sized envelope hundreds of times over. Cap the output before
 * buffering it in the viewer's memory. The schema's largest legal snapshot is
 * about 14 MiB of JSON, so 20 MiB leaves room without accepting a bomb.
 */
export const MAX_DECOMPRESSED_SHARE_BYTES = 20 * 1024 * 1024;

const limitBytes = (limit: number): TransformStream<Uint8Array, Uint8Array> => {
    let total = 0;
    return new TransformStream({
        transform(chunk, controller) {
            total += chunk.byteLength;
            if (total > limit) {
                controller.error(new Error('share snapshot is too large'));
                return;
            }
            controller.enqueue(chunk);
        },
    });
};

const pipeThrough = async (
    bytes: Uint8Array,
    stream: CompressionStream | DecompressionStream,
    maxOutputBytes?: number,
): Promise<Uint8Array> => {
    let output: ReadableStream<Uint8Array> = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
    if (maxOutputBytes !== undefined) output = output.pipeThrough(limitBytes(maxOutputBytes));
    return new Uint8Array(await new Response(output).arrayBuffer());
};

/** A fresh link key, base64url so it sits in a URL fragment untouched. */
export function generateShareKey(): string {
    return toBase64Url(randomBytes(32));
}

export const isShareKey = (value: unknown): value is string => typeof value === 'string' && SHARE_KEY_REGEX.test(value);

/** The link a recipient opens: the server's token, then the key, both in the fragment. */
export const shareUrlWithKey = (serverUrl: string, key: string): string => `${serverUrl}.${key}`;

/** Split a share fragment into the server token and the link key, if it carries one. */
export function parseShareFragment(fragment: string): { token: string | null; key: string | null } {
    const [token = '', key = ''] = fragment.split('.', 2);
    return { token: token || null, key: key || null };
}

/** Seal a snapshot for one link. Compresses first where the browser can. */
export async function encryptShareSnapshot(snapshot: unknown, key: string): Promise<EncryptedShareSnapshot> {
    let plain: Uint8Array = new TextEncoder().encode(JSON.stringify(snapshot));
    let z: 0 | 1 = 0;
    if (typeof CompressionStream !== 'undefined') {
        plain = await pipeThrough(plain, new CompressionStream('gzip'));
        z = 1;
    }
    const iv = randomBytes(12);
    const sealed = await aesGcmEncrypt(fromBase64Url(key), iv, plain, SNAPSHOT_AAD);
    return { e2ee: 1, z, iv: bytesToBase64(iv), data: bytesToBase64(sealed) };
}

/**
 * Open a sealed snapshot with the key from the link, then rebuild it through
 * the same check the server used to run on plaintext shares. Returns null for
 * a wrong or truncated key, tampered ciphertext, or a payload of the wrong shape.
 */
export async function decryptShareSnapshot(envelope: EncryptedShareSnapshot, key: string) {
    if (!isShareKey(key)) return null;
    try {
        let plain: Uint8Array = await aesGcmDecrypt(
            fromBase64Url(key),
            base64ToBytes(envelope.iv),
            base64ToBytes(envelope.data),
            SNAPSHOT_AAD,
        );
        if (envelope.z === 1)
            plain = await pipeThrough(plain, new DecompressionStream('gzip'), MAX_DECOMPRESSED_SHARE_BYTES);
        return sanitizeShareSnapshot(JSON.parse(new TextDecoder().decode(plain))).snapshot ?? null;
    } catch {
        return null;
    }
}

export interface WrappedShareKey {
    cloud: 1;
    iv: string;
    data: string;
}

/** Seal a live link's key, and the mode it follows, with the owner's cloud key. */
export async function wrapShareKey(key: string, mode: HRTMode, cloudKeyB64: string): Promise<WrappedShareKey> {
    const iv = randomBytes(12);
    const sealed = await aesGcmEncrypt(
        base64ToBytes(cloudKeyB64),
        iv,
        new TextEncoder().encode(JSON.stringify({ k: key, mode })),
        WRAP_AAD,
    );
    return { cloud: 1, iv: bytesToBase64(iv), data: bytesToBase64(sealed) };
}

/** Null when this device's cloud key is not the one the link key was sealed with. */
export async function unwrapShareKey(
    wrapped: WrappedShareKey,
    cloudKeyB64: string,
): Promise<{ key: string; mode: HRTMode } | null> {
    try {
        const opened = await aesGcmDecrypt(
            base64ToBytes(cloudKeyB64),
            base64ToBytes(wrapped.iv),
            base64ToBytes(wrapped.data),
            WRAP_AAD,
        );
        const parsed = JSON.parse(new TextDecoder().decode(opened));
        if (!isShareKey(parsed?.k) || (parsed.mode !== 'transfem' && parsed.mode !== 'transmasc')) return null;
        return { key: parsed.k, mode: parsed.mode };
    } catch {
        return null;
    }
}
