const DEFAULT_API_PORT = '8787';

type Env = Record<string, string | undefined>;

/**
 * The E2E API port is the single source of truth. The Worker, Playwright's
 * readiness probe, the Vite proxy, and the API helpers all derive from it.
 */
export function resolveApiPort(env: Env = process.env): string {
    return env.E2E_API_PORT ?? DEFAULT_API_PORT;
}

export function resolveApiOrigin(env: Env = process.env): string {
    return `http://127.0.0.1:${resolveApiPort(env)}`;
}
