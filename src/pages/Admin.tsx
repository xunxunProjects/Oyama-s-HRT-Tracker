import React, { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import {
    Trash,
    Busy,
    Alert,
    Server,
    Search,
    Password,
    Pencil,
    ImageOff,
    ChevronLeft,
    ChevronRight,
    Cloud,
    Users,
    ShieldOff,
    Megaphone,
    Flower,
} from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { formatBytes } from '../utils/helpers';
import { adminService, AdminUser, AdminUser2FA, TwoFactorScope, StorageReport } from '../services/admin';
import type { BackupMeta } from '../services/cloud';
import { useDialog } from '../contexts/DialogContext';
import { useEscape } from '../hooks/useEscape';
import { settingsSection, rowBleed } from '../components/SettingsListItem';
import { noticeService, NoticeLevel, SiteNotice } from '../services/notice';
import { apiEndpoint } from '../services/apiClient';
import { Lang } from '../i18n/translations';
import { BusyLabel } from '../components/StableLabel';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import Tabs, { useSwitchAnimation } from '../components/Tabs';
import Segmented from '../components/Segmented';
import CustomSelect, { SelectChevron } from '../components/CustomSelect';
import DateTimePicker from '../components/DateTimePicker';
import { navDepth, pushNavEntry, readNavEntry, replaceNavEntry, stepBack, TAB_RESELECT } from '../hooks/navHistory';

/*
 * The admin area, laid out like Settings: on a phone a list of three rows,
 * each opening its own level (a history entry, so the system Back steps out
 * of it); on a wide screen the same page header and column as every other
 * page, with the three as tabs. Everything is in the page's own scroller, so
 * the bottom bar's clearance (scroll-pb-nav) applies and nothing scrolls
 * sideways.
 */

type AdminCat = 'users' | 'notice' | 'system';
type MobileView = 'list' | AdminCat;
type UserTool = 'menu' | 'backups' | '2fa' | 'password' | 'edit';

const CAT_ORDER: readonly AdminCat[] = ['users', 'notice', 'system'];
const MOBILE_ORDER: readonly MobileView[] = ['list', ...CAT_ORDER];
const TOOL_ORDER: readonly UserTool[] = ['menu', 'backups', '2fa', 'password', 'edit'];

const muted = 'text-[var(--text-muted)]';
const on = 'text-[var(--text)]';
const rowBase = 'w-full min-h-14 flex items-center justify-between gap-4 py-3.5 text-start';
const textBtn =
    'shrink-0 inline-flex h-8 items-center gap-1 px-2.5 text-sm font-medium text-[var(--accent-ink)] rounded-full hover:bg-[var(--accent-subtle)] disabled:opacity-45 disabled:pointer-events-none';
const dangerTextBtn =
    'shrink-0 inline-flex h-8 items-center gap-1 px-2.5 text-sm font-medium text-[var(--danger)] rounded-full hover:bg-[var(--surface-hover)] disabled:opacity-45 disabled:pointer-events-none';

let _savedCat: AdminCat = 'users';

// As in Settings: the category drilled into on a phone lives in the history
// entry pushed on the way in, so Back from it lands on the list and leaving
// by a tab drops it.
const mobileViewFromHistory = (): MobileView => {
    const entry = readNavEntry();
    const cat = entry?.view === 'admin' ? entry.cat : undefined;
    return CAT_ORDER.find(c => c === cat) ?? 'list';
};

const leaveMobileCat = (setMobileView: (v: MobileView) => void) => {
    if (readNavEntry()?.cat) stepBack();
    else setMobileView('list');
};

// One layout on the page at a time: both at once (one hidden) gave every
// field and fold two copies with the same id.
const WIDE = '(min-width: 768px)';
const subscribeWide = (cb: () => void) => {
    const mq = window.matchMedia(WIDE);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
};
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches);

