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
    }
};
