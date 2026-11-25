import type { CSSProperties, FC } from 'react';
import { Alert, ChevronLeft, ChevronRight, Search } from '../../../components/icons';
import { settingsSection, rowBleed } from '../../../components/SettingsListItem';
import { SelectChevron } from '../../../components/CustomSelect';
import { Avatar, BusyState, muted, on, plural, rowBase, textBtn, userMeta } from '../shared';
import type { UsersState } from './useUsers';
import { UserDetail } from './UserDetail';

export const UsersPanel: FC<{ state: UsersState }> = ({ state }) => {
    const {
        users,
        loading,
        error,
        searchQuery,
        setSearchQuery,
        searchDebounce,
        page,
        setPage,
        totalUsers,
        totalPages,
        openId,
        shownId,
        tool,
        toolAnim,
        toggleUser,
    } = state;

    return (
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
                <BusyState />
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
                            <div key={u.id} style={{ '--divider-inset': '3rem' } as CSSProperties}>
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
                                                style={{ '--divider-inset': '0px' } as CSSProperties}
                                                className={`pb-4 ps-12 ${toolAnim}`}
                                            >
                                                <UserDetail user={u} state={state} />
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
};
