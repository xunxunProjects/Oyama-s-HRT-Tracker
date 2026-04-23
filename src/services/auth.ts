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
};
