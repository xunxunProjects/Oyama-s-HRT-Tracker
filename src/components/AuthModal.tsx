import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
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
                await login(username, password);
            } else {
                await register(username, password);
                window.location.reload();
                return;
            }
            onClose();
            setUsername('');
            setPassword('');
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-sm overflow-hidden animate-m3-decelerate">
                <div className="flex items-center justify-between px-6 pt-6 pb-3">
                    <h2 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        {isLogin ? 'Sign In' : 'Create Account'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 -mr-1 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] rounded-[var(--radius-full)] hover:bg-[var(--color-m3-surface-container-highest)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-3">
                    {error && (
                        <div className="p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-[var(--radius-sm)] border border-red-200 dark:border-red-900/30">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-teal-400 transition-all text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]"
                            placeholder="Enter username"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-teal-400 transition-all text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]"
                            placeholder="Enter password"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 mt-1 text-sm bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] rounded-[var(--radius-full)] font-bold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[var(--shadow-m3-1)]"
                    >
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        {isLogin ? 'Sign In' : 'Sign Up'}
                    </button>

                    <div className="pt-2 text-center text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <button
                            type="button"
                            onClick={() => { setIsLogin(!isLogin); setError(null); }}
                            className="text-[var(--color-m3-primary)] dark:text-teal-400 font-bold hover:underline"
                        >
                            {isLogin ? 'Sign up' : 'Sign in'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AuthModal;
