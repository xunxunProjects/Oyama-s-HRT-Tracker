import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { Eye, RefreshCw, Loader2, X } from 'lucide-react';
import { useEscape } from '../hooks/useEscape';

interface TransparencyStats {
    total_users: number;
    total_backups: number;
    new_users_24h: number;
    new_users_7d: number;
    admin_deleted_count: number;
    self_deleted_count: number;
    admin_deleted_7d: number;
    self_deleted_7d: number;
    recent_registrations: { anon_id: string; created_at: number }[];
    server_time: number;
}

const REFRESH_INTERVAL_MS = 30_000;

function formatRelative(ts: number, now: number, t: (k: string) => string): string {
    const diff = Math.max(0, now - ts);
    if (diff < 60) return t('transparency.time.just_now');
    if (diff < 3600) return t('transparency.time.minutes').replace('{n}', String(Math.floor(diff / 60)));
    if (diff < 86400) return t('transparency.time.hours').replace('{n}', String(Math.floor(diff / 3600)));
    return t('transparency.time.days').replace('{n}', String(Math.floor(diff / 86400)));
}

const StatCard: React.FC<{
    label: string;
    value: number;
    hint?: string;
}> = ({ label, value, hint }) => {
    return (
        <div className="py-3 flex items-baseline justify-between gap-4">
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300 truncate">{label}</p>
                {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>}
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">
                {value.toLocaleString()}
            </p>
        </div>
    );
};

const TransparencyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const [stats, setStats] = useState<TransparencyStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const timerRef = useRef<number | null>(null);

    useEscape(onClose, isOpen);

    const load = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/transparency', { signal, cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as TransparencyStats;
            setStats(data);
            setLastUpdated(Date.now());
        } catch (e: any) {
            if (e.name === 'AbortError') return;
            setError(t('transparency.load_error'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        if (!isOpen) return;
        const ctrl = new AbortController();
        load(ctrl.signal);
        timerRef.current = window.setInterval(() => load(), REFRESH_INTERVAL_MS);
        return () => {
            ctrl.abort();
            if (timerRef.current) window.clearInterval(timerRef.current);
            timerRef.current = null;
        };
    }, [isOpen, load]);

    if (!isOpen) return null;

    const now = stats?.server_time ?? Math.floor(Date.now() / 1000);

    return (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-[60] p-0 md:p-4">
            <div className="w-full md:max-w-2xl safe-area-pb">
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-t-2xl md:rounded-2xl shadow-lg max-h-[88vh] overflow-y-auto">
                    {/* Header */}
                    <div className="sticky top-0 z-10 bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800 px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 rounded-lg">
                                <Eye size={18} />
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                    {t('transparency.title')}
                                </h3>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                    {lastUpdated
                                        ? t('transparency.last_updated').replace('{t}', new Date(lastUpdated).toLocaleTimeString())
                                        : t('transparency.loading')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => load()}
                                disabled={loading}
                                aria-label={t('transparency.refresh')}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
                            >
                                {loading
                                    ? <Loader2 size={16} className="animate-spin text-gray-500" />
                                    : <RefreshCw size={16} className="text-gray-500" />}
                            </button>
                            <button
                                onClick={onClose}
                                aria-label={t('btn.close') || 'Close'}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                            >
                                <X size={16} className="text-gray-500" />
                            </button>
                        </div>
                    </div>

                    <div className="p-5 space-y-5">
                        {error && (
                            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-3 text-sm text-red-700 dark:text-red-300">
                                {error}
                            </div>
                        )}

                        {/* Stats list */}
                        <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                            <StatCard
                                label={t('transparency.stat.total_users')}
                                value={stats?.total_users ?? 0}
                            />
                            <StatCard
                                label={t('transparency.stat.total_backups')}
                                value={stats?.total_backups ?? 0}
                            />
                            <StatCard
                                label={t('transparency.stat.new_users_24h')}
                                value={stats?.new_users_24h ?? 0}
                                hint={t('transparency.stat.new_users_7d').replace('{n}', String(stats?.new_users_7d ?? 0))}
                            />
                            <StatCard
                                label={t('transparency.stat.self_deleted')}
                                value={stats?.self_deleted_count ?? 0}
                                hint={t('transparency.stat.delta_7d').replace('{n}', String(stats?.self_deleted_7d ?? 0))}
                            />
                            <StatCard
                                label={t('transparency.stat.admin_deleted')}
                                value={stats?.admin_deleted_count ?? 0}
                                hint={t('transparency.stat.delta_7d').replace('{n}', String(stats?.admin_deleted_7d ?? 0))}
                            />
                        </div>

                        {/* Recent registrations */}
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                                {t('transparency.recent.title')}
                            </h4>
                            <div className="rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden divide-y divide-gray-100 dark:divide-neutral-800">
                                {(stats?.recent_registrations ?? []).length === 0 && !loading && (
                                    <div className="px-4 py-6 text-sm text-gray-400 text-center">
                                        {t('transparency.recent.empty')}
                                    </div>
                                )}
                                {(stats?.recent_registrations ?? []).map((r, idx) => (
                                    <div key={`${r.anon_id}-${r.created_at}-${idx}`}
                                        className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-neutral-900">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="font-mono text-xs px-2 py-1 rounded bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300">
                                                user_{r.anon_id}***
                                            </span>
                                        </div>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                                            {formatRelative(r.created_at, now, t)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TransparencyModal;
