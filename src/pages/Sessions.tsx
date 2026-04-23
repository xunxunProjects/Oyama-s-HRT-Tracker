import React, { useState, useEffect } from 'react';
import { ArrowLeft, Monitor, Smartphone, Loader2, Trash2, LogOut, ShieldAlert } from 'lucide-react';
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

    return (
        <div className="relative pt-6 pb-32">
            {/* Header */}
            <div className="px-6 md:px-10 mb-5">
                <div className="w-full p-4 rounded-lg bg-white dark:bg-neutral-900 flex items-center gap-3 border border-gray-200 dark:border-neutral-800 transition-all duration-300">
                    <button
                        onClick={onBack}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-md">
                            <ShieldAlert size={18} className="text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">{t('account.sessions')}</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.sessions_desc')}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-6 md:px-10 space-y-4">
                <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
                    {loading ? (
                        <div className="flex justify-center py-16">
                            <Loader2 className="animate-spin text-gray-300" size={24} />
                        </div>
                    ) : sessions.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-14">{t('account.sessions_empty')}</p>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                            {sessions.map(s => {
                                const { label, isMobile } = parseDevice(s.device_info || '');
                                const isTerminating = terminating === s.id;
                                return (
                                    <div
                                        key={s.id}
                                        className={`flex items-start gap-3 px-5 py-4 ${s.is_current ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}`}
                                    >
                                        <div className={`mt-0.5 p-2 rounded-lg ${s.is_current ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-gray-100 dark:bg-neutral-800'}`}>
                                            {isMobile
                                                ? <Smartphone size={16} className={s.is_current ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'} />
                                                : <Monitor size={16} className={s.is_current ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'} />
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{label}</p>
                                                {s.is_current && (
                                                    <span className="shrink-0 text-[10px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                                        {t('account.sessions_current')}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">{s.ip || '—'}</p>
                                            <p className="text-xs text-gray-400 dark:text-neutral-500">
                                                {t('account.sessions_last_used')}: {relativeTime(s.last_used_at)}
                                                {' · '}
                                                {t('account.sessions_created')}: {relativeTime(s.created_at)}
                                            </p>
                                        </div>
                                        {!s.is_current && (
                                            <button
                                                onClick={() => handleTerminate(s.id)}
                                                disabled={isTerminating || terminating === 'others'}
                                                className="shrink-0 mt-0.5 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-40"
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
                        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 bg-white dark:bg-neutral-900 transition-colors disabled:opacity-50"
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
