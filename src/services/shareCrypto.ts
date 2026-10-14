import { HRTMode } from '../../logic';
import { EncryptedShareSnapshot, sanitizeShareSnapshot } from '../../shareSnapshotSchema';

// End-to-end encryption for dosage share links.
//
// Each link gets its own random AES-256-GCM key. The key travels only in the
// link's fragment (`/share/#<token>.<key>`), which browsers never send to a
// server, so the service stores ciphertext it has no way to read. A live link
// also needs its key on the owner's other devices, so the key is sealed
// ("wrapped") with the owner's cloud backup key and stored next to the link:
// readable by any device that can read their backups, and by nothing else.

const subtle = (): SubtleCrypto => {
    const s = globalThis.crypto?.subtle;
    // Missing on a non-secure origin. Sharing stops rather than falling back
    // to a link the server could read.
    if (!s) throw new Error('SHARE_CRYPTO_UNAVAILABLE');
    return s;
};

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

const importAesKey = (raw: Uint8Array): Promise<CryptoKey> =>
    subtle().importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

const pipeThrough = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> =>
    new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());

/** A fresh link key, base64url so it sits in a URL fragment untouched. */
export function generateShareKey(): string {
    return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
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
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const sealed = await subtle().encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: SNAPSHOT_AAD },
        await importAesKey(fromBase64Url(key)),
        plain as BufferSource,
    );
    return { e2ee: 1, z, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(sealed)) };
}

/**
 * Open a sealed snapshot with the key from the link, then rebuild it through
 * the same check the server used to run on plaintext shares. Returns null for
 * a wrong or truncated key, tampered ciphertext, or a payload of the wrong shape.
 */
export async function decryptShareSnapshot(envelope: EncryptedShareSnapshot, key: string) {
    if (!isShareKey(key)) return null;
    try {
        const opened = await subtle().decrypt(
            { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) as BufferSource, additionalData: SNAPSHOT_AAD },
            await importAesKey(fromBase64Url(key)),
            base64ToBytes(envelope.data) as BufferSource,
        );
        let plain: Uint8Array = new Uint8Array(opened);
        if (envelope.z === 1) plain = await pipeThrough(plain, new DecompressionStream('gzip'));
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
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const sealed = await subtle().encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: WRAP_AAD },
        await importAesKey(base64ToBytes(cloudKeyB64)),
        new TextEncoder().encode(JSON.stringify({ k: key, mode })) as BufferSource,
    );
    return { cloud: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(sealed)) };
}

/** Null when this device's cloud key is not the one the link key was sealed with. */
export async function unwrapShareKey(
    wrapped: WrappedShareKey,
    cloudKeyB64: string,
): Promise<{ key: string; mode: HRTMode } | null> {
    try {
        const opened = await subtle().decrypt(
            { name: 'AES-GCM', iv: base64ToBytes(wrapped.iv) as BufferSource, additionalData: WRAP_AAD },
            await importAesKey(base64ToBytes(cloudKeyB64)),
            base64ToBytes(wrapped.data) as BufferSource,
        );
        const parsed = JSON.parse(new TextDecoder().decode(opened));
        if (!isShareKey(parsed?.k) || (parsed.mode !== 'transfem' && parsed.mode !== 'transmasc')) return null;
        return { key: parsed.k, mode: parsed.mode };
    } catch {
        return null;
    }
}
