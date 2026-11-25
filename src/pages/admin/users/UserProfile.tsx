import type { FC } from 'react';
import { ImageOff } from '../../../components/icons';
import type { AdminUser } from '../../../services/admin';
import { dangerTextBtn, on, rowBase } from '../shared';
import type { UsersState } from './useUsers';

export const UserProfile: FC<{ user: AdminUser; state: UsersState }> = ({ user, state }) => {
    const { newUsername, setNewUsername, submitUsername, handleResetAvatar } = state;

    return (
        <div className="space-y-5">
            <form
                className="space-y-3"
                onSubmit={e => {
                    e.preventDefault();
                    if (newUsername.trim() && newUsername.trim() !== user.username) void submitUsername(user);
                }}
            >
                <label className="field-label" htmlFor={`name-${user.id}`}>
                    Username
                </label>
                <input
                    id={`name-${user.id}`}
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
                        disabled={!newUsername.trim() || newUsername.trim() === user.username}
                        className="btn-primary"
                    >
                        Save username
                    </button>
                </div>
            </form>
            <div className={`${rowBase} min-h-12 py-3`}>
                <span className={`text-sm ${on}`}>Picture</span>
                <button onClick={() => handleResetAvatar(user)} className={dangerTextBtn}>
                    <ImageOff size={16} strokeWidth={1.75} /> Remove
                </button>
            </div>
        </div>
    );
};
