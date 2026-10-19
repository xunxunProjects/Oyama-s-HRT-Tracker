/**
 * `/api/tool/v1/*` contract helpers.
 *
 * The route dispatch lives in worker.ts so the tool namespace shares the
 * existing JWT, session, rate-limit, login and content plumbing. This module
 * owns the version advertisement and the extra fields the CLI expects on a
 * login response.
 */

export const TOOL_API_VERSION = 1;
export const TOOL_MIN_VERSION = '0.1.0';
export const TOOL_TRANSPORTS = ['tls'] as const;

export const toolServerTime = (): string => new Date().toISOString();

export const toolVersionBody = () => ({
    apiVersion: TOOL_API_VERSION,
    minToolVersion: TOOL_MIN_VERSION,
    transport: [...TOOL_TRANSPORTS],
    serverTime: toolServerTime(),
});

/** Add the tool fields to a successful login response, leaving errors alone. */
export function addToolLoginFields<T extends Record<string, unknown>>(
    body: T,
): T & {
    apiVersion: number;
    serverTime: string;
    transport: string[];
} {
    return {
        ...body,
        apiVersion: TOOL_API_VERSION,
        serverTime: toolServerTime(),
        transport: [...TOOL_TRANSPORTS],
    };
}
