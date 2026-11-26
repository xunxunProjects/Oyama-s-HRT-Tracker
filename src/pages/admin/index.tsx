import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Flower, Megaphone, Server, Users } from '../../components/icons';
import PageHeader, { PAGE_COLUMN } from '../../components/PageHeader';
import PasswordPrompt from '../../components/PasswordPrompt';
import { settingsSection, rowBleed } from '../../components/SettingsListItem';
import Tabs, { useSwitchAnimation } from '../../components/Tabs';
import {
    navDepth,
    pushNavEntry,
    readNavEntry,
    replaceNavEntry,
    replaceNavPath,
    stepBack,
    TAB_RESELECT,
} from '../../hooks/navHistory';
import { parsePath, pathFor } from '../../hooks/viewPaths';
import { setAdminReauthPrompt } from '../../services/adminReauth';
import { useDonation, DonationPanel } from './DonationPanel';
import { NoticePanel, useNotice } from './NoticePanel';
import { SystemPanel, useStorage } from './SystemPanel';
import { CAT_ORDER, MOBILE_ORDER, AdminCat, MobileView } from './types';
import { muted, on, rowBase, useWide } from './shared';
import { UsersPanel, useUsers } from './users';

/*
 * The admin area, laid out like Settings: on a phone a list of four rows,
 * each opening its own level (a history entry, so the system Back steps out
 * of it); on a wide screen the same page header and column as every other
 * page, with the four as tabs. Everything is in the page's own scroller, so
 * the bottom bar's clearance (scroll-pb-nav) applies and nothing scrolls
 * sideways.
 */

let _savedCat: AdminCat = 'users';

// The category the address names (/admin/notice), as in Settings.
const catFromAddress = (): AdminCat | undefined => {
    const named = parsePath(window.location.pathname);
    return named?.view === 'admin' ? CAT_ORDER.find(c => c === named.cat) : undefined;
};

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

const CATS: { id: AdminCat; label: string; Icon: React.ElementType; hint: string }[] = [
    { id: 'users', label: 'Users', Icon: Users, hint: 'Accounts, sign-in and cloud backups' },
    { id: 'notice', label: 'Notice', Icon: Megaphone, hint: 'The banner across the top of the site' },
    { id: 'donation', label: 'Donation', Icon: Flower, hint: 'Direct Monero and Trocador payout' },
    { id: 'system', label: 'System', Icon: Server, hint: 'Storage and server status' },
];

const Admin: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
    const wide = useWide();
    const [cat, setCat] = useState<AdminCat>(() => catFromAddress() ?? _savedCat);
    const [mobileView, setMobileView] = useState<MobileView>(mobileViewFromHistory);

    const [reauthOpen, setReauthOpen] = useState(false);
    const reauthResolve = useRef<((password: string | null) => void) | null>(null);

    useEffect(() => {
        setAdminReauthPrompt(
            () =>
                new Promise<string | null>(resolve => {
                    reauthResolve.current = resolve;
                    setReauthOpen(true);
                }),
        );
        return () => {
            setAdminReauthPrompt(null);
            const resolve = reauthResolve.current;
            reauthResolve.current = null;
            resolve?.(null);
        };
    }, []);

    const finishReauth = (password: string | null) => {
        setReauthOpen(false);
        const resolve = reauthResolve.current;
        reauthResolve.current = null;
        resolve?.(password);
    };

    const cats = CATS;

    const selectCat = (c: AdminCat) => {
        _savedCat = c;
        setCat(c);
        replaceNavPath(pathFor('admin', c));
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

    const active = wide ? cat : mobileView;
    const users = useUsers();
    const notice = useNotice({ active: active === 'notice' });
    const donation = useDonation({ active: active === 'donation' });
    const storage = useStorage();

    const catContent = (id: AdminCat) =>
        id === 'users' ? (
            <UsersPanel state={users} />
        ) : id === 'notice' ? (
            <NoticePanel state={notice} />
        ) : id === 'donation' ? (
            <DonationPanel state={donation} />
        ) : (
            <SystemPanel state={storage} />
        );

    return (
        <div className="relative md:pb-32">
            <PasswordPrompt
                isOpen={reauthOpen}
                onClose={() => finishReauth(null)}
                onConfirm={password => finishReauth(password)}
                title="Confirm admin password"
                description="This action changes account data. Enter the admin password to continue."
                masked
            />
            {/* ── Phone: the four rows, then one of them ─────────────── */}
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
                with the four as tabs under the title. ── */}
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
