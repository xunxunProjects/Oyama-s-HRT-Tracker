export interface AdminUser {
    id: string;
    username: string;
}

export const adminService = {
    async getUsers(token: string): Promise<AdminUser[]> {
        const res = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch users');
        return await res.json() as AdminUser[];
    },

    async deleteUser(token: string, userId: string): Promise<void> {
        const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to delete user');
    }
};
