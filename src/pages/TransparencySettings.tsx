import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

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

const rowBase = "flex items-baseline justify-between py-[18px] border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]";

interface TransparencySettingsProps {
    onBack: () => void;
}

const TransparencySettings: React.FC<TransparencySettingsProps> = ({ onBack }) => {
    const { t } = useTranslation();
    const [stats, setStats] = useState<TransparencyStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const timerRef = useRef<number | null>(null);

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
        const ctrl = new AbortController();
        load(ctrl.signal);
        timerRef.current = window.setInterval(() => load(), REFRESH_INTERVAL_MS);
        return () => {
            ctrl.abort();
            if (timerRef.current) window.clearInterval(timerRef.current);
        };
    }, [load]);

    const now = stats?.server_time ?? Math.floor(Date.now() / 1000);

    return (
        <div className="pb-32">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-8 pt-8 pb-3 flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="flex items-center gap-3 -ml-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                >
                    <ArrowLeft size={18} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0" />
                    <span className="text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        {t('transparency.title')}
                    </span>
                </button>
                <button
                    onClick={() => load()}
                    disabled={loading}
                    className="p-1.5 rounded-lg text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] disabled:opacity-40"
                >
                    {loading
                        ? <Loader2 size={16} className="animate-spin" />
                        : <RefreshCw size={16} />}
                </button>
            </div>

            {lastUpdated && (
                <p className="px-6 md:px-8 text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-6">
                    {t('transparency.last_updated').replace('{t}', new Date(lastUpdated).toLocaleTimeString())}
                </p>
            )}

            <div className="px-6 md:px-8 max-w-2xl">
                {error && (
                    <p className="mb-4 text-sm text-red-500 dark:text-red-400">
                        {error}
                    </p>
                )}

                {/* Stats */}
                <h2 className="text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] mb-6">
                    {t('transparency.title')}
                </h2>

                <div>
                    <div className={rowBase}>
                        <span className="text-[15px] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                            {t('transparency.stat.total_users')}
                        </span>
                        <span className="text-2xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tabular-nums">
                            {(stats?.total_users ?? 0).toLocaleString()}
                        </span>
                    </div>

                    <div className={rowBase}>
                        <span className="text-[15px] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                            {t('transparency.stat.total_backups')}
                        </span>
                        <span className="text-2xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tabular-nums">
                            {(stats?.total_backups ?? 0).toLocaleString()}
                        </span>
                    </div>

                    <div className={rowBase}>
                        <div>
                            <p className="text-[15px] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                                {t('transparency.stat.new_users_24h')}
                            </p>
                            <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-0.5">
                                {t('transparency.stat.new_users_7d').replace('{n}', String(stats?.new_users_7d ?? 0))}
                            </p>
                        </div>
                        <span className="text-2xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tabular-nums">
                            {(stats?.new_users_24h ?? 0).toLocaleString()}
                        </span>
                    </div>

                    <div className={rowBase}>
                        <div>
                            <p className="text-[15px] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                                {t('transparency.stat.self_deleted')}
                            </p>
                            <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-0.5">
                                {t('transparency.stat.delta_7d').replace('{n}', String(stats?.self_deleted_7d ?? 0))}
                            </p>
                        </div>
                        <span className="text-2xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tabular-nums">
                            {(stats?.self_deleted_count ?? 0).toLocaleString()}
                        </span>
                    </div>

                    <div className={`${rowBase} border-b-0`}>
                        <div>
                            <p className="text-[15px] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                                {t('transparency.stat.admin_deleted')}
                            </p>
                            <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-0.5">
                                {t('transparency.stat.delta_7d').replace('{n}', String(stats?.admin_deleted_7d ?? 0))}
                            </p>
                        </div>
                        <span className="text-2xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tabular-nums">
                            {(stats?.admin_deleted_count ?? 0).toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* Recent registrations */}
                <h2 className="text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] mt-10 mb-6">
                    {t('transparency.recent.title')}
                </h2>

                <div className="divide-y divide-[var(--color-m3-outline-variant)] dark:divide-[var(--color-m3-dark-outline-variant)]">
                    {(stats?.recent_registrations ?? []).length === 0 && !loading ? (
                        <p className="py-6 text-sm text-center text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                            {t('transparency.recent.empty')}
                        </p>
                    ) : (
                        (stats?.recent_registrations ?? []).map((r, idx) => (
                            <div key={`${r.anon_id}-${r.created_at}-${idx}`} className="flex items-center justify-between py-3">
                                <span className="font-mono text-sm text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                                    user_{r.anon_id}***
                                </span>
                                <span className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] tabular-nums">
                                    {formatRelative(r.created_at, now, t)}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default TransparencySettings;
