export interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    JWT_SECRET: string;
    ADMIN_USERNAME?: string;
    ADMIN_PASSWORD?: string;
    PUBLIC_APP_ORIGIN?: string;
    AVATAR_BUCKET: R2Bucket;
    ENVIRONMENT?: string;
    HRT_RAW_ENABLED?: string;
    HRT_SERVICE_TOKEN?: string;
    HRT_IP_KEY?: string;
    HRT_F2F_ESCROW?: string;
    HRT_ESCROW_KEY?: string;
    TRUSTED_IP_SOURCE?: string;
    RL_PER_MINUTE_10?: RateLimit;
    RL_PER_MINUTE_20?: RateLimit;
    RL_PER_MINUTE_30?: RateLimit;
    RL_PER_MINUTE_60?: RateLimit;
    RL_PER_MINUTE_300?: RateLimit;
}
