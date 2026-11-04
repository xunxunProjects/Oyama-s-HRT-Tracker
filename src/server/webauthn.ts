import type { Env } from './env';

export function allowedPasskeyOrigins(url: URL, env: Env): Set<string> {
    const allowed = new Set<string>([url.origin]);
    if (url.protocol === 'http:') allowed.add(`https://${url.host}`);
    if (env.PUBLIC_APP_ORIGIN) {
        try {
            allowed.add(new URL(env.PUBLIC_APP_ORIGIN).origin);
        } catch {
            // Ignore malformed configuration.
        }
    }
    return allowed;
}

export function resolvePasskeyOrigin(request: Request, url: URL, env: Env): string | null {
    const origin = request.headers.get('Origin');
    if (!origin) return url.origin;
    return allowedPasskeyOrigins(url, env).has(origin) ? origin : null;
}

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (b64.length % 4)) % 4;
    return Uint8Array.from(atob(b64 + '='.repeat(pad)), c => c.charCodeAt(0));
}

export function b64urlEncode(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

export function decodeCBOR(bytes: Uint8Array): any {
    let offset = 0;
    function need(n: number): void {
        if (n < 0 || offset + n > bytes.length) throw new Error('CBOR: truncated input');
    }
    function readLen(info: number): number {
        if (info < 24) return info;
        if (info === 24) {
            need(1);
            return bytes[offset++];
        }
        if (info === 25) {
            need(2);
            const v = (bytes[offset] << 8) | bytes[offset + 1];
            offset += 2;
            return v;
        }
        if (info === 26) {
            need(4);
            const v =
                ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>>
                0;
            offset += 4;
            return v;
        }
        throw new Error('CBOR: unsupported length info ' + info);
    }
    function readValue(): any {
        need(1);
        const b = bytes[offset++];
        const major = b >> 5,
            info = b & 0x1f;
        if (major === 0) return readLen(info);
        if (major === 1) return -1 - readLen(info);
        if (major === 2) {
            const len = readLen(info);
            need(len);
            const sl = bytes.slice(offset, offset + len);
            offset += len;
            return sl;
        }
        if (major === 3) {
            const len = readLen(info);
            need(len);
            const sl = bytes.slice(offset, offset + len);
            offset += len;
            return new TextDecoder().decode(sl);
        }
        if (major === 4) {
            const len = readLen(info);
            need(len);
            return Array.from({ length: len }, () => readValue());
        }
        if (major === 5) {
            const len = readLen(info);
            need(len * 2);
            const map: any = {};
            for (let i = 0; i < len; i++) {
                const k = readValue();
                map[k] = readValue();
            }
            return map;
        }
        if (major === 7) {
            if (info === 20) return false;
            if (info === 21) return true;
            if (info === 22) return null;
        }
        throw new Error('CBOR: unsupported major ' + major);
    }
    return readValue();
}

export interface ParsedAuthData {
    rpIdHash: Uint8Array;
    flags: number;
    signCount: number;
    credentialId?: Uint8Array;
    publicKeyX?: Uint8Array;
    publicKeyY?: Uint8Array;
}

export function parseAuthData(auth: Uint8Array): ParsedAuthData {
    const rpIdHash = auth.slice(0, 32);
    const flags = auth[32];
    const signCount = ((auth[33] << 24) | (auth[34] << 16) | (auth[35] << 8) | auth[36]) >>> 0;
    let credentialId: Uint8Array | undefined, publicKeyX: Uint8Array | undefined, publicKeyY: Uint8Array | undefined;
    if (flags & 0x40) {
        let off = 37 + 16;
        const credIdLen = (auth[off] << 8) | auth[off + 1];
        off += 2;
        credentialId = auth.slice(off, off + credIdLen);
        off += credIdLen;
        const coseKey = decodeCBOR(auth.slice(off));
        if (coseKey[-2] instanceof Uint8Array) publicKeyX = coseKey[-2];
        if (coseKey[-3] instanceof Uint8Array) publicKeyY = coseKey[-3];
    }
    return { rpIdHash, flags, signCount, credentialId, publicKeyX, publicKeyY };
}

export function derSigToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
    if (der[0] !== 0x30) throw new Error('Not a DER sequence');
    let pos = 2;
    if (der[pos++] !== 0x02) throw new Error('Expected r INTEGER');
    const rLen = der[pos++];
    let r = der.slice(pos, pos + rLen);
    pos += rLen;
    if (der[pos++] !== 0x02) throw new Error('Expected s INTEGER');
    const sLen = der[pos++];
    let s = der.slice(pos, pos + sLen);
    if (r[0] === 0) r = r.slice(1);
    if (s[0] === 0) s = s.slice(1);
    const raw = new Uint8Array(64);
    raw.set(r, 32 - r.length);
    raw.set(s, 64 - s.length);
    return raw;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function verifyPasskeyAssertion(
    clientDataJSONb64: string,
    authenticatorDatab64: string,
    signatureb64: string,
    storedX: string,
    storedY: string,
    storedCounter: number,
    expectedOrigin: string,
    expectedRpId: string,
    expectedChallenge: string,
): Promise<number> {
    const clientData = JSON.parse(new TextDecoder().decode(b64urlDecode(clientDataJSONb64)));
    if (clientData.type !== 'webauthn.get') throw new Error('Wrong type');
    const received = clientData.challenge.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (received !== expectedChallenge.replace(/=/g, '')) throw new Error('Challenge mismatch');
    if (clientData.origin !== expectedOrigin) throw new Error('Origin mismatch');

    const authBytes = b64urlDecode(authenticatorDatab64);
    const { rpIdHash, flags, signCount } = parseAuthData(authBytes);
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expectedRpId)));
    if (!rpIdHash.every((v, i) => v === rpHash[i])) throw new Error('RP ID mismatch');
    if (!(flags & 1)) throw new Error('User presence not set');

    const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', b64urlDecode(clientDataJSONb64)));
    const sigBase = new Uint8Array(authBytes.length + clientHash.length);
    sigBase.set(authBytes);
    sigBase.set(clientHash, authBytes.length);

    const x = b64urlDecode(storedX),
        y = b64urlDecode(storedY);
    const uncompressed = new Uint8Array(65);
    uncompressed[0] = 0x04;
    uncompressed.set(x, 1);
    uncompressed.set(y, 33);
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        uncompressed,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
    );

    const rawSig = derSigToRaw(b64urlDecode(signatureb64));
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, rawSig, sigBase);
    if (!valid) throw new Error('Signature invalid');

    if (storedCounter > 0 && signCount > 0 && storedCounter >= signCount)
        throw new Error('Counter not advancing (cloned authenticator?)');
    return signCount;
}
