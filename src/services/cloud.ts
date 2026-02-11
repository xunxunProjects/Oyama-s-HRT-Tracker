export interface CloudBackup {
    id: number;
    user_id: string;
    data: string;
    created_at: number;
}

export const cloudService = {
    async save(token: string, data: any): Promise<void> {
        const res = await fetch('/api/content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ data })
        });
        if (!res.ok) throw new Error('Failed to save');
    },

    async load(token: string): Promise<CloudBackup[]> {
        const res = await fetch('/api/content', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load');
        return await res.json() as CloudBackup[];
    }
};
