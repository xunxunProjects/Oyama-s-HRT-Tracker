import { SignJWT, jwtVerify } from 'jose';

import { hmacSha256Hex } from './totp';

const LOGIN_DEVICE_PASS_TTL = '90d';

const loginDeviceBinding = (jwtSecret: string, credential: string) =>
    hmacSha256Hex(jwtSecret, `login-device:${credential}`).then(hex => hex.slice(0, 32));

export async function signLoginDevicePass(jwtSecret: string, account: string, credential: string): Promise<string> {
    return new SignJWT({ purpose: 'login-device', account, pw: await loginDeviceBinding(jwtSecret, credential) })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(LOGIN_DEVICE_PASS_TTL)
        .sign(new TextEncoder().encode(jwtSecret));
}

export async function loginDevicePassValid(
    pass: unknown,
    jwtSecret: string,
    account: string,
    credentials: string[],
): Promise<boolean> {
    if (typeof pass !== 'string' || pass.length === 0 || credentials.length === 0) return false;
    try {
        const { payload } = await jwtVerify(pass, new TextEncoder().encode(jwtSecret), {
            algorithms: ['HS256'],
        });
        if (payload.purpose !== 'login-device' || payload.account !== account) return false;
        for (const credential of credentials) {
            if (payload.pw === (await loginDeviceBinding(jwtSecret, credential))) return true;
        }
        return false;
    } catch {
        return false;
    }
}
