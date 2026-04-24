import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, User, AuthResponse } from '../services/auth';

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (username: string, password: string, totpCode?: string, backupCode?: string) => Promise<void>;
    loginWithToken: (data: AuthResponse) => void;
    register: (username: string, password: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
    updateProfile: (username: string) => Promise<void>;
    changePassword: (current: string, newPass: string) => Promise<void>;
    deleteAccount: (password: string) => Promise<void>;
    needsSetup2FA: boolean;
    clearSetup2FA: () => void;
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
    const [needsSetup2FA, setNeedsSetup2FA] = useState(() => localStorage.getItem('needs_setup_2fa') === 'true');

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

    const login = async (username: string, password: string, totpCode?: string, backupCode?: string) => {
        const data = await authService.login(username, password, totpCode, backupCode);
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        if (data.needsSetup2FA) {
            setNeedsSetup2FA(true);
            localStorage.setItem('needs_setup_2fa', 'true');
        } else {
            setNeedsSetup2FA(false);
            localStorage.removeItem('needs_setup_2fa');
        }
    };

    const loginWithToken = (data: AuthResponse) => {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        // Passkey login always counts as completing 2FA
        setNeedsSetup2FA(false);
        localStorage.removeItem('needs_setup_2fa');
    };

    const register = async (username: string, password: string) => {
        const data = await authService.register(username, password);
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        setNeedsSetup2FA(true);
        localStorage.setItem('needs_setup_2fa', 'true');
    };

    const clearSetup2FA = () => {
        setNeedsSetup2FA(false);
        localStorage.removeItem('needs_setup_2fa');
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        setNeedsSetup2FA(false);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('needs_setup_2fa');
    };

    const updateProfile = async (username: string) => {
        if (!token) return;
        const data = await authService.updateProfile(token, username);
        const updatedUser = { ...user!, username: data.username };
        setUser(updatedUser);
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
    };

    const changePassword = async (current: string, newPass: string) => {
        if (!token) return;
        await authService.changePassword(token, current, newPass);
    };

    const deleteAccount = async (password: string) => {
        if (!token) return;
        await authService.deleteAccount(token, password);
        logout();
    };

    return (
        <AuthContext.Provider value={{ user, token, login, loginWithToken, register, logout, isLoading, updateProfile, changePassword, deleteAccount, needsSetup2FA, clearSetup2FA }}>
            {children}
        </AuthContext.Provider>
    );
};
