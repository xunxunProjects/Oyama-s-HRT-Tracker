// AES-256-GCM and PBKDF2-SHA256 that also work on a plain-http origin.
//
// Browsers expose `crypto.subtle` only in a secure context (https, or
// localhost). A self-hosted copy opened over a LAN address like
// http://192.168.1.5:8080 has no `crypto.subtle`, so backups, encrypted
// exports and share links all stopped working there. `crypto.getRandomValues`
// is still available on any origin, so only the two primitives below need a
// stand-in: the audited @noble libraries, loaded only when Web Crypto is
// missing. Both paths produce byte-identical output (GCM ciphertext with the
// 16-byte tag appended), so data sealed on one opens on the other.

type Subtle = SubtleCrypto | undefined;

let forceFallback = false;

/** Tests only: run the @noble path even where Web Crypto exists. */
export function setCryptoFallbackForTests(on: boolean): void {
    forceFallback = on;
}

const webSubtle = (): Subtle => (forceFallback ? undefined : globalThis.crypto?.subtle);

/** Random bytes. Available on every origin, secure or not. */
export function randomBytes(length: number): Uint8Array {
    return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/** PBKDF2-HMAC-SHA256, returning `length` bytes. */
export async function pbkdf2Sha256(
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    length = 32,
): Promise<Uint8Array> {
    const subtle = webSubtle();
    if (subtle) {
        const material = await subtle.importKey('raw', password as BufferSource, { name: 'PBKDF2' }, false, [
            'deriveBits',
        ]);
        const bits = await subtle.deriveBits(
            { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
            material,
            length * 8,
        );
        return new Uint8Array(bits);
    }
    const [{ pbkdf2Async }, { sha256 }] = await Promise.all([
        import('@noble/hashes/pbkdf2.js'),
        import('@noble/hashes/sha2.js'),
    ]);
    // asyncTick yields to the page so the screen does not freeze while the
    // 600k rounds run.
    return pbkdf2Async(sha256, password, salt, { c: iterations, dkLen: length, asyncTick: 20 });
}

/** AES-GCM encrypt; returns ciphertext with the tag appended, as Web Crypto does. */
export async function aesGcmEncrypt(
    key: Uint8Array,
    iv: Uint8Array,
    plaintext: Uint8Array,
    aad?: Uint8Array,
): Promise<Uint8Array> {
    const subtle = webSubtle();
    if (subtle) {
        const k = await subtle.importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']);
        const params: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource };
        if (aad) params.additionalData = aad as BufferSource;
        return new Uint8Array(await subtle.encrypt(params, k, plaintext as BufferSource));
    }
    const { gcm } = await import('@noble/ciphers/aes.js');
    return gcm(key, iv, aad).encrypt(plaintext);
}

/** AES-GCM decrypt. Throws on a wrong key or tampered data, as Web Crypto does. */
export async function aesGcmDecrypt(
    key: Uint8Array,
    iv: Uint8Array,
    sealed: Uint8Array,
    aad?: Uint8Array,
): Promise<Uint8Array> {
    const subtle = webSubtle();
    if (subtle) {
        const k = await subtle.importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
        const params: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource };
        if (aad) params.additionalData = aad as BufferSource;
        return new Uint8Array(await subtle.decrypt(params, k, sealed as BufferSource));
    }
    const { gcm } = await import('@noble/ciphers/aes.js');
    return gcm(key, iv, aad).decrypt(sealed);
}
