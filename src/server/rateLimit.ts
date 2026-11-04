import type { Env } from './env';

const RATE_LIMIT_CLASSES: Record<number, keyof Env> = {
    10: 'RL_PER_MINUTE_10',
    20: 'RL_PER_MINUTE_20',
    30: 'RL_PER_MINUTE_30',
    60: 'RL_PER_MINUTE_60',
    300: 'RL_PER_MINUTE_300',
};
const missingLimiterReported = new Set<string>();

/** True when the caller is within `perMinute` requests a minute for `key`. */
export async function checkRateLimit(env: Env, key: string, perMinute: number): Promise<boolean> {
    const bindingName = RATE_LIMIT_CLASSES[perMinute];
    const limiter = bindingName ? (env[bindingName] as RateLimit | undefined) : undefined;
    if (!limiter) {
        const what = bindingName ?? `no class for ${perMinute}/min`;
        if (!missingLimiterReported.has(what)) {
            missingLimiterReported.add(what);
            console.error(`Rate limiting binding missing (${what}); requests are NOT being limited.`);
        }
        return true;
    }
    try {
        const { success } = await limiter.limit({ key });
        return success;
    } catch (e) {
        console.error('Rate limit check failed:', e);
        return true;
    }
}
