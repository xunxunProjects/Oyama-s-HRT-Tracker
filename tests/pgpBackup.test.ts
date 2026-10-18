import { describe, it, expect, beforeAll } from 'vitest';
import * as openpgp from 'openpgp';
import {
    BACKUP_FORMAT,
    buildEnvelope,
    checkPublicKey,
    encryptBackup,
    groupFingerprint,
    isPgpMessage,
    sha256Hex,
    unwrapEnvelope,
} from '../src/utils/pgpBackup';

let publicKey: string;
let privateKey: string;

beforeAll(async () => {
    const pair = await openpgp.generateKey({
        type: 'curve25519',
        userIDs: [{ name: 'Test', email: 'test@example.com' }],
        format: 'armored',
    });
    publicKey = pair.publicKey;
    privateKey = pair.privateKey;
});

describe('checkPublicKey', () => {
    it('accepts a public key and reports its fingerprint', async () => {
        const res = await checkPublicKey(publicKey);
        expect(res.ok).toBe(true);
        if (!('reason' in res)) {
            const key = await openpgp.readKey({ armoredKey: publicKey });
            expect(res.fingerprint).toBe(key.getFingerprint().toUpperCase());
            expect(res.userId).toContain('test@example.com');
            expect(res.key).toMatch(/BEGIN PGP PUBLIC KEY BLOCK/);
        }
    });

    it('refuses a private key', async () => {
        expect(await checkPublicKey(privateKey)).toEqual({ ok: false, reason: 'private' });
    });

    it('refuses text that is not a key', async () => {
        expect(await checkPublicKey('hello')).toEqual({ ok: false, reason: 'unreadable' });
    });

    it('refuses a block holding two keys', async () => {
        const other = await openpgp.generateKey({ type: 'curve25519', userIDs: [{ name: 'B' }], format: 'object' });
        const a = await openpgp.readKey({ armoredKey: publicKey });
        const both = openpgp.armor(
            openpgp.enums.armor.publicKey,
            new Uint8Array([...a.write(), ...other.publicKey.write()]),
        );
        expect(await checkPublicKey(both)).toEqual({ ok: false, reason: 'many' });
    });

    it('refuses an expired key', async () => {
        const old = await openpgp.generateKey({
            type: 'curve25519',
            userIDs: [{ name: 'Old' }],
            date: new Date(Date.now() - 3 * 86400_000),
            keyExpirationTime: 86400,
            format: 'armored',
        });
        expect(await checkPublicKey(old.publicKey)).toEqual({ ok: false, reason: 'cannotEncrypt' });
    });
});

describe('encryptBackup', () => {
    it('round-trips through the private key and the envelope checks', async () => {
        const payload = JSON.stringify({ meta: { version: 2 }, events: [{ id: 'a' }] }, null, 2);
        const armored = await encryptBackup(payload, publicKey, '1.5.0');
        expect(isPgpMessage(armored)).toBe(true);
        expect(armored).not.toContain('"events"');

        const decrypted = await openpgp.decrypt({
            message: await openpgp.readMessage({ armoredMessage: armored }),
            decryptionKeys: await openpgp.readPrivateKey({ armoredKey: privateKey }),
        });
        const envelope = JSON.parse(decrypted.data as string);
        expect(envelope.format).toBe(BACKUP_FORMAT);
        expect(envelope.version).toBe(1);
        expect(envelope.app).toBe('1.5.0');
        expect(envelope.recipient).toBe(
            (await openpgp.readKey({ armoredKey: publicKey })).getFingerprint().toUpperCase(),
        );
        expect(unwrapEnvelope(envelope)).toBe(payload);
    });
});

describe('unwrapEnvelope', () => {
    const env = buildEnvelope('{"events":[]}', 'AB', '1.5.0');

    it('leaves a plain export alone', () => {
        expect(unwrapEnvelope({ events: [] })).toBeNull();
        expect(unwrapEnvelope([])).toBeNull();
    });

    it('refuses an edited payload', () => {
        expect(() => unwrapEnvelope({ ...env, payload: '{"events":[1]}' })).toThrow('backup-damaged');
    });

    it('refuses an unknown version', () => {
        expect(() => unwrapEnvelope({ ...env, version: 2 })).toThrow('backup-version');
    });

    it('hashes the UTF-8 bytes', () => {
        expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(env.payloadSha256).toBe(sha256Hex('{"events":[]}'));
    });
});

it('groups a fingerprint in fours', () => {
    expect(groupFingerprint('0123456789ABCDEF')).toBe('0123 4567 89AB CDEF');
});
