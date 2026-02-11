export interface User {
    id: string;
    username: string;
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

    async register(username: string, password: string): Promise<AuthResponse> {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) throw new Error(await res.text());
        // Auto-login logic could be here, but usually register returns success or user/token
        // Based on original code, register calls login. 
        // We will keep them separate or chain them in the calling context? 
        // Original code: await login(username, password) inside register.
        // Let's replicate the API call only. The Context handles the chaining.
        // Wait, the worker register endpoint might just return "Created" or similar. 
        // Let's assume the Context will call login after register.
        return await this.login(username, password);
    }
};
