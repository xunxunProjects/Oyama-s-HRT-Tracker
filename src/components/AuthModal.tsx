import React, { useState } from 'react';
import { X, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [needs2FA, setNeeds2FA] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const { login, register } = useAuth();

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (isLogin) {
                const result = await login(username, password, needs2FA ? totpCode : undefined);
                if (result.requires2FA) {
                    setNeeds2FA(true);
                    setLoading(false);
                    return;
                }
            } else {
                await register(username, password);
                // After successful registration and auto-login, refresh the page
                window.location.reload();
                return;
            }
            // Only executed for login
            onClose();
            resetForm();
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setUsername('');
        setPassword('');
        setTotpCode('');
        setNeeds2FA(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {needs2FA ? 'Two-Factor Authentication' : isLogin ? 'Sign In' : 'Create Account'}
                    </h2>
                    <button onClick={() => { onClose(); resetForm(); }} className="p-2 -mr-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
                            {error}
                        </div>
                    )}

                    {needs2FA ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                                <ShieldCheck size={20} className="text-indigo-500 shrink-0" />
                                <p className="text-sm text-indigo-700 dark:text-indigo-300">
                                    Enter the 6-digit code from your authenticator app.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">2FA Code</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="\d{6}"
                                    maxLength={6}
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center text-2xl tracking-[0.5em] font-mono"
                                    placeholder="000000"
                                    autoFocus
                                    required
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Username</label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                    placeholder="Enter username"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                    placeholder="Enter password"
                                    required
                                />
                            </div>
                        </>
                    )}

                    <button
                        type="submit"
                        disabled={loading || (needs2FA && totpCode.length !== 6)}
                        className="w-full py-2.5 mt-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        {needs2FA ? 'Verify' : isLogin ? 'Sign In' : 'Sign Up'}
                    </button>

                    {!needs2FA && (
                        <div className="pt-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
                            {isLogin ? "Don't have an account? " : "Already have an account? "}
                            <button
                                type="button"
                                onClick={() => { setIsLogin(!isLogin); setError(null); }}
                                className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                            >
                                {isLogin ? 'Sign up' : 'Sign in'}
                            </button>
                        </div>
                    )}

                    {needs2FA && (
                        <div className="pt-2 text-center">
                            <button
                                type="button"
                                onClick={() => { setNeeds2FA(false); setTotpCode(''); setError(null); }}
                                className="text-sm text-zinc-500 dark:text-zinc-400 hover:underline"
                            >
                                ← Back to login
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default AuthModal;
