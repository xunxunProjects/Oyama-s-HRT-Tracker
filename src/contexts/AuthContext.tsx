import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authService, User, AuthResponse, rememberDevicePass, sessionIdFromToken } from '../services/auth';
import { cacheCloudKey, deriveAndCacheCloudKey, getCloudKey } from '../utils/cloudBackup';
import { rewrapLiveShareKeys } from '../services/sharing';
import { UNAUTHORIZED_EVENT } from '../services/apiClient';
import { useDialog } from './DialogContext';
import { useTranslation } from './LanguageContext';

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (username: string, password: string, totpCode?: string, backupCode?: string) => Promise<void>;
    /**
     * Adopt a session issued by something other than the password form — today
     * that is a passkey assertion. `verifiedPassword` is the password the server
     * has just accepted in the same sign-in, passed so the cloud key can be
     * derived from it; omit it and this device gets no key.
     */
    loginWithToken: (data: AuthResponse, verifiedPassword?: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    updateProfile: (username: string) => Promise<void>;
    changePassword: (current: string, newPass: string) => Promise<void>;
    deleteAccount: (password: string, code?: string, backupCode?: string) => Promise<void>;
    /** The signed-in account's password was below the strength floor at its last sign-in. */
    weakPassword: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { showDialog } = useDialog();
    const { t } = useTranslation();
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
    // Remembered across reloads until the password changes or the user signs out.
    const [weakPassword, setWeakPassword] = useState(() => localStorage.getItem('weak_password') === '1');
    const markWeakPassword = (weak: boolean) => {
        setWeakPassword(weak);
        if (weak) localStorage.setItem('weak_password', '1');
        else localStorage.removeItem('weak_password');
    };

    // Versions before 2FA became optional persisted a forced-setup flag; drop it.
    useEffect(() => {
        localStorage.removeItem('needs_setup_2fa');
    }, []);

    useEffect(() => {
        const storedUser = localStorage.getItem('auth_user');
        if (token && storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (e) {
                console.error('Failed to parse user', e);
                // The token itself is still live, so revoke it server-side.
                void logout();
            }
        }
    }, [token]);

    const login = async (username: string, password: string, totpCode?: string, backupCode?: string) => {
        const data = await authService.login(username, password, totpCode, backupCode);
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        rememberDevicePass(username, data.devicePass);
        await deriveAndCacheCloudKey(password, data.user.id);
        // Accounts made before the strength floor can still have a weak password.
        // Say so once at sign-in; the Account page keeps the reminder.
        markWeakPassword(!!data.passwordWeak);
        if (data.passwordWeak) {
            showDialog('alert', t('account.weak_password_body'), undefined, {
                title: t('account.weak_password_title'),
            });
        }
    };

    const loginWithToken = async (data: AuthResponse, verifiedPassword?: string) => {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        rememberDevicePass(data.user.username, data.devicePass);
        // A passkey proves who you are; it does not hand this device the
        // password the cloud key is derived from. When the passkey was only the
        // *second* factor the password is right here and the server has just
        // accepted it, so derive from it — otherwise every such sign-in left the
        // device keyless, sync stuck on `locked`, and the manual backup button
        // failing with nothing to explain why. A genuinely passwordless sign-in
        // has nothing to derive from and unlocks from the Account page instead.
        if (verifiedPassword) await deriveAndCacheCloudKey(verifiedPassword, data.user.id);
    };

    const register = async (username: string, password: string) => {
        const data = await authService.register(username, password);
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        rememberDevicePass(username, data.devicePass);
        markWeakPassword(false);
        await deriveAndCacheCloudKey(password, data.user.id);
    };

    // Clear this device's copy of the session. Split out so the forced sign-out
    // below can reuse it without trying to revoke a session the server has
    // already destroyed.
    const clearLocalSession = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        markWeakPassword(false);
        cacheCloudKey(null);
    };

    const logout = async () => {
        // Signing out is the one action a user takes precisely because they want
        // the credential to stop working, and it used to be local-only: the
        // session row survived, so the 7-day JWT kept passing the worker's
        // middleware and every request refreshed last_used_at, meaning the idle
        // timeout never fired either. Anyone who had copied the token out of
        // localStorage kept the account for a week. Best effort — a failed
        // request must never trap the user in a signed-in UI.
        const currentToken = localStorage.getItem('auth_token');
        const sid = sessionIdFromToken(currentToken);
        if (currentToken && sid) {
            try {
                await authService.terminateSession(currentToken, sid);
            } catch {
                /* revoke is best-effort */
            }
        }
        clearLocalSession();
    };

    // When the server reports the session is no longer valid, drop the stale
    // session and tell the user to sign in again — rather than leaving them on
    // a "logged-in" screen where every cloud request silently 401s. A ref keeps
    // the listener stable while always running the latest closure (current
    // language, latest logout).
    const onUnauthorizedRef = useRef<() => void>(() => {});
    onUnauthorizedRef.current = () => {
        // Already signed out — ignore so several concurrent 401s don't stack
        // multiple prompts.
        if (!localStorage.getItem('auth_token')) return;
        // The worker only sends X-Session-Invalid once the row is already gone,
        // so there is nothing left to revoke — just drop the local copy.
        clearLocalSession();
        showDialog('alert', t('auth.session_expired'));
    };
    useEffect(() => {
        const handler = () => onUnauthorizedRef.current();
        window.addEventListener(UNAUTHORIZED_EVENT, handler);
        return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
    }, []);

    const updateProfile = async (username: string) => {
        if (!token) return;
        const data = await authService.updateProfile(token, username);
        const updatedUser = { ...user!, username: data.username };
        setUser(updatedUser);
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
    };

    const changePassword = async (current: string, newPass: string) => {
        if (!token) return;
        const oldCloudKey = getCloudKey();
        await authService.changePassword(token, current, newPass);
        markWeakPassword(false);
        // Re-derive the cloud key for the new password. Backups made under the
        // old password become unreadable (this is what also stops an admin who
        // resets the password from decrypting them).
        if (user) await deriveAndCacheCloudKey(newPass, user.id);
        // Live share link keys are sealed with the cloud key too. Carry them
        // over, or every live link would stop updating. Best effort: the
        // password has already changed either way.
        const newCloudKey = getCloudKey();
        if (oldCloudKey && newCloudKey && oldCloudKey !== newCloudKey) {
            await rewrapLiveShareKeys(token, oldCloudKey, newCloudKey).catch(() => undefined);
        }
    };

    const deleteAccount = async (password: string, code?: string, backupCode?: string) => {
        if (!token) return;
        await authService.deleteAccount(token, password, code, backupCode);
        // The account delete already dropped every sessions row for this user.
        clearLocalSession();
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                login,
                loginWithToken,
                register,
                logout,
                updateProfile,
                changePassword,
                deleteAccount,
                weakPassword,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
