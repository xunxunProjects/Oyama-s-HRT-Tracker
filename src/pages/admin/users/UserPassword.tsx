import type { FC } from 'react';
import type { AdminUser } from '../../../services/admin';
import type { UsersState } from './useUsers';

export const UserPassword: FC<{ user: AdminUser; state: UsersState }> = ({ user, state }) => {
    const { newPassword, setNewPassword, submitPassword } = state;

    return (
        <form
            className="space-y-3"
            onSubmit={e => {
                e.preventDefault();
                if (newPassword.length >= 8) void submitPassword(user);
            }}
        >
            <label className="field-label" htmlFor={`pw-${user.id}`}>
                New password, at least 8 characters
            </label>
            <input
                id={`pw-${user.id}`}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="input-base"
                autoFocus
            />
            <p className="field-hint">Every place {user.username} is signed in is signed out</p>
            <div className="flex justify-end">
                <button type="submit" disabled={newPassword.length < 8} className="btn-primary">
                    Change password
                </button>
            </div>
        </form>
    );
};