function timeAgo(ts: number | null | undefined): string {
    if (!ts) return 'never';
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

const plural = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? '' : 's'}`;

// datetime-local <-> unix seconds. The strings speak the operator's local
// time; everything stored and compared server-side is UTC seconds.
const toLocalInput = (ts: number | null): string => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value: string): number | null => {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};
const dateToLocalInput = (date: Date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const formatWhen = (value: string) =>
    new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

const NOTICE_LANGS: { id: 'default' | Lang; label: string }[] = [
    { id: 'default', label: 'Default' },
    { id: 'zh', label: '简体中文' },
    { id: 'zh-TW', label: '繁體中文' },
    { id: 'yue', label: '粵語' },
    { id: 'en', label: 'English' },
    { id: 'ja', label: '日本語' },
    { id: 'ko', label: '한국어' },
    { id: 'tr', label: 'Türkçe' },
    { id: 'ru', label: 'Русский' },
    { id: 'uk', label: 'Українська' },
];

/** A user's picture, or their first two letters when they have none. */
const Avatar: React.FC<{ username: string }> = ({ username }) => {
    const [failed, setFailed] = useState(false);
    return (
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--surface-muted)]">
            {failed ? (
                <span className={`text-xs font-medium ${muted}`}>{username.substring(0, 2).toUpperCase()}</span>
            ) : (
                <img
                    src={apiEndpoint(`/api/user/avatar/${username}`)}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setFailed(true)}
                />
            )}
        </span>
    );
};

/** One line in a user's actions: icon, name, an optional note, and a chevron. */
const ActionRow: React.FC<{
    icon: React.ElementType;
    label: string;
    note?: string;
    danger?: boolean;
    /** Acts in place (a dialog) instead of opening a page, so no chevron. */
    inPlace?: boolean;
    onClick: () => void;
}> = ({ icon: Icon, label, note, danger, inPlace, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        style={{ '--divider-inset': '2rem' } as React.CSSProperties}
        className={`${rowBase} min-h-12 py-3 ${rowBleed}`}
    >
        <span className="flex min-w-0 items-center gap-3">
            <Icon size={20} strokeWidth={1.75} className={`shrink-0 ${danger ? 'text-[var(--danger)]' : muted}`} />
            <span className={`text-sm ${danger ? 'text-[var(--danger)]' : on}`}>{label}</span>
        </span>
        <span className={`flex min-w-0 items-center gap-1 text-sm ${muted}`}>
            {note && <span className="truncate tabular-nums">{note}</span>}
            {!danger && !inPlace && <ChevronRight size={18} className="shrink-0 opacity-70 rtl:-scale-x-100" />}
        </span>
    </button>
);

/** A line with a name and a short state on the left and one action on the right. */
const FactorRow: React.FC<{ label: string; state: string; children: React.ReactNode }> = ({
    label,
    state,
    children,
}) => (
    <div className={`${rowBase} min-h-12 py-3`}>
        <div className="min-w-0">
            <p className={`text-sm ${on}`}>{label}</p>
            <p className={`text-xs ${muted} mt-0.5 tabular-nums`}>{state}</p>
        </div>
        {children}
    </div>
);

const Admin: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
    const { token } = useAuth();
    const { showDialog } = useDialog();
    const wide = useWide();
    const [cat, setCat] = useState<AdminCat>(_savedCat);
    const [mobileView, setMobileView] = useState<MobileView>(mobileViewFromHistory);

    const cats: { id: AdminCat; label: string; Icon: React.ElementType; hint: string }[] = [
        { id: 'users', label: 'Users', Icon: Users, hint: 'Accounts, sign-in and cloud backups' },
        { id: 'notice', label: 'Notice', Icon: Megaphone, hint: 'The banner across the top of the site' },
        { id: 'system', label: 'System', Icon: Server, hint: 'Storage and server status' },
    ];

    const selectCat = (c: AdminCat) => {
        _savedCat = c;
        setCat(c);
    };

    const enterMobileCat = (c: AdminCat) => {
        _savedCat = c;
        setCat(c);
        setMobileView(c);
        const entry = readNavEntry();
        if (entry?.cat) replaceNavEntry('admin', entry.depth, c);
        else pushNavEntry('admin', navDepth() + 1, c);
    };

    const exitMobileCat = () => leaveMobileCat(setMobileView);

    useEffect(() => {
        const onPop = () => {
            if (readNavEntry()?.view === 'admin') setMobileView(mobileViewFromHistory());
        };
        const onReselect = (e: Event) => {
            if ((e as CustomEvent<{ view: string }>).detail?.view === 'admin') leaveMobileCat(setMobileView);
        };
        window.addEventListener('popstate', onPop);
        window.addEventListener(TAB_RESELECT, onReselect);
        return () => {
            window.removeEventListener('popstate', onPop);
            window.removeEventListener(TAB_RESELECT, onReselect);
        };
    }, []);

    const catAnim = useSwitchAnimation(cat, CAT_ORDER);
    const mobileAnim = useSwitchAnimation(mobileView, MOBILE_ORDER);

    // ── Users ────────────────────────────────────────────────────────────
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchDebounce, setSearchDebounce] = useState('');
    const [page, setPage] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const PAGE_SIZE = 20;
    const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));

    // One user is open at a time. `shownId` stays on the last one opened, so
    // its actions are still there while the fold closes over them.
    const [openId, setOpenId] = useState<string | null>(null);
    const [shownId, setShownId] = useState<string | null>(null);
    const [tool, setTool] = useState<UserTool>('menu');
    const toolAnim = useSwitchAnimation(tool, TOOL_ORDER);
    useEscape(() => {
        if (tool !== 'menu') setTool('menu');
        else setOpenId(null);
    }, !!openId);

    const [newPassword, setNewPassword] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [backups, setBackups] = useState<BackupMeta[]>([]);
    const [backupsLoading, setBackupsLoading] = useState(false);
    const [twoFA, setTwoFA] = useState<AdminUser2FA | null>(null);
    const [twoFALoading, setTwoFALoading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setSearchDebounce(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchUsers = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const data = await adminService.getUsers(token, searchDebounce || undefined, page, PAGE_SIZE);
            setUsers(data.users);
            setTotalUsers(data.total);
        } catch {
            setError('Could not load users');
        } finally {
            setLoading(false);
        }
    }, [token, searchDebounce, page]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        setPage(1);
    }, [searchDebounce]);

    // Another page or search takes the open user off the list.
    useEffect(() => {
        setOpenId(null);
    }, [page, searchDebounce]);

    const toggleUser = (u: AdminUser) => {
        if (openId === u.id) {
            setOpenId(null);
            return;
        }
        setTool('menu');
        setOpenId(u.id);
        setShownId(u.id);
    };

    const openTool = async (u: AdminUser, next: UserTool) => {
        setTool(next);
        if (next === 'password') setNewPassword('');
        if (next === 'edit') setNewUsername(u.username);
        if (!token) return;
        if (next === 'backups') {
            setBackupsLoading(true);
            try {
                setBackups(await adminService.getUserBackups(token, u.id));
            } catch {
                setBackups([]);
            } finally {
                setBackupsLoading(false);
            }
        }
        if (next === '2fa') {
            setTwoFA(null);
            setTwoFALoading(true);
            try {
                setTwoFA(await adminService.getUser2FA(token, u.id));
            } catch {
                setTwoFA(null);
            } finally {
                setTwoFALoading(false);
            }
        }
    };

    const handleDeleteUser = (user: AdminUser) => {
        if (!token) return;
        showDialog(
            'confirm',
            `Delete ${user.username} and everything they stored? This cannot be undone.`,
            async () => {
                try {
                    await adminService.deleteUser(token, user.id);
                    setUsers(prev => prev.filter(u => u.id !== user.id));
                    setTotalUsers(n => Math.max(0, n - 1));
                    setOpenId(null);
                } catch {
                    showDialog('alert', 'Could not delete the user.');
                }
            },
            { danger: true },
        );
    };

    const setMemorial = (user: AdminUser, memorial: boolean) => {
        if (!token) return;
        showDialog(
            'confirm',
            memorial
                ? `Keep ${user.username} as a memorial account? Every device signed in to it is signed out and nobody can sign in again. Backups and share links stay as they are, and you can undo this later.`
                : `Make ${user.username} an ordinary account again? It can be signed in to with its password as before.`,
            async () => {
                try {
                    await adminService.setMemorial(token, user.id, memorial);
                    setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, memorial } : u)));
                } catch (e: any) {
                    showDialog('alert', e.message || 'Could not change the memorial setting.');
                }
            },
            { confirmLabel: memorial ? 'Keep as memorial' : 'Make ordinary' },
        );
    };

    const submitPassword = async (user: AdminUser) => {
        if (!token) return;
        try {
            const { sessionsRevoked } = await adminService.changeUserPassword(token, user.id, newPassword);
            showDialog(
                'alert',
                sessionsRevoked > 0
                    ? `Password changed. ${plural(sessionsRevoked, 'session')} signed out.`
                    : 'Password changed.',
            );
            setTool('menu');
        } catch (e: any) {
            showDialog('alert', e.message || 'Could not change the password.');
        }
    };

    const submitUsername = async (user: AdminUser) => {
        if (!token) return;
        try {
            await adminService.changeUsername(token, user.id, newUsername);
            setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, username: newUsername.trim() } : u)));
            showDialog('alert', 'Username changed.');
            setTool('menu');
        } catch (e: any) {
            showDialog('alert', e.message || 'Could not change the username.');
        }
    };

    const handleResetAvatar = (user: AdminUser) => {
        if (!token) return;
        showDialog(
            'confirm',
            `Remove the picture ${user.username} uploaded?`,
            async () => {
                try {
                    await adminService.resetAvatar(token, user.id);
                    showDialog('alert', 'Picture removed.');
                } catch {
                    showDialog('alert', 'Could not remove the picture.');
                }
            },
            { danger: true },
        );
    };

    const clearTwoFA = (user: AdminUser, scope: TwoFactorScope, confirmText: string) => {
        if (!token) return;
        showDialog(
            'confirm',
            confirmText,
            async () => {
                try {
                    const cleared = await adminService.clearUser2FA(token, user.id, scope);
                    setTwoFA(await adminService.getUser2FA(token, user.id));
                    setUsers(prev =>
                        prev.map(u =>
                            u.id === user.id
                                ? {
                                      ...u,
                                      has_totp: cleared.totp ? 0 : u.has_totp,
                                      passkey_count: cleared.passkeys > 0 ? 0 : u.passkey_count,
                                  }
                                : u,
                        ),
                    );
                    const parts = [
                        cleared.totp && 'the authenticator app',
                        cleared.passkeys > 0 && plural(cleared.passkeys, 'passkey'),
                        cleared.backupCodes > 0 && plural(cleared.backupCodes, 'backup code'),
                    ].filter(Boolean) as string[];
                    const sessions = cleared.sessions > 0 ? ` ${plural(cleared.sessions, 'session')} signed out.` : '';
                    showDialog(
                        'alert',
                        parts.length
                            ? `Removed ${parts.join(', ')}.${sessions}`
                            : `${user.username} had no two-step verification to remove.`,
                    );
                } catch (e: any) {
                    showDialog('alert', e.message || 'Could not reset two-step verification.');
                }
            },
            { danger: true },
        );
    };

    const handleDeleteBackup = async (user: AdminUser, backupId: string) => {
        if (!token) return;
        try {
            await adminService.deleteBackup(token, user.id, backupId);
            setBackups(prev => prev.filter(b => b.id !== backupId));
            setUsers(prev =>
                prev.map(u => (u.id === user.id ? { ...u, backup_count: Math.max(0, (u.backup_count || 1) - 1) } : u)),
            );
        } catch {
            showDialog('alert', 'Could not delete the backup.');
        }
    };

    const handlePurgeBackups = (user: AdminUser) => {
        if (!token) return;
        showDialog(
            'confirm',
            `Delete every cloud backup ${user.username} has?`,
            async () => {
                try {
                    await adminService.purgeBackups(token, user.id);
                    setBackups([]);
                    setUsers(prev =>
                        prev.map(u =>
                            u.id === user.id
                                ? { ...u, backup_count: 0, last_backup_at: null, total_backup_size: 0 }
                                : u,
                        ),
                    );
                } catch {
                    showDialog('alert', 'Could not delete the backups.');
                }
            },
            { danger: true },
        );
    };

    const has2FA = (u: AdminUser) => (u.has_totp ?? 0) > 0 || (u.passkey_count ?? 0) > 0;

    const userMeta = (u: AdminUser) =>
        [
            u.memorial && 'memorial account',
            (u.backup_count ?? 0) > 0 && `${plural(u.backup_count ?? 0, 'backup')}, last ${timeAgo(u.last_backup_at)}`,
            has2FA(u) && 'two-step on',
        ]
            .filter(Boolean)
            .join(', ');

    const toolTitle: Record<Exclude<UserTool, 'menu'>, string> = {
        backups: 'Cloud backups',
        '2fa': 'Two-step verification',
        password: 'Password',
        edit: 'Username and picture',
    };

    const busy = (
        <div className="flex justify-center py-8">
            <Busy className={`animate-spin ${muted}`} size={20} />
        </div>
    );

    const renderTool = (u: AdminUser) => {
        if (tool === 'menu') {
            const twoFactorNote = [
                (u.has_totp ?? 0) > 0 && 'App',
                (u.passkey_count ?? 0) > 0 && plural(u.passkey_count ?? 0, 'passkey'),
            ]
                .filter(Boolean)
                .join(', ');
            // A memorial account is kept as it is: its backups can be looked
            // at, and the only thing left to do is to make it ordinary again.
            if (u.memorial) {
                return (
                    <div className={settingsSection}>
                        <ActionRow
                            icon={Cloud}
                            label="Cloud backups"
                            note={(u.backup_count ?? 0) > 0 ? formatBytes(u.total_backup_size || 0) : 'None'}
                            onClick={() => openTool(u, 'backups')}
                        />
                        <ActionRow
                            icon={Flower}
                            label="Memorial account"
                            note="Make ordinary"
                            inPlace
                            onClick={() => setMemorial(u, false)}
                        />
                    </div>
                );
            }
            return (
                <div className={settingsSection}>
                    <ActionRow
                        icon={Cloud}
                        label="Cloud backups"
                        note={(u.backup_count ?? 0) > 0 ? formatBytes(u.total_backup_size || 0) : 'None'}
                        onClick={() => openTool(u, 'backups')}
                    />
                    <ActionRow
                        icon={ShieldOff}
                        label="Two-step verification"
                        note={twoFactorNote || 'Off'}
                        onClick={() => openTool(u, '2fa')}
                    />
                    <ActionRow icon={Password} label="Password" onClick={() => openTool(u, 'password')} />
                    <ActionRow icon={Pencil} label="Username and picture" onClick={() => openTool(u, 'edit')} />
                    <ActionRow icon={Flower} label="Keep as memorial" inPlace onClick={() => setMemorial(u, true)} />
                    <ActionRow icon={Trash} label="Delete user" danger onClick={() => handleDeleteUser(u)} />
                </div>
            );
        }

        let body: React.ReactNode;
        if (tool === 'password') {
            body = (
                <form
                    className="space-y-3"
                    onSubmit={e => {
                        e.preventDefault();
                        if (newPassword.length >= 8) void submitPassword(u);
                    }}
                >
                    <label className="field-label" htmlFor={`pw-${u.id}`}>
                        New password, at least 8 characters
                    </label>
                    <input
                        id={`pw-${u.id}`}
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="input-base"
                        autoFocus
                    />
                    <p className="field-hint">Every place {u.username} is signed in is signed out</p>
                    <div className="flex justify-end">
                        <button type="submit" disabled={newPassword.length < 8} className="btn-primary">
                            Change password
                        </button>
                    </div>
                </form>
            );
        } else if (tool === 'edit') {
            body = (
                <div className="space-y-5">
                    <form
                        className="space-y-3"
                        onSubmit={e => {
                            e.preventDefault();
                            if (newUsername.trim() && newUsername.trim() !== u.username) void submitUsername(u);
                        }}
                    >
                        <label className="field-label" htmlFor={`name-${u.id}`}>
                            Username
                        </label>
                        <input
                            id={`name-${u.id}`}
                            type="text"
                            autoCapitalize="none"
                            autoCorrect="off"
                            value={newUsername}
                            onChange={e => setNewUsername(e.target.value)}
                            className="input-base"
                            autoFocus
                        />
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={!newUsername.trim() || newUsername.trim() === u.username}
                                className="btn-primary"
                            >
                                Save username
                            </button>
                        </div>
                    </form>
                    <div className={`${rowBase} min-h-12 py-3`}>
                        <span className={`text-sm ${on}`}>Picture</span>
                        <button onClick={() => handleResetAvatar(u)} className={dangerTextBtn}>
                            <ImageOff size={16} strokeWidth={1.75} /> Remove
                        </button>
                    </div>
                </div>
            );
        } else if (tool === '2fa') {
            body = twoFALoading ? (
                busy
            ) : !twoFA ? (
                <p className={`text-sm ${muted} py-4`}>Could not load two-step verification</p>
            ) : (
                <div>
                    <div className={settingsSection}>
                        <FactorRow label="Authenticator app" state={twoFA.totp ? 'Set up' : 'Not set up'}>
                            <button
                                onClick={() =>
                                    clearTwoFA(
                                        u,
                                        'totp',
                                        `Turn off the authenticator app for ${u.username}? They sign in with their password alone, and every session is signed out.`,
                                    )
                                }
                                disabled={!twoFA.totp}
                                className={dangerTextBtn}
                            >
                                Turn off
                            </button>
                        </FactorRow>
                        <FactorRow
                            label="Passkeys"
                            state={twoFA.passkeys === 0 ? 'None' : plural(twoFA.passkeys, 'passkey')}
                        >
                            <button
                                onClick={() =>
                                    clearTwoFA(
                                        u,
                                        'passkeys',
                                        `Remove all ${plural(twoFA.passkeys, 'passkey')} for ${u.username}? Every session is signed out.`,
                                    )
                                }
                                disabled={twoFA.passkeys === 0}
                                className={dangerTextBtn}
                            >
                                Remove
                            </button>
                        </FactorRow>
                        <FactorRow
                            label="Backup codes"
                            state={twoFA.backupCodes === 0 ? 'None left' : `${twoFA.backupCodes} unused`}
                        >
                            <button
                                onClick={() =>
                                    clearTwoFA(
                                        u,
                                        'backup_codes',
                                        `Erase the backup codes ${u.username} has left? Their sessions stay signed in.`,
                                    )
                                }
                                disabled={twoFA.backupCodes === 0}
                                className={dangerTextBtn}
                            >
                                Erase
                            </button>
                        </FactorRow>
                    </div>
                    <p className={`text-xs ${muted} mt-4`}>
                        Removing these leaves the account with its password alone, so make sure who is asking
                    </p>
                    <div className="mt-3 flex justify-end">
                        <button
                            onClick={() =>
                                clearTwoFA(
                                    u,
                                    'all',
                                    `Remove all two-step verification for ${u.username}? The authenticator app, every passkey and every backup code go, and all their sessions are signed out.`,
                                )
                            }
                            disabled={!twoFA.enabled && twoFA.backupCodes === 0}
                            className={dangerTextBtn}
                        >
                            Remove all
                        </button>
                    </div>
                </div>
            );
        } else {
            body = backupsLoading ? (
                busy
            ) : backups.length === 0 ? (
                <p className={`text-sm ${muted} py-4`}>No cloud backups</p>
            ) : (
                <div>
                    <div className={settingsSection}>
                        {backups.map(b => (
                            <div key={b.id} className={`${rowBase} min-h-12 py-3`}>
                                <div className="min-w-0">
                                    <p className={`text-sm ${on} tabular-nums`}>
                                        {formatWhen(toLocalInput(b.created_at))}
                                    </p>
                                    <p className={`text-xs ${muted} mt-0.5 tabular-nums`}>{formatBytes(b.data_size)}</p>
                                </div>
                                {!u.memorial && (
                                    <button
                                        onClick={() => handleDeleteBackup(u, b.id)}
                                        className={dangerTextBtn}
                                        aria-label={`Delete the backup from ${formatWhen(toLocalInput(b.created_at))}`}
                                    >
                                        Delete
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                        <span className={`text-xs ${muted} tabular-nums`}>
                            {formatBytes(backups.reduce((s, b) => s + b.data_size, 0))} in all
                        </span>
                        {!u.memorial && (
                            <button onClick={() => handlePurgeBackups(u)} className={dangerTextBtn}>
                                Delete all
                            </button>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div>
                <button
                    type="button"
                    onClick={() => setTool('menu')}
                    className={`-ml-2 mb-1 inline-flex h-8 items-center gap-1 rounded-full px-2 text-sm font-medium ${on} hover:bg-[var(--surface-hover)]`}
                >
                    <ChevronLeft size={18} className={`${muted} rtl:-scale-x-100`} />
                    {toolTitle[tool]}
                </button>
                {body}
            </div>
        );
    };

    // Plain elements, not a nested component, so typing in the search field
    // doesn't remount the subtree and drop focus on every keystroke.
    const renderUsers = () => (
        <div>
            <div className="relative mb-2">
                <Search size={16} strokeWidth={1.75} className={`absolute left-0 top-1/2 -translate-y-1/2 ${muted}`} />
                <input
                    type="search"
                    enterKeyHint="search"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={totalUsers > 0 ? `Search ${plural(totalUsers, 'account')}` : 'Search accounts'}
                    aria-label="Search accounts"
                    className="input-base pl-6"
                />
            </div>

            {loading && users.length === 0 ? (
                busy
            ) : error ? (
                <p className="flex items-center gap-2 text-sm text-[var(--danger)] py-4">
                    <Alert size={16} strokeWidth={1.75} /> {error}
                </p>
            ) : users.length === 0 ? (
                <p className={`text-sm ${muted} py-10 text-center`}>
                    {searchDebounce ? `Nobody matches ${searchDebounce}` : 'No accounts yet'}
                </p>
            ) : (
                <div className={settingsSection}>
                    {users.map(u => {
                        const open = openId === u.id;
                        const meta = userMeta(u);
                        return (
                            <div key={u.id} style={{ '--divider-inset': '3rem' } as React.CSSProperties}>
                                <button
                                    type="button"
                                    onClick={() => toggleUser(u)}
                                    aria-expanded={open}
                                    aria-controls={`user-${u.id}`}
                                    className={`${rowBase} gap-3 py-3 ${rowBleed}`}
                                >
                                    <span className="flex min-w-0 flex-1 items-center gap-3">
                                        <Avatar username={u.username} />
                                        <span className="min-w-0 flex-1">
                                            <span className={`block truncate text-sm font-medium ${on}`}>
                                                {u.username}
                                            </span>
                                            {meta && (
                                                <span className={`block text-xs ${muted} mt-0.5 tabular-nums`}>
                                                    {meta}
                                                </span>
                                            )}
                                        </span>
                                    </span>
                                    <SelectChevron open={open} />
                                </button>
                                <div
                                    id={`user-${u.id}`}
                                    className="disclosure"
                                    data-open={open}
                                    {...(open ? {} : { inert: '' })}
                                >
                                    <div className="disclosure-inner">
                                        {shownId === u.id && (
                                            <div
                                                key={tool}
                                                // Its rows rule from their own start, not the 3rem the user row sets.
                                                style={{ '--divider-inset': '0px' } as React.CSSProperties}
                                                className={`pb-4 ps-12 ${toolAnim}`}
                                            >
                                                {renderTool(u)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className={`${textBtn} ${on} hover:bg-[var(--surface-hover)]`}
                    >
                        <ChevronLeft size={18} className="rtl:-scale-x-100" /> Previous
                    </button>
                    <span className={`text-xs ${muted} tabular-nums`}>
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className={`${textBtn} ${on} hover:bg-[var(--surface-hover)]`}
                    >
                        Next <ChevronRight size={18} className="rtl:-scale-x-100" />
                    </button>
                </div>
            )}
        </div>
    );

    // ── Notice ───────────────────────────────────────────────────────────
    // `noticeLang` is which text is being edited: the default, or one
    // locale's own wording. A notice with only a default reads the same in
    // every language.
    const [notice, setNotice] = useState<SiteNotice | null>(null);
    const [noticeLoading, setNoticeLoading] = useState(false);
    const [noticeSaving, setNoticeSaving] = useState(false);
    const [noticeBody, setNoticeBody] = useState('');
    const [noticeI18n, setNoticeI18n] = useState<Partial<Record<Lang, string>>>({});
    const [noticeLevel, setNoticeLevel] = useState<NoticeLevel>('info');
    const [noticeStart, setNoticeStart] = useState('');
    const [noticeEnd, setNoticeEnd] = useState('');
    const [noticeLang, setNoticeLang] = useState<'default' | Lang>('default');
    const [pickerOpen, setPickerOpen] = useState<'start' | 'end' | null>(null);

    const applyNotice = (n: SiteNotice | null) => {
        setNotice(n);
        setNoticeBody(n?.body ?? '');
        setNoticeI18n(n?.i18n ?? {});
        setNoticeLevel(n?.level ?? 'info');
        setNoticeStart(toLocalInput(n?.startsAt ?? null));
        setNoticeEnd(toLocalInput(n?.expiresAt ?? null));
    };

    const fetchNotice = useCallback(async () => {
        if (!token) return;
        setNoticeLoading(true);
        try {
            applyNotice(await noticeService.getStored(token));
        } catch {
            showDialog('alert', 'Could not load the notice.');
        } finally {
            setNoticeLoading(false);
        }
    }, [token, showDialog]);

    // Loaded on opening the notice rather than on mount: the users list is
    // what the page opens on, and this is one request nobody asked for yet.
    useEffect(() => {
        if ((wide ? cat : mobileView) === 'notice') void fetchNotice();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cat, mobileView, wide]);

    const noticeTextFor = (id: 'default' | Lang): string => (id === 'default' ? noticeBody : (noticeI18n[id] ?? ''));

    const setNoticeTextFor = (id: 'default' | Lang, value: string) => {
        if (id === 'default') setNoticeBody(value);
        else setNoticeI18n(prev => ({ ...prev, [id]: value }));
    };

    const saveNotice = async () => {
        if (!token) return;
        const body = noticeBody.trim();
        if (!body) {
            showDialog('alert', 'Every language without its own wording reads the default, so it cannot be empty.');
            return;
        }
        const startsAt = fromLocalInput(noticeStart);
        const expiresAt = fromLocalInput(noticeEnd);
        if (startsAt != null && expiresAt != null && expiresAt <= startsAt) {
            showDialog('alert', 'The end has to come after the start.');
            return;
        }
        setNoticeSaving(true);
        try {
            applyNotice(
                await noticeService.save(token, { body, i18n: noticeI18n, level: noticeLevel, startsAt, expiresAt }),
            );
            showDialog(
                'alert',
                'Notice published. New visits see it right away, open tabs within ten minutes, and people who closed the last one see it again.',
            );
        } catch (e: any) {
            showDialog('alert', e?.message || 'Could not publish the notice.');
        } finally {
            setNoticeSaving(false);
        }
    };

    const clearNotice = () => {
        if (!token) return;
        showDialog(
            'confirm',
            'Take the banner down for everyone?',
            async () => {
                try {
                    await noticeService.clear(token);
                    applyNotice(null);
                    setNoticeLang('default');
                } catch {
                    showDialog('alert', 'Could not take the notice down.');
                }
            },
            { danger: true },
        );
    };

    // The wording a reader of the chosen language sees: its own when it has
    // one, the default otherwise.
    const noticePreview = noticeLang === 'default' ? noticeBody : noticeI18n[noticeLang]?.trim() || noticeBody;

    const noticeWindowLabel = (): string => {
        if (!notice) return 'Not showing';
        const now = Math.floor(Date.now() / 1000);
        if (notice.startsAt != null && now < notice.startsAt)
            return `Starts ${formatWhen(toLocalInput(notice.startsAt))}`;
        if (notice.expiresAt != null && now >= notice.expiresAt)
            return `Ended ${formatWhen(toLocalInput(notice.expiresAt))}`;
        if (notice.expiresAt != null) return `Showing until ${formatWhen(toLocalInput(notice.expiresAt))}`;
        return 'Showing now';
    };

    const scheduleRow = (which: 'start' | 'end') => {
        const value = which === 'start' ? noticeStart : noticeEnd;
        const set = which === 'start' ? setNoticeStart : setNoticeEnd;
        const open = pickerOpen === which;
        const label = which === 'start' ? 'Starts' : 'Ends';
        return (
            <div>
                <button
                    type="button"
                    onClick={() => setPickerOpen(open ? null : which)}
                    aria-expanded={open}
                    className={`${rowBase} ${rowBleed}`}
                >
                    <span className={`text-sm ${on}`}>{label}</span>
                    <span className={`flex items-center gap-1.5 text-sm ${muted}`}>
                        <span className="tabular-nums">
                            {value ? formatWhen(value) : which === 'start' ? 'Right away' : 'When taken down'}
                        </span>
                        <SelectChevron open={open} />
                    </span>
                </button>
                <DateTimePicker
                    isOpen={open}
                    inline
                    onClose={() => setPickerOpen(null)}
                    onConfirm={date => set(dateToLocalInput(date))}
                    initialDate={value ? new Date(value) : new Date()}
                    mode="datetime"
                    title={label}
                />
                {open && value && (
                    <div className="flex justify-end pb-3">
                        <button
                            type="button"
                            onClick={() => {
                                set('');
                                setPickerOpen(null);
                            }}
                            className={dangerTextBtn}
                        >
                            {which === 'start' ? 'Start right away' : 'No end'}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const renderNotice = () =>
        noticeLoading ? (
            busy
        ) : (
            <div>
                <p className={`text-xs ${muted} mb-4`}>
                    One banner at the top of the app, for everyone, signed in or not
                </p>

                <CustomSelect
                    label="Wording for"
                    value={noticeLang}
                    onChange={v => setNoticeLang(v as 'default' | Lang)}
                    options={NOTICE_LANGS.map(({ id, label }) => ({
                        value: id,
                        label,
                        description:
                            id === 'default'
                                ? 'For every language without its own'
                                : noticeTextFor(id).trim()
                                  ? 'Own wording'
                                  : 'Reads the default',
                    }))}
                />

                <div className="mt-4">
                    <label className="field-label mb-2" htmlFor="notice-text">
                        {noticeLang === 'default' ? 'Text' : 'Text, empty to use the default'}
                    </label>
                    <textarea
                        id="notice-text"
                        value={noticeTextFor(noticeLang)}
                        onChange={e => setNoticeTextFor(noticeLang, e.target.value)}
                        rows={4}
                        maxLength={2000}
                        className="input-base resize-y"
                    />
                    <p className="field-hint tabular-nums">
                        {noticeTextFor(noticeLang).length} of 2000, links starting https:// can be tapped
                    </p>
                </div>

                <div className={`mt-2 ${settingsSection}`}>
                    <div className={rowBase}>
                        <span className={`text-sm ${on}`}>Tone</span>
                        <Segmented
                            aria-label="Tone"
                            options={[
                                { id: 'info', label: 'Info' },
                                { id: 'warn', label: 'Warning' },
                            ]}
                            value={noticeLevel}
                            onChange={v => setNoticeLevel(v as NoticeLevel)}
                        />
                    </div>
                    {scheduleRow('start')}
                    {scheduleRow('end')}
                </div>

                {noticePreview.trim() && (
                    <div className="mt-4">
                        <p className="field-label mb-2">Preview</p>
                        <p
                            className={`flex items-start gap-1.5 text-xs whitespace-pre-wrap break-words ${
                                noticeLevel === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--accent-ink)]'
                            }`}
                        >
                            <span className="icon-line">
                                {noticeLevel === 'warn' ? (
                                    <Alert size={14} strokeWidth={1.75} />
                                ) : (
                                    <Megaphone size={14} strokeWidth={1.75} />
                                )}
                            </span>
                            <span className="min-w-0">{noticePreview}</span>
                        </p>
                    </div>
                )}

                <div className="mt-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <span className={`text-xs ${muted} tabular-nums`}>{noticeWindowLabel()}</span>
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={clearNotice} disabled={!notice} className={dangerTextBtn}>
                            Take down
                        </button>
                        <button
                            onClick={saveNotice}
                            disabled={noticeSaving || !noticeBody.trim()}
                            className="btn-primary disabled:opacity-45 disabled:pointer-events-none"
                        >
                            <BusyLabel busy={noticeSaving} size={16}>
                                {notice ? 'Update' : 'Publish'}
                            </BusyLabel>
                        </button>
                    </div>
                </div>
            </div>
        );

    // ── System ───────────────────────────────────────────────────────────
    const [storage, setStorage] = useState<StorageReport | null>(null);
    const [storageLoading, setStorageLoading] = useState(false);
    const [storageError, setStorageError] = useState<string | null>(null);
    const loadStorage = async () => {
        if (!token) return;
        setStorageLoading(true);
        setStorageError(null);
        try {
            setStorage(await adminService.getStorage(token));
        } catch (e: any) {
            setStorageError(e?.message || 'Could not measure storage.');
        } finally {
            setStorageLoading(false);
        }
    };

    // Storage is fetched on demand: the worker reads every backup body to
    // measure it, so it is not worth doing on every visit.
    const renderSystem = () => (
        <div>
            <div className={settingsSection}>
                <div className={rowBase}>
                    <div className="min-w-0">
                        <p className={`text-sm ${on}`}>Storage</p>
                        <p className={`text-xs ${muted} mt-0.5 tabular-nums`}>
                            {storage
                                ? `${formatBytes(storage.payload_bytes)} in all, measured ${timeAgo(storage.measured_at)}`
                                : 'Compare with the D1 plan limit'}
                        </p>
                    </div>
                    <button onClick={loadStorage} disabled={storageLoading} className={textBtn}>
                        <BusyLabel busy={storageLoading} size={16}>
                            {storage ? 'Refresh' : 'Measure'}
                        </BusyLabel>
                    </button>
                </div>
                {storage?.tables.map(t => (
                    <div key={t.table} className={`${rowBase} min-h-11 py-2.5`}>
                        <span className={`min-w-0 truncate text-sm ${on}`}>{t.table}</span>
                        <span className={`shrink-0 text-sm ${muted} tabular-nums`}>
                            {plural(t.rows, 'row')}
                            {t.payload_bytes > 0 ? `, ${formatBytes(t.payload_bytes)}` : ''}
                        </span>
                    </div>
                ))}
                <div className={rowBase}>
                    <span className={`text-sm ${on}`}>Status</span>
                    <span className={`text-sm ${muted}`}>Operational</span>
                </div>
                <div className={rowBase}>
                    <span className={`text-sm ${on}`}>Backend</span>
                    <span className={`text-sm ${muted}`}>
                        {window.location.hostname === 'localhost' ? 'Local' : 'Remote'}
                    </span>
                </div>
            </div>
            {storageError && <p className="field-hint is-error">{storageError}</p>}
        </div>
    );

    const catContent = (id: AdminCat) =>
        id === 'users' ? renderUsers() : id === 'notice' ? renderNotice() : renderSystem();

    return (
        <div className="relative md:pb-32">
            {/* ── Phone: the three rows, then one of them ─────────────── */}
            {!wide && (
                <div>
                    <div key={mobileView} className={mobileAnim}>
                        {mobileView === 'list' ? (
                            <>
                                <PageHeader title="Admin" onBack={onBack} />
                                <div className={`${PAGE_COLUMN} mt-3 ${settingsSection}`}>
                                    {cats.map(({ id, label, Icon, hint }) => (
                                        <button
                                            key={id}
                                            onClick={() => enterMobileCat(id)}
                                            style={{ '--divider-inset': '3rem' } as React.CSSProperties}
                                            className={`${rowBase} ${rowBleed}`}
                                        >
                                            <span className="flex min-w-0 items-center gap-3">
                                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--surface-muted)]">
                                                    <Icon size={20} strokeWidth={1.75} className={muted} />
                                                </span>
                                                <span className="min-w-0 text-start">
                                                    <span className={`block text-sm font-medium ${on}`}>{label}</span>
                                                    <span className={`block text-xs ${muted} mt-0.5`}>{hint}</span>
                                                </span>
                                            </span>
                                            <ChevronRight
                                                size={18}
                                                className={`${muted} shrink-0 opacity-70 rtl:-scale-x-100`}
                                            />
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <>
                                <PageHeader onBack={exitMobileCat} title={cats.find(c => c.id === mobileView)?.label} />
                                <div className={`${PAGE_COLUMN} mt-3`}>{catContent(mobileView as AdminCat)}</div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Wide screen: the page header and column every page has,
                with the three as tabs under the title. ── */}
            {wide && (
                <div>
                    <PageHeader title="Admin" />
                    <div className={`${PAGE_COLUMN} mt-3`}>
                        <Tabs tabs={cats} value={cat} onChange={selectCat} className="mb-4" />
                        <div key={cat} className={catAnim}>
                            {catContent(cat)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;
