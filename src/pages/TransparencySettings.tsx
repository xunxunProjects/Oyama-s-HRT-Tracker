import { formatRelative } from '../utils/helpers';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

import { useTranslation } from '../contexts/LanguageContext';
import { apiEndpoint } from '../services/apiClient';

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

const rowBase = 'flex items-baseline justify-between py-[18px] border-b-(length:--hairline) border-[var(--border)]';

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

    const load = useCallback(
        async (signal?: AbortSignal) => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(apiEndpoint('/api/transparency'), { signal, cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as TransparencyStats;
                setStats(data);
                setLastUpdated(Date.now());
            } catch (e: any) {
                if (e.name === 'AbortError') return;
                setError(t('transparency.load_error'));
            } finally {
                setLoading(false);
            }
        },
        [t],
    );

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

    // Until figures have actually arrived (still loading, or the load failed)
    // every number is a dash: a 0 here would read as "nobody uses this" and
    // could be screenshotted as fact.
    const fig = (v: number | undefined) => (stats ? (v ?? 0).toLocaleString() : '–');

    return (
        <div className="md:pb-32">
            {/* Header */}
            <PageHeader onBack={onBack} title={t('transparency.title')} />

            {lastUpdated && (
                <p className="px-6 md:px-8 text-xs tabular-nums text-[var(--text-muted)] mb-6">
                    {t('transparency.last_updated').replace('{t}', new Date(lastUpdated).toLocaleTimeString())}
                </p>
            )}

            <div className={PAGE_COLUMN}>
                {error && (
                    <div className="mt-2 mb-4 flex items-center justify-between gap-4">
                        <p className="text-sm text-[var(--danger)]">{error}</p>
                        <button onClick={() => load()} disabled={loading} className="btn-secondary shrink-0">
                            {t('transparency.retry')}
                        </button>
                    </div>
                )}

                {/* Stats */}
                <div>
                    <div className={rowBase}>
                        <span className="text-sm text-[var(--text)]">{t('transparency.stat.total_users')}</span>
                        <span className="text-[1.625rem] font-semibold text-[var(--text)] tabular-nums">
                            {fig(stats?.total_users)}
                        </span>
                    </div>

                    <div className={rowBase}>
                        <span className="text-sm text-[var(--text)]">{t('transparency.stat.total_backups')}</span>
                        <span className="text-[1.625rem] font-semibold text-[var(--text)] tabular-nums">
                            {fig(stats?.total_backups)}
                        </span>
                    </div>

                    <div className={rowBase}>
                        <div>
                            <p className="text-sm text-[var(--text)]">{t('transparency.stat.new_users_24h')}</p>
                            <p className="text-xs tabular-nums text-[var(--text-muted)] mt-0.5">
                                {t('transparency.stat.new_users_7d').replace('{n}', fig(stats?.new_users_7d))}
                            </p>
                        </div>
                        <span className="text-[1.625rem] font-semibold text-[var(--text)] tabular-nums">
                            {fig(stats?.new_users_24h)}
                        </span>
                    </div>

                    <div className={rowBase}>
                        <div>
                            <p className="text-sm text-[var(--text)]">{t('transparency.stat.self_deleted')}</p>
                            <p className="text-xs tabular-nums text-[var(--text-muted)] mt-0.5">
                                {t('transparency.stat.delta_7d').replace('{n}', fig(stats?.self_deleted_7d))}
                            </p>
                        </div>
                        <span className="text-[1.625rem] font-semibold text-[var(--text)] tabular-nums">
                            {fig(stats?.self_deleted_count)}
                        </span>
                    </div>

                    <div className={`${rowBase} border-b-0`}>
                        <div>
                            <p className="text-sm text-[var(--text)]">{t('transparency.stat.admin_deleted')}</p>
                            <p className="text-xs tabular-nums text-[var(--text-muted)] mt-0.5">
                                {t('transparency.stat.delta_7d').replace('{n}', fig(stats?.admin_deleted_7d))}
                            </p>
                        </div>
                        <span className="text-[1.625rem] font-semibold text-[var(--text)] tabular-nums">
                            {fig(stats?.admin_deleted_count)}
                        </span>
                    </div>
                </div>

                {/* Recent registrations */}
                <h2 className="text-xl font-semibold text-[var(--text)] mt-10 mb-6">
                    {t('transparency.recent.title')}
                </h2>

                <div className="divide-y-(length:--hairline) divide-[var(--border)]">
                    {stats && (stats.recent_registrations ?? []).length === 0 ? (
                        <p className="py-6 text-sm text-center text-[var(--text-muted)]">
                            {t('transparency.recent.empty')}
                        </p>
                    ) : (
                        (stats?.recent_registrations ?? []).map((r, idx) => (
                            <div
                                key={`${r.anon_id}-${r.created_at}-${idx}`}
                                className="flex items-center justify-between py-3"
                            >
                                <span className="text-sm text-[var(--text)]">user_{r.anon_id}***</span>
                                <span className="text-xs text-[var(--text-muted)] tabular-nums">
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
