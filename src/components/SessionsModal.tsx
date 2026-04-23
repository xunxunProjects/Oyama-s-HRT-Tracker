import React, { useState, useEffect } from 'react';
import { X, Monitor, Smartphone, Loader2, Trash2, LogOut, ShieldAlert } from 'lucide-react';
import { authService, Session } from '../services/auth';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';

interface SessionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    token: string;
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

const SessionsModal: React.FC<SessionsModalProps> = ({ isOpen, onClose, token }) => {
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

    useEffect(() => {
        if (isOpen) load();
    }, [isOpen]);

    if (!isOpen) return null;

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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-neutral-800">
                    <div className="flex items-center gap-2">
                        <ShieldAlert size={18} className="text-pink-600 dark:text-pink-400" />
                        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t('account.sessions')}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="max-h-[65vh] overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin text-gray-300" size={24} />
                        </div>
                    ) : sessions.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-10">{t('account.sessions_empty')}</p>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                            {sessions.map(s => {
                                const { label, isMobile } = parseDevice(s.device_info || '');
                                const isTerminating = terminating === s.id;
                                return (
                                    <div key={s.id} className={`flex items-start gap-3 px-5 py-4 ${s.is_current ? 'bg-pink-50/50 dark:bg-pink-900/10' : ''}`}>
                                        <div className={`mt-0.5 p-2 rounded-lg ${s.is_current ? 'bg-pink-100 dark:bg-pink-900/30' : 'bg-gray-100 dark:bg-neutral-800'}`}>
                                            {isMobile
                                                ? <Smartphone size={16} className={s.is_current ? 'text-pink-600 dark:text-pink-400' : 'text-gray-500 dark:text-gray-400'} />
                                                : <Monitor size={16} className={s.is_current ? 'text-pink-600 dark:text-pink-400' : 'text-gray-500 dark:text-gray-400'} />
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{label}</p>
                                                {s.is_current && (
                                                    <span className="shrink-0 text-[10px] font-bold bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
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

                {/* Footer */}
                {otherSessions.length > 1 && (
                    <div className="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-neutral-800">
                        <button
                            onClick={handleTerminateOthers}
                            disabled={terminating === 'others'}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
                        >
                            {terminating === 'others' ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
                            {t('account.sessions_terminate_others')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SessionsModal;
