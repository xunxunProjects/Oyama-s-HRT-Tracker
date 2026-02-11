import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, User } from '../services/auth';

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const storedUser = localStorage.getItem('auth_user');
        if (token && storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (e) {
                console.error("Failed to parse user", e);
                logout();
            }
        }
        setIsLoading(false);
    }, [token]);

    const login = async (username: string, password: string) => {
        const data = await authService.login(username, password);
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
    };

    const register = async (username: string, password: string) => {
        await authService.register(username, password);
        // Login is already handled inside authService.register in my implementation above?
        // Wait, I implemented authService.register to call this.login.
        // So it returns AuthResponse.
        // But here we need to update state.
        // Let's actually adjust. In the Context, we called `await login(username, password)` at the end of register.
        // If authService.register returns AuthResponse (from chaining login), we can just use that.

        // Actually, let's keep it simple.
        // My authService.register calling this.login returns a promise.
        // It returns AuthResponse.
        const data = await authService.register(username, password);
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
    };

    return (
        <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};
