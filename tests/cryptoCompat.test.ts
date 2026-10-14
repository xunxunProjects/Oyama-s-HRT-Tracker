import { afterEach, describe, expect, it } from 'vitest';
import { decryptCloudPayload, decryptData, deriveCloudKey, encryptCloudPayload, encryptData } from '../logic';
import {
    decryptShareSnapshot,
    encryptShareSnapshot,
    generateShareKey,
    unwrapShareKey,
    wrapShareKey,
} from '../src/services/shareCrypto';
import { pbkdf2Sha256, setCryptoFallbackForTests } from '../src/utils/cryptoCompat';

// A self-host opened over plain http has no `crypto.subtle`, so the app falls
// back to @noble. Data made on one path has to open on the other: a backup
// written from a LAN address must still read on the https site, and back.

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

const withFallback = async <T>(on: boolean, run: () => Promise<T>): Promise<T> => {
    setCryptoFallbackForTests(on);
    try {
        return await run();
    } finally {
        setCryptoFallbackForTests(false);
    }
};

const snapshot = {
    version: 1,
    mode: 'transfem',
    timezone: 'Europe/Berlin',
    createdAt: 1_760_000_000_000,
    events: [{ id: 'a', route: 'injection', timeH: 489_000, doseMG: 5, ester: 'EV', extras: {} }],
    simulation: null,
};

const cloudKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

afterEach(() => setCryptoFallbackForTests(false));

describe('crypto without Web Crypto (plain-http self-host)', () => {
    it('matches the published PBKDF2-SHA256 test vector on both paths', async () => {
        // RFC 7914 section 11
        const expected =
            '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc' +
            '49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783';
        const enc = new TextEncoder();
        for (const fallback of [false, true]) {
            const out = await withFallback(fallback, () =>
                pbkdf2Sha256(enc.encode('passwd'), enc.encode('salt'), 1, 64),
            );
            expect(hex(out)).toBe(expected);
        }
    });

    it('derives the same cloud key on both paths', async () => {
        const web = await deriveCloudKey('correct horse', 'user-123');
        const noble = await withFallback(true, () => deriveCloudKey('correct horse', 'user-123'));
        expect(noble).toBe(web);
    }, 60_000);

    it('reads cloud backups across paths', async () => {
        const fromWeb = await encryptCloudPayload('{"events":[1]}', cloudKey);
        expect(await withFallback(true, () => decryptCloudPayload(fromWeb, cloudKey))).toBe('{"events":[1]}');

        const fromNoble = await withFallback(true, () => encryptCloudPayload('{"events":[2]}', cloudKey));
        expect(await decryptCloudPayload(fromNoble, cloudKey)).toBe('{"events":[2]}');
    });

    it('rejects a wrong key on the fallback path', async () => {
        const sealed = await encryptCloudPayload('secret', cloudKey);
        const wrong = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
        expect(await withFallback(true, () => decryptCloudPayload(sealed, wrong))).toBeNull();
    });

    it('opens password-protected exports across paths', async () => {
        const { data, password } = await withFallback(true, () => encryptData('export body'));
        expect(await decryptData(data, password)).toBe('export body');
    }, 60_000);

    it('opens share links and wrapped link keys across paths', async () => {
        const key = generateShareKey();
        const sealed = await withFallback(true, () => encryptShareSnapshot(snapshot, key));
        expect(await decryptShareSnapshot(sealed, key)).toEqual(snapshot);

        const fromWeb = await encryptShareSnapshot(snapshot, key);
        expect(await withFallback(true, () => decryptShareSnapshot(fromWeb, key))).toEqual(snapshot);

        const wrapped = await withFallback(true, () => wrapShareKey(key, 'transfem', cloudKey));
        expect(await unwrapShareKey(wrapped, cloudKey)).toEqual({ key, mode: 'transfem' });
    });
});
