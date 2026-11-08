import type { Env } from './env';

/**
 * A hard ceiling for user-supplied content, kept below D1's database size cap.
 *
 * Without it, open registration plus per-account backup and share quotas lets
 * an unauthenticated flood fill the database; once D1 is full every write for
 * every user fails. usage is maintained by triggers on content and
 * dosage_shares, so the check is a single-row read rather than a table scan.
 */
const DEFAULT_LIMIT_BYTES = 9 * 1024 * 1024 * 1024;

export class StorageBudgetExceededError extends Error {
    constructor() {
        super('STORAGE_BUDGET_EXCEEDED');
        this.name = 'StorageBudgetExceededError';
    }
}

export async function storageBudgetBytes(env: Env): Promise<number> {
    const configured = Number(env.MAX_STORED_CONTENT_BYTES);
    if (Number.isSafeInteger(configured) && configured > 0) return configured;
    const row = (await env.DB.prepare('SELECT limit_bytes FROM storage_usage WHERE id = 1').first()) as {
        limit_bytes?: number;
    } | null;
    const stored = Number(row?.limit_bytes);
    return Number.isSafeInteger(stored) && stored > 0 ? stored : DEFAULT_LIMIT_BYTES;
}

export async function storageUsedBytes(env: Env): Promise<number> {
    const row = (await env.DB.prepare('SELECT bytes FROM storage_usage WHERE id = 1').first()) as {
        bytes?: number;
    } | null;
    return Math.max(0, Number(row?.bytes ?? 0));
}

export async function hasStorageBudget(env: Env, additionalBytes: number): Promise<boolean> {
    const [used, limit] = await Promise.all([storageUsedBytes(env), storageBudgetBytes(env)]);
    return used + Math.max(0, additionalBytes) <= limit;
}

export async function assertStorageBudget(env: Env, additionalBytes: number): Promise<void> {
    if (!(await hasStorageBudget(env, additionalBytes))) throw new StorageBudgetExceededError();
}
