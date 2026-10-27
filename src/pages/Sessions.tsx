import React, { useState, useEffect } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { Monitor, Phone, Busy, Logout, Close, Alert, Retry } from '../components/icons';
import { authService, Session } from '../services/auth';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { SettingsIconBox, maskIpAddress, settingsMuted, settingsOn } from '../components/SettingsListItem';
import { formatRelative } from '../utils/helpers';

interface SessionsPageProps {
    token: string;
    onBack: () => void;
}

/**
 * Browser and OS out of a user agent. Both halves are product names and stay
 * as they are; only the "we couldn't tell" case is a word, so the caller
 * translates that one rather than this taking a `t` for a single string.
 */
function parseDevice(ua: string): { browser: string | null; os: string; isMobile: boolean } {
    const lower = ua.toLowerCase();
    const isMobile =
        lower.includes('mobile') || lower.includes('android') || lower.includes('iphone') || lower.includes('ipad');

    let browser: string | null = null;
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

    return { browser, os, isMobile };
}

const SessionsPage: React.FC<SessionsPageProps> = ({ token, onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    // One instant for every row, rather than each call reading its own clock.
    const nowSec = Math.floor(Date.now() / 1000);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(false);
    // The list could not be fetched. Said where the list goes, with a way to
    // try again, rather than in a dialog that left "No active sessions" behind
    // it: never true for someone signed in, since this device is one.
    const [failed, setFailed] = useState(false);
    const [terminating, setTerminating] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            setSessions(await authService.listSessions(token));
            setFailed(false);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const handleTerminate = (sid: string) => {
        showDialog(
            'confirm',
            t('account.sessions_terminate_confirm'),
            async () => {
                setTerminating(sid);
                try {
                    await authService.terminateSession(token, sid);
                    setSessions(prev => prev.filter(s => s.id !== sid));
                } catch {
                    showDialog('alert', t('account.sessions_terminate_failed'));
                } finally {
                    setTerminating(null);
                }
            },
            { danger: true, title: t('session.sign_out_device'), confirmLabel: t('account.sign_out') },
        );
    };

    const handleTerminateOthers = () => {
        showDialog(
            'confirm',
            t('account.sessions_terminate_all_confirm'),
            async () => {
                setTerminating('others');
                try {
                    await authService.terminateOtherSessions(token);
                    setSessions(prev => prev.filter(s => s.is_current));
                } catch {
                    showDialog('alert', t('account.sessions_terminate_failed'));
                } finally {
                    setTerminating(null);
                }
            },
            { danger: true, title: t('account.sessions_terminate_others'), confirmLabel: t('account.sign_out') },
        );
    };

    const otherSessions = sessions.filter(s => !s.is_current);
    const divider = 'border-b border-[var(--border)]';

    return (
        <div className="relative pb-32">
            <PageHeader onBack={onBack} title={t('account.sessions')} subtitle={t('account.sessions_desc')} />

            <div className={`${PAGE_COLUMN} mt-2`}>
                {loading ? (
                    <div className="flex justify-center py-16">
                        <Busy className={`animate-spin ${settingsMuted}`} size={20} />
                    </div>
                ) : failed ? (
                    <div className="flex flex-col items-center gap-2 py-14 text-center">
                        <p role="alert" className={`flex items-center gap-1.5 text-sm ${settingsMuted}`}>
                            <Alert size={15} className="shrink-0 text-[var(--warning)]" />
                            {t('account.sessions_fetch_failed')}
                        </p>
                        <button type="button" onClick={load} className="btn-ghost btn-ghost-accent tap-target">
                            <Retry size={14} />
                            {t('account.retry')}
                        </button>
                    </div>
                ) : sessions.length === 0 ? (
                    <p className={`text-sm ${settingsMuted} text-center py-14`}>{t('account.sessions_empty')}</p>
                ) : (
                    <div>
                        {sessions.map(s => {
                            const { browser, os, isMobile } = parseDevice(s.device_info || '');
                            const browserLabel = browser ?? t('session.unknown_browser');
                            const isTerminating = terminating === s.id;
                            const DeviceIcon = isMobile ? Phone : Monitor;

                            return (
                                <div key={s.id} className={`flex items-start gap-3 py-4 ${divider}`}>
                                    <SettingsIconBox icon={DeviceIcon} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-2">
                                            <p className={`min-w-0 truncate text-sm font-medium ${settingsOn}`}>
                                                {browserLabel}
                                            </p>
                                            {s.is_current && (
                                                <span className="shrink-0 text-xs font-medium text-[var(--accent-ink)]">
                                                    {t('account.sessions_current')}
                                                </span>
                                            )}
                                        </div>
                                        {os && <p className={`mt-0.5 text-xs ${settingsMuted}`}>{os}</p>}
                                        <p className={`mt-1 font-mono text-xs tracking-wide ${settingsMuted}`}>
                                            {maskIpAddress(s.ip)}
                                        </p>
                                        <p className={`mt-0.5 text-xs ${settingsMuted}`}>
                                            <span className="block">
                                                {t('account.sessions_last_used')}{' '}
                                                {formatRelative(s.last_used_at, nowSec, t)}
                                            </span>
                                            <span className="block">
                                                {t('account.sessions_created')}{' '}
                                                {formatRelative(s.created_at, nowSec, t)}
                                            </span>
                                        </p>
                                    </div>
                                    {!s.is_current && (
                                        <button
                                            onClick={() => handleTerminate(s.id)}
                                            disabled={isTerminating || terminating === 'others'}
                                            aria-label={t('session.sign_out_device')}
                                            title={t('session.sign_out_device')}
                                            className={`tap-target shrink-0 mt-1 p-1.5 rounded-md ${settingsMuted} hover:text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors`}
                                        >
                                            {isTerminating ? (
                                                <Busy size={15} strokeWidth={1.5} className="animate-spin" />
                                            ) : (
                                                <Close size={15} strokeWidth={1.5} />
                                            )}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {otherSessions.length > 1 && (
                    <button
                        onClick={handleTerminateOthers}
                        disabled={terminating === 'others'}
                        className={`w-full flex items-center justify-center gap-2 py-3.5 mt-2 text-sm font-medium ${settingsMuted} hover:text-[var(--text)] disabled:opacity-50 transition-colors`}
                    >
                        {terminating === 'others' ? (
                            <Busy size={15} strokeWidth={1.5} className="animate-spin" />
                        ) : (
                            <Logout size={15} strokeWidth={1.5} />
                        )}
                        {t('account.sessions_terminate_others')}
                    </button>
                )}
            </div>
        </div>
    );
};

export default SessionsPage;
