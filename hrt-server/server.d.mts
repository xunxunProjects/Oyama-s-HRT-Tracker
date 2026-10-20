import type { Server as TlsServer } from 'node:tls';

export const HRT_MAX_FRAME_BYTES: number;

export class HrtFrameError extends Error {
    code: string;
}

export function encodeFrame(message: Record<string, unknown>): Buffer;
export function decodeFrame(frame: Buffer): Record<string, unknown>;

export interface HrtServerOptions {
    key: string | Buffer;
    cert: string | Buffer;
    webOrigin: string;
    serviceToken: string;
    maxConnections?: number;
    authorizeCacheMs?: number;
    requestTimeoutMs?: number;
    idleTimeoutMs?: number;
    handshakeTimeoutMs?: number;
}

export function createHrtServer(options: HrtServerOptions): TlsServer;

export function startFromEnv(env?: NodeJS.ProcessEnv): Promise<TlsServer | null>;
