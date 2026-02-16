export interface User {
    id: string;
    username: string;
    isAdmin?: boolean;
}

export interface AuthResponse {
    token: string;
    user: User;
}

export const authService = {
    async login(username: string, password: string): Promise<AuthResponse> {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) throw new Error(await res.text());
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
    }
};
