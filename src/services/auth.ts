export interface User {
    id: string;
    username: string;
    isAdmin?: boolean;
}

export interface AuthResponse {
    token: string;
    user: User;
}

export interface Session {
    id: string;
    user_id: string;
    created_at: number;
    last_used_at: number;
    device_info: string;
    ip: string;
    is_current: boolean;
}

export interface TwoFAStatus {
    enabled: boolean;
}

export interface TwoFASetup {
    secret: string;
    uri: string;
}

export interface Passkey {
    id: string;
    credential_id: string;
    device_name: string | null;
    created_at: number;
}

// Serialise an ArrayBuffer (or BufferSource) to base64url without padding
function ab2b64url(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Decode a base64url string to an ArrayBuffer
function b64url2ab(s: string): ArrayBuffer {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - b64.length % 4) % 4;
    const binary = atob(b64 + '='.repeat(pad));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

export function serializeAttestationCredential(credential: PublicKeyCredential): object {
    const r = credential.response as AuthenticatorAttestationResponse;
    return {
        id: credential.id,
        rawId: ab2b64url(credential.rawId),
        response: {
            clientDataJSON: ab2b64url(r.clientDataJSON),
            attestationObject: ab2b64url(r.attestationObject),
        },
        type: credential.type,
    };
}

export function serializeAssertionCredential(credential: PublicKeyCredential): object {
    const r = credential.response as AuthenticatorAssertionResponse;
    return {
        id: credential.id,
        rawId: ab2b64url(credential.rawId),
        response: {
            clientDataJSON: ab2b64url(r.clientDataJSON),
            authenticatorData: ab2b64url(r.authenticatorData),
            signature: ab2b64url(r.signature),
            userHandle: r.userHandle ? ab2b64url(r.userHandle) : null,
        },
        type: credential.type,
    };
}

export { b64url2ab };

export const authService = {
    async login(username: string, password: string, totpCode?: string): Promise<AuthResponse> {
        const body: { username: string; password: string; totp_code?: string } = { username, password };
        if (totpCode) body.totp_code = totpCode;
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const text = await res.text();
            let data: any;
            try { data = JSON.parse(text); } catch { /* ignore */ }
            if (data?.needs2FA) {
                const err = new Error('2FA_REQUIRED') as any;
                err.needs2FA = true;
                err.method = data.method ?? 'totp';
                throw err;
            }
            throw new Error(text);
        }
        return await res.json() as AuthResponse;
    },

    async register(username: string, password: string): Promise<void> {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) throw new Error(await res.text());
        // Registration successful, return void
        // Auto-login will be handled separately by the caller
    },

    async updateProfile(token: string, username: string): Promise<{ username: string }> {
        const res = await fetch('/api/user/profile', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ username })
        });
        if (!res.ok) throw new Error(await res.text());
        return await res.json();
    },

    async changePassword(token: string, current: string, newPass: string): Promise<void> {
        const res = await fetch('/api/user/password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ currentPassword: current, newPassword: newPass })
        });
        if (!res.ok) throw new Error(await res.text());
    },

    async deleteAccount(token: string, password: string): Promise<void> {
        const res = await fetch('/api/user/me', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ password })
        });
        if (!res.ok) throw new Error(await res.text());
    },

    async listSessions(token: string): Promise<Session[]> {
        const res = await fetch('/api/user/sessions', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        return await res.json() as Session[];
    },

    async terminateSession(token: string, sessionId: string): Promise<void> {
        const res = await fetch(`/api/user/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
    },

    async terminateOtherSessions(token: string): Promise<void> {
        const res = await fetch('/api/user/sessions', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
    },

    async get2FAStatus(token: string): Promise<TwoFAStatus> {
        const res = await fetch('/api/user/2fa/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        return await res.json() as TwoFAStatus;
    },

    async setup2FA(token: string): Promise<TwoFASetup> {
        const res = await fetch('/api/user/2fa/setup', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        return await res.json() as TwoFASetup;
    },

    async enable2FA(token: string, secret: string, code: string): Promise<void> {
        const res = await fetch('/api/user/2fa/enable', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ secret, code })
        });
        if (!res.ok) throw new Error(await res.text());
    },

    async disable2FA(token: string, password: string, code: string): Promise<void> {
        const res = await fetch('/api/user/2fa', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ password, code })
        });
        if (!res.ok) throw new Error(await res.text());
    },

    async listPasskeys(token: string): Promise<Passkey[]> {
        const res = await fetch('/api/user/passkeys', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        return await res.json() as Passkey[];
    },

    async registerPasskeyOptions(token: string): Promise<any> {
        const res = await fetch('/api/user/passkey/register-options', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        return await res.json();
    },

    async registerPasskey(token: string, challengeToken: string, credential: object, deviceName?: string): Promise<void> {
        const res = await fetch('/api/user/passkey/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ challengeToken, credential, deviceName }),
        });
        if (!res.ok) throw new Error(await res.text());
    },

    async deletePasskey(token: string, id: string): Promise<void> {
        const res = await fetch(`/api/user/passkeys/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
    },

    async passkeyAuthOptions(username?: string): Promise<{ challengeToken: string; challenge: string; credentialIds: string[] }> {
        const res = await fetch('/api/auth/passkey-options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(username ? { username } : {}),
        });
        if (!res.ok) throw new Error(await res.text());
        return await res.json();
    },

    async passkeyAuthVerify(challengeToken: string, credential: object): Promise<AuthResponse> {
        const res = await fetch('/api/auth/passkey-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeToken, credential }),
        });
        if (!res.ok) throw new Error(await res.text());
        return await res.json() as AuthResponse;
    },
};
