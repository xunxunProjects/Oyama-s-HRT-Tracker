import { beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import worker, { type Env } from '../worker';
import { generateTOTPSecret, hotp } from '../src/server/totp';
import { d1, hasSqlite, migratedDatabase, type SqliteDatabase } from './sqliteD1';

// Security-sensitive account changes must prove the second factor, not only
// the password. A live session plus a password is not enough to replace the
// recovery codes, enrol a new passkey, remove an existing one, or change the
// password on an account that already has a second factor.

const JWT_SECRET = 'K7fQ2vRm9pLxT4wYzA6bC1dE8fG3hJ5n';
const PASSWORD = 'violet harbor tiny lantern';
const NEW_PASSWORD = 'cobalt meadow orange river';

let db: SqliteDatabase;
let env: Env;
let token = '';
let totpSecret = '';
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as Parameters<typeof worker.fetch>[2];

const call = async (
    path: string,
    init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
) => {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    const response = await worker.fetch(
        new Request(`https://example.com${path}`, {
            method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
            headers,
            ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        }),
        env,
        ctx,
    );
    const text = await response.text();
    return { response, body: text ? (JSON.parse(text) as Record<string, any>) : null };
};

const currentTotp = () => hotp(totpSecret, Math.floor(Date.now() / 30_000));

// Minimal CBOR encoder for the WebAuthn attestation object and COSE key the
// passkey route parses. Only the shapes this route accepts are supported.
const head = (major: number, length: number): number[] => {
    if (length < 24) return [(major << 5) | length];
    if (length < 256) return [(major << 5) | 24, length];
    throw new Error('test CBOR length too large');
};
const cborInt = (value: number): number[] => (value >= 0 ? head(0, value) : head(1, -1 - value));
const cborBytes = (value: Uint8Array): number[] => [...head(2, value.length), ...value];
const cborText = (value: string): number[] => {
    const bytes = new TextEncoder().encode(value);
    return [...head(3, bytes.length), ...bytes];
};
const cborMap = (entries: Array<[number[], number[]]>): number[] => {
    const out = head(5, entries.length);
    for (const [key, value] of entries) out.push(...key, ...value);
    return out;
};

const makeRegistration = async () => {
    const options = await call('/api/user/passkey/register-options', { method: 'POST', token });
    expect(options.response.status).toBe(200);
    const challenge = options.body!.challenge as string;
    const challengeToken = options.body!.challengeToken as string;
    const rpId = options.body!.rp.id as string;

    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
    const x = Uint8Array.from(Buffer.from(jwk.x!, 'base64url'));
    const y = Uint8Array.from(Buffer.from(jwk.y!, 'base64url'));

    const credentialId = crypto.getRandomValues(new Uint8Array(16));
    const clientDataJSON = Buffer.from(
        JSON.stringify({ type: 'webauthn.create', challenge, origin: 'https://example.com' }),
    ).toString('base64url');

    const coseKey = cborMap([
        [cborInt(1), cborInt(2)],
        [cborInt(3), cborInt(-7)],
        [cborInt(-1), cborInt(1)],
        [cborInt(-2), cborBytes(x)],
        [cborInt(-3), cborBytes(y)],
    ]);
    const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
    const authData = new Uint8Array([
        ...rpIdHash,
        0x41, // user present + attested credential data
        0,
        0,
        0,
        0, // signature counter
        ...new Uint8Array(16), // AAGUID
        (credentialId.length >> 8) & 0xff,
        credentialId.length & 0xff,
        ...credentialId,
        ...coseKey,
    ]);
    const attestationObject = Buffer.from(
        cborMap([
            [cborText('fmt'), cborText('none')],
            [cborText('attStmt'), cborMap([])],
            [cborText('authData'), cborBytes(authData)],
        ]),
    ).toString('base64url');

    return {
        challengeToken,
        credentialId: Buffer.from(credentialId).toString('base64url'),
        credential: {
            id: Buffer.from(credentialId).toString('base64url'),
            response: { clientDataJSON, attestationObject },
        },
    };
};

describe.skipIf(!hasSqlite)('second-factor step-up for account changes', () => {
    beforeEach(async () => {
        db = migratedDatabase();
        db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
            'user-1',
            'Alice',
            bcrypt.hashSync(PASSWORD, 4),
        );
        env = { DB: d1(db), JWT_SECRET } as unknown as Env;
        const login = await call('/api/login', { body: { username: 'Alice', password: PASSWORD } });
        token = login.body?.token as string;
        expect(token).not.toBe('');
        totpSecret = generateTOTPSecret();
        db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(totpSecret, 'user-1');
    });

    it('requires a current second factor before replacing backup codes', async () => {
        const refused = await call('/api/user/2fa/backup-codes/generate', {
            token,
            body: { password: PASSWORD },
        });
        expect(refused.response.status).toBe(403);
        expect(refused.body?.code).toBe('STEP_UP_REQUIRED');
        expect((db.prepare('SELECT COUNT(*) AS n FROM backup_codes').get() as { n: number }).n).toBe(0);

        const accepted = await call('/api/user/2fa/backup-codes/generate', {
            token,
            body: { password: PASSWORD, totp_code: await currentTotp() },
        });
        expect(accepted.response.status).toBe(200);
        expect(accepted.body?.codes).toHaveLength(8);
        expect((db.prepare('SELECT COUNT(*) AS n FROM backup_codes').get() as { n: number }).n).toBe(8);
    });

    it('requires a current second factor before changing the password', async () => {
        const refused = await call('/api/user/password', {
            token,
            body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
        });
        expect(refused.response.status).toBe(403);
        expect(refused.body?.code).toBe('STEP_UP_REQUIRED');
        const before = db.prepare('SELECT password_hash FROM users WHERE id = ?').get('user-1') as {
            password_hash: string;
        };
        expect(bcrypt.compareSync(PASSWORD, before.password_hash)).toBe(true);
        expect(bcrypt.compareSync(NEW_PASSWORD, before.password_hash)).toBe(false);

        const accepted = await call('/api/user/password', {
            token,
            body: {
                currentPassword: PASSWORD,
                newPassword: NEW_PASSWORD,
                totp_code: await currentTotp(),
            },
        });
        expect(accepted.response.status).toBe(200);
        const after = db.prepare('SELECT password_hash FROM users WHERE id = ?').get('user-1') as {
            password_hash: string;
        };
        expect(bcrypt.compareSync(NEW_PASSWORD, after.password_hash)).toBe(true);
    });

    it('requires a current second factor before deleting a passkey', async () => {
        db.prepare(
            'INSERT INTO passkeys (id, user_id, credential_id, public_key_x, public_key_y, counter, device_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run('passkey-1', 'user-1', 'credential-1', 'x', 'y', 0, 'test');

        const refused = await call('/api/user/passkeys/passkey-1', {
            method: 'DELETE',
            token,
            body: { password: PASSWORD },
        });
        expect(refused.response.status).toBe(403);
        expect(refused.body?.code).toBe('STEP_UP_REQUIRED');
        expect((db.prepare('SELECT COUNT(*) AS n FROM passkeys').get() as { n: number }).n).toBe(1);

        const accepted = await call('/api/user/passkeys/passkey-1', {
            method: 'DELETE',
            token,
            body: { password: PASSWORD, totp_code: await currentTotp() },
        });
        expect(accepted.response.status).toBe(200);
        expect((db.prepare('SELECT COUNT(*) AS n FROM passkeys').get() as { n: number }).n).toBe(0);
    });

    it('requires a current second factor before enrolling a new passkey', async () => {
        const registration = await makeRegistration();

        const refused = await call('/api/user/passkey/register', {
            token,
            body: {
                challengeToken: registration.challengeToken,
                credential: registration.credential,
                deviceName: 'attacker device',
                password: PASSWORD,
            },
        });
        expect(refused.response.status).toBe(403);
        expect(refused.body?.code).toBe('STEP_UP_REQUIRED');
        expect((db.prepare('SELECT COUNT(*) AS n FROM passkeys').get() as { n: number }).n).toBe(0);

        const accepted = await call('/api/user/passkey/register', {
            token,
            body: {
                challengeToken: registration.challengeToken,
                credential: registration.credential,
                deviceName: 'laptop',
                password: PASSWORD,
                totp_code: await currentTotp(),
            },
        });
        expect(accepted.response.status).toBe(201);
        expect((db.prepare('SELECT COUNT(*) AS n FROM passkeys').get() as { n: number }).n).toBe(1);
    });

    it('leaves password-only changes available when the account has no second factor', async () => {
        db.prepare('UPDATE users SET totp_secret = NULL WHERE id = ?').run('user-1');
        const accepted = await call('/api/user/password', {
            token,
            body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
        });
        expect(accepted.response.status).toBe(200);
        const after = db.prepare('SELECT password_hash FROM users WHERE id = ?').get('user-1') as {
            password_hash: string;
        };
        expect(bcrypt.compareSync(NEW_PASSWORD, after.password_hash)).toBe(true);
    });
});
