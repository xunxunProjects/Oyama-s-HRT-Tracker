export interface CloudBackup {
    id: number;
    user_id: string;
    slot: string;
    data: string;
    created_at: number;
}

export const cloudService = {
    async save(token: string, data: any, slot: string = 'default'): Promise<void> {
        const res = await fetch('/api/content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ data, slot })
        });
        if (!res.ok) throw new Error('Failed to save');
    },

    async load(token: string, slot?: string): Promise<CloudBackup[]> {
        const url = slot ? `/api/content?slot=${encodeURIComponent(slot)}` : '/api/content';
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load');
        return await res.json() as CloudBackup[];
    }
};
