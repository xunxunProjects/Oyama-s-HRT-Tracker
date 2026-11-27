import type { Env } from './env';

const RATE_LIMIT_CLASSES: Record<number, keyof Env> = {
    10: 'RL_PER_MINUTE_10',
    20: 'RL_PER_MINUTE_20',
    30: 'RL_PER_MINUTE_30',
    60: 'RL_PER_MINUTE_60',
    300: 'RL_PER_MINUTE_300',
};
const missingLimiterReported = new Set<string>();
const WINDOW_MS = 60_000;
const MAX_FALLBACK_KEYS = 10_000;
const fallbackHits = new WeakMap<Env, Map<string, number[]>>();

/** Per-isolate fallback for local/self-hosted deployments without Rate Limit bindings. */
function inMemoryAllowed(env: Env, key: string, perMinute: number): boolean {
    const now = Date.now();
    const mapKey = `${perMinute}:${key}`;
    const buckets = fallbackHits.get(env) ?? new Map<string, number[]>();
    fallbackHits.set(env, buckets);
    const hits = (buckets.get(mapKey) ?? []).filter(ts => now - ts < WINDOW_MS);
    if (hits.length >= perMinute) {
        buckets.set(mapKey, hits);
        return false;
    }
    hits.push(now);
    buckets.set(mapKey, hits);

    if (buckets.size > MAX_FALLBACK_KEYS) {
        for (const [otherKey, otherHits] of buckets) {
            if (otherHits.every(ts => now - ts >= WINDOW_MS)) buckets.delete(otherKey);
        }
        while (buckets.size > MAX_FALLBACK_KEYS) {
            const oldest = buckets.keys().next();
            if (oldest.done) break;
            buckets.delete(oldest.value);
        }
    }
    return true;
}

/** True when the caller is within `perMinute` requests a minute for `key`. */
export async function passwordCheckAllowed(env: Env, userId: string): Promise<boolean> {
    return checkRateLimit(env, `password-check:${userId}`, 10);
}

export async function checkRateLimit(env: Env, key: string, perMinute: number): Promise<boolean> {
    const bindingName = RATE_LIMIT_CLASSES[perMinute];
    const limiter = bindingName ? (env[bindingName] as RateLimit | undefined) : undefined;
    if (!limiter) {
        const what = bindingName ?? `no class for ${perMinute}/min`;
        if (!missingLimiterReported.has(what)) {
            missingLimiterReported.add(what);
            console.error(`Rate limiting binding missing (${what}); using a per-isolate memory limiter.`);
        }
        return inMemoryAllowed(env, key, perMinute);
    }
    try {
        const { success } = await limiter.limit({ key });
        return success;
    } catch (e) {
        console.error('Rate limit check failed; denying request:', e);
        return false;
    }
}
