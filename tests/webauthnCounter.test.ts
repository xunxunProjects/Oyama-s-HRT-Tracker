import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { b64urlEncode, verifyPasskeyAssertion } from '../src/server/webauthn';

// A minimal, valid assertion for one P-256 credential. The counter is the only
// thing that changes between cases, so a failure isolates the counter rule.
const ORIGIN = 'https://example.com';
const RP_ID = 'example.com';
const CHALLENGE = 'a-real-challenge-value';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };

const assertion = (signCount: number) => {
    const rpIdHash = createHash('sha256').update(RP_ID).digest();
    const authData = Buffer.concat([rpIdHash, Buffer.from([0x01, 0, 0, 0, 0])]);
    authData.writeUInt32BE(signCount, 33);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: CHALLENGE, origin: ORIGIN }));
    const clientHash = createHash('sha256').update(clientDataJSON).digest();
    const signer = createSign('SHA256');
    signer.update(authData);
    signer.update(clientHash);
    return {
        clientDataJSON: b64urlEncode(clientDataJSON),
        authData: b64urlEncode(authData),
        signature: b64urlEncode(signer.sign(privateKey)),
    };
};

const verify = (storedCounter: number, signCount: number) => {
    const signed = assertion(signCount);
    return verifyPasskeyAssertion(
        signed.clientDataJSON,
        signed.authData,
        signed.signature,
        jwk.x,
        jwk.y,
        storedCounter,
        ORIGIN,
        RP_ID,
        CHALLENGE,
    );
};

describe('WebAuthn signature counter', () => {
    it('rejects a zero counter after a credential has reported a positive one', async () => {
        await expect(verify(5, 0)).rejects.toThrow('Counter not advancing');
    });

    it('rejects a repeated positive counter', async () => {
        await expect(verify(5, 5)).rejects.toThrow('Counter not advancing');
    });

    it('accepts a strictly increasing counter', async () => {
        await expect(verify(5, 6)).resolves.toBe(6);
    });

    it('accepts zero counters when the credential never supported them', async () => {
        await expect(verify(0, 0)).resolves.toBe(0);
    });
});
