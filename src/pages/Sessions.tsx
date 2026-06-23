import React, { useState, useEffect } from 'react';
import { ArrowLeft, Monitor, Smartphone, Loader2, Trash2, LogOut } from 'lucide-react';
import { authService, Session } from '../services/auth';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';

interface SessionsPageProps {
    token: string;
    onBack: () => void;
}

function parseDevice(ua: string): { label: string; isMobile: boolean } {
    const lower = ua.toLowerCase();
    const isMobile =
        lower.includes('mobile') ||
        lower.includes('android') ||
        lower.includes('iphone') ||
        lower.includes('ipad');

    let browser = 'Unknown Browser';
    if (lower.includes('edg')) browser = 'Edge';
    else if (lower.includes('chrome') && !lower.includes('edg')) browser = 'Chrome';
    else if (lower.includes('firefox')) browser = 'Firefox';
    else if (lower.includes('safari') && !lower.includes('chrome')) browser = 'Safari';

    let os = '';
    if (lower.includes('iphone')) os = 'iPhone';
    else if (lower.includes('ipad')) os = 'iPad';
    else if (lower.includes('android')) os = 'Android';
    else if (lower.includes('windows')) os = 'Windows';
    else if (lower.includes('mac os') || lower.includes('macos')) os = 'macOS';
    else if (lower.includes('linux')) os = 'Linux';

    return { label: os ? `${browser} · ${os}` : browser, isMobile };
}

function relativeTime(unixTs: number): string {
    const diff = Math.floor(Date.now() / 1000) - unixTs;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

const SessionsPage: React.FC<SessionsPageProps> = ({ token, onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(false);
    const [terminating, setTerminating] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            setSessions(await authService.listSessions(token));
        } catch {
            showDialog('alert', t('account.sessions_fetch_failed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleTerminate = (sid: string) => {
        showDialog('confirm', t('account.sessions_terminate_confirm'), async () => {
            setTerminating(sid);
            try {
                await authService.terminateSession(token, sid);
                setSessions(prev => prev.filter(s => s.id !== sid));
            } catch {
                showDialog('alert', t('account.sessions_terminate_failed'));
            } finally {
                setTerminating(null);
            }
        });
    };

    const handleTerminateOthers = () => {
        showDialog('confirm', t('account.sessions_terminate_all_confirm'), async () => {
            setTerminating('others');
            try {
                await authService.terminateOtherSessions(token);
                setSessions(prev => prev.filter(s => s.is_current));
            } catch {
                showDialog('alert', t('account.sessions_terminate_failed'));
            } finally {
                setTerminating(null);
            }
        });
    };

    const otherSessions = sessions.filter(s => !s.is_current);

    const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';

    return (
        <div className="relative pb-32">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-10 pt-8 pb-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 -ml-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                >
                    <ArrowLeft size={18} className={`${muted} shrink-0`} />
                    <span className="text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{t('account.sessions')}</span>
                </button>
                <p className={`text-sm ${muted} mt-1 ml-0.5`}>{t('account.sessions_desc')}</p>
            </div>

            <div className="px-6 md:px-10 mt-4 space-y-4 max-w-2xl">
                <div className="bg-[var(--color-m3-surface-bright)] dark:bg-[var(--color-m3-dark-surface-bright)] rounded-xl border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] overflow-hidden">
                    {loading ? (
                        <div className="flex justify-center py-16">
                            <Loader2 className={`animate-spin ${muted}`} size={22} />
                        </div>
                    ) : sessions.length === 0 ? (
                        <p className={`text-sm ${muted} text-center py-14`}>{t('account.sessions_empty')}</p>
                    ) : (
                        <div className="divide-y divide-[var(--color-m3-outline-variant)] dark:divide-[var(--color-m3-dark-outline-variant)]">
                            {sessions.map(s => {
                                const { label, isMobile } = parseDevice(s.device_info || '');
                                const isTerminating = terminating === s.id;
                                return (
                                    <div
                                        key={s.id}
                                        className={`flex items-start gap-3 px-5 py-4 ${s.is_current ? 'bg-[var(--color-m3-primary-container)]/40 dark:bg-[var(--color-m3-dark-surface-container)]/60' : ''}`}
                                    >
                                        <div className={`mt-0.5 p-2 rounded-lg ${s.is_current ? 'bg-[var(--color-m3-primary-container)] dark:bg-[var(--color-m3-dark-surface-container-high)]' : 'bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]'}`}>
                                            {isMobile
                                                ? <Smartphone size={16} className={s.is_current ? 'text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]' : muted} />
                                                : <Monitor size={16} className={s.is_current ? 'text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]' : muted} />
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <p className="text-sm font-medium text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] truncate">{label}</p>
                                                {s.is_current && (
                                                    <span className="shrink-0 text-[10px] font-semibold bg-[var(--color-m3-primary-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] text-[var(--color-m3-on-primary-container)] dark:text-[var(--color-m3-primary-light)] px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                                                        {t('account.sessions_current')}
                                                    </span>
                                                )}
                                            </div>
                                            <p className={`text-xs ${muted} mt-0.5`}>{s.ip || '—'}</p>
                                            <p className={`text-xs ${muted}`}>
                                                {t('account.sessions_last_used')}: {relativeTime(s.last_used_at)}
                                                {' · '}
                                                {t('account.sessions_created')}: {relativeTime(s.created_at)}
                                            </p>
                                        </div>
                                        {!s.is_current && (
                                            <button
                                                onClick={() => handleTerminate(s.id)}
                                                disabled={isTerminating || terminating === 'others'}
                                                className={`shrink-0 mt-0.5 p-1.5 rounded-lg ${muted} hover:text-red-500 dark:hover:text-red-400 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] disabled:opacity-40`}
                                            >
                                                {isTerminating ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {otherSessions.length > 1 && (
                    <button
                        onClick={handleTerminateOthers}
                        disabled={terminating === 'others'}
                        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-red-500 dark:text-red-400 disabled:opacity-50"
                    >
                        {terminating === 'others' ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
                        {t('account.sessions_terminate_others')}
                    </button>
                )}
            </div>
        </div>
    );
};

export default SessionsPage;
