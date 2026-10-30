import React, { useEffect, useState } from 'react';
import { Alert, Busy, Plus, Trash } from '../components/icons';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { useTranslation } from '../contexts/LanguageContext';
import { formatRelative } from '../utils/helpers';
import { hrtService, HrtDevice, HrtRequest, HrtStatus, HrtTrustedIp } from '../services/hrt';

interface HrtSecurityProps {
    token: string;
    onBack: () => void;
}

const card = 'rounded-xl border-(length:--hairline) border-[var(--border)] bg-[var(--surface)] p-4';
const heading = 'text-sm font-semibold text-[var(--text)]';
const muted = 'text-xs text-[var(--text-muted)]';
const input = 'input-base text-sm';
const button = 'rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40 transition-colors';
const primary = `${button} bg-[var(--accent-subtle)] text-[var(--on-accent-subtle)]`;
const secondary = `${button} bg-[var(--surface-hover)] text-[var(--text)]`;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const HrtSecurity: React.FC<HrtSecurityProps> = ({ token, onBack }) => {
    const { t } = useTranslation();
    const [status, setStatus] = useState<HrtStatus | null>(null);
    const [requests, setRequests] = useState<HrtRequest[]>([]);
    const [devices, setDevices] = useState<HrtDevice[]>([]);
    const [trustedIps, setTrustedIps] = useState<HrtTrustedIp[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [codes, setCodes] = useState<Record<string, string>>({});
    const [trustIp, setTrustIp] = useState('');
    const [trustLabel, setTrustLabel] = useState('');
    const [trustPassword, setTrustPassword] = useState('');
    const nowSec = Math.floor(Date.now() / 1000);

    const load = async () => {
        setLoading(true);
        try {
            const [nextStatus, nextRequests, nextDevices, nextTrusted] = await Promise.all([
                hrtService.status(token),
                hrtService.requests(token),
                hrtService.devices(token),
                hrtService.trustedIps(token),
            ]);
            setStatus(nextStatus);
            setRequests(nextRequests);
            setDevices(nextDevices);
            setTrustedIps(nextTrusted);
            setError(null);
        } catch (loadError) {
            setError(errorMessage(loadError));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const run = async (key: string, action: () => Promise<unknown>) => {
        setBusy(key);
        setError(null);
        try {
            await action();
            await load();
        } catch (actionError) {
            setError(errorMessage(actionError));
        } finally {
            setBusy(null);
        }
    };

    const approve = (id: string) => {
        const code = (codes[id] ?? '').trim();
        if (!code) {
            setError(t('hrt.code_required'));
            return;
        }
        return run(`approve:${id}`, async () => {
            await hrtService.approve(token, id, code);
            setCodes(previous => {
                const next = { ...previous };
                delete next[id];
                return next;
            });
        });
    };

    const addTrusted = () =>
        run('trusted:add', async () => {
            await hrtService.addTrustedIp(token, trustIp.trim(), trustLabel.trim(), trustPassword);
            setTrustIp('');
            setTrustLabel('');
            setTrustPassword('');
        });

    const holdActive = status?.holdUntil !== null && (status?.holdUntil ?? 0) > nowSec;
    const statusLabel = (value: string) =>
        t(
            value === 'approved'
                ? 'hrt.status_approved'
                : value === 'denied'
                  ? 'hrt.status_denied'
                  : value === 'expired'
                    ? 'hrt.status_expired'
                    : 'hrt.status_pending',
        );

    return (
        <div className="relative md:pb-32">
            <PageHeader onBack={onBack} title={t('hrt.title')} subtitle={t('hrt.subtitle')} />
            <div className={`${PAGE_COLUMN} mt-2 space-y-4`}>
                {loading ? (
                    <div className="flex justify-center py-16">
                        <Busy className="animate-spin text-[var(--text-muted)]" size={20} />
                    </div>
                ) : (
                    <>
                        {error && (
                            <div className={`${card} flex items-start gap-2 text-sm text-[var(--warning)]`}>
                                <Alert size={16} className="mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {holdActive && (
                            <div className={`${card} space-y-1`}>
                                <p className={heading}>{t('hrt.hold_title')}</p>
                                <p className={muted}>
                                    {t('hrt.hold_until').replace(
                                        '{time}',
                                        new Date((status?.holdUntil ?? 0) * 1000).toLocaleString(),
                                    )}
                                </p>
                                <p className={muted}>
                                    {t('hrt.blocked').replace('{count}', String(status?.blockedCount ?? 0))}
                                </p>
                                {status?.passwordAdvice && (
                                    <p className="text-xs text-[var(--warning)]">{t('hrt.password_advice')}</p>
                                )}
                            </div>
                        )}

                        <section className={card}>
                            <p className={heading}>{t('hrt.recent_title')}</p>
                            {requests.length === 0 ? (
                                <p className={`${muted} mt-2`}>{t('hrt.no_requests')}</p>
                            ) : (
                                <div className="mt-3 space-y-3">
                                    {requests.map(request => (
                                        <div
                                            key={request.id}
                                            className="rounded-lg border-(length:--hairline) border-[var(--border)] p-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-[var(--text)]">
                                                        {request.deviceName}
                                                    </p>
                                                    <p className={muted}>
                                                        {request.ip ?? t('hrt.unknown_ip')}
                                                        {request.country ? `, ${request.country}` : ''}
                                                    </p>
                                                    <p className={`${muted} font-mono`}>
                                                        {request.fingerprint.slice(0, 16)}…
                                                    </p>
                                                    <p className={muted}>
                                                        {formatRelative(request.createdAt, nowSec, t)}
                                                    </p>
                                                    <p className={`${muted} mt-1`}>{statusLabel(request.status)}</p>
                                                </div>
                                            </div>
                                            {request.status === 'pending' && (
                                                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                                    <input
                                                        className={input}
                                                        value={codes[request.id] ?? ''}
                                                        onChange={event =>
                                                            setCodes(previous => ({
                                                                ...previous,
                                                                [request.id]: event.target.value,
                                                            }))
                                                        }
                                                        placeholder={t('hrt.code_placeholder')}
                                                        autoComplete="off"
                                                        spellCheck={false}
                                                    />
                                                    <button
                                                        className={primary}
                                                        disabled={busy !== null}
                                                        onClick={() => approve(request.id)}
                                                    >
                                                        {t('hrt.approve')}
                                                    </button>
                                                    <button
                                                        className={secondary}
                                                        disabled={busy !== null}
                                                        onClick={() =>
                                                            run(`deny:${request.id}`, () =>
                                                                hrtService.deny(token, request.id),
                                                            )
                                                        }
                                                    >
                                                        {t('hrt.deny')}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className={card}>
                            <p className={heading}>{t('hrt.trusted_title')}</p>
                            <p className={`${muted} mt-1`}>{t('hrt.trusted_desc')}</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                <input
                                    className={input}
                                    value={trustIp}
                                    onChange={event => setTrustIp(event.target.value)}
                                    placeholder={t('hrt.ip_placeholder')}
                                    autoComplete="off"
                                />
                                <input
                                    className={input}
                                    value={trustLabel}
                                    onChange={event => setTrustLabel(event.target.value)}
                                    placeholder={t('hrt.label_placeholder')}
                                    maxLength={32}
                                />
                                <input
                                    className={input}
                                    value={trustPassword}
                                    onChange={event => setTrustPassword(event.target.value)}
                                    placeholder={t('hrt.password_placeholder')}
                                    type="password"
                                    autoComplete="current-password"
                                />
                            </div>
                            <button
                                className={`${primary} mt-2 inline-flex items-center gap-1`}
                                disabled={busy !== null || !trustIp.trim() || !trustPassword}
                                onClick={addTrusted}
                            >
                                <Plus size={14} /> {t('hrt.add_trusted')}
                            </button>
                            <div className="mt-3 space-y-2">
                                {trustedIps.length === 0 ? (
                                    <p className={muted}>{t('hrt.no_trusted')}</p>
                                ) : (
                                    trustedIps.map(entry => (
                                        <div
                                            key={entry.id}
                                            className="flex items-center justify-between gap-3 rounded-lg border-(length:--hairline) border-[var(--border)] px-3 py-2"
                                        >
                                            <div>
                                                <p className="text-sm text-[var(--text)]">{entry.label}</p>
                                                <p className={`${muted} font-mono`}>{entry.ip ?? '—'}</p>
                                            </div>
                                            <button
                                                className={`${secondary} inline-flex items-center gap-1`}
                                                disabled={busy !== null}
                                                onClick={() =>
                                                    run(`trusted:remove:${entry.id}`, () =>
                                                        hrtService.removeTrustedIp(token, entry.id),
                                                    )
                                                }
                                            >
                                                <Trash size={14} /> {t('hrt.remove')}
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>

                        <section className={card}>
                            <p className={heading}>{t('hrt.devices_title')}</p>
                            <div className="mt-3 space-y-2">
                                {devices.length === 0 ? (
                                    <p className={muted}>{t('hrt.no_devices')}</p>
                                ) : (
                                    devices.map(device => (
                                        <div
                                            key={device.id}
                                            className="flex items-center justify-between gap-3 rounded-lg border-(length:--hairline) border-[var(--border)] px-3 py-2"
                                        >
                                            <div>
                                                <p className="text-sm text-[var(--text)]">
                                                    {device.name}
                                                    {device.revokedAt !== null ? ` (${t('hrt.revoked')})` : ''}
                                                </p>
                                                <p className={`${muted} font-mono`}>
                                                    {device.fingerprint.slice(0, 16)}…
                                                </p>
                                                <p className={muted}>
                                                    {t('hrt.last_seen').replace(
                                                        '{time}',
                                                        device.lastSeenAt
                                                            ? formatRelative(device.lastSeenAt, nowSec, t)
                                                            : '—',
                                                    )}
                                                </p>
                                            </div>
                                            {device.revokedAt === null && (
                                                <button
                                                    className={secondary}
                                                    disabled={busy !== null}
                                                    onClick={() =>
                                                        run(`device:revoke:${device.id}`, () =>
                                                            hrtService.revoke(token, device.id),
                                                        )
                                                    }
                                                >
                                                    {t('hrt.revoke')}
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};

export default HrtSecurity;
