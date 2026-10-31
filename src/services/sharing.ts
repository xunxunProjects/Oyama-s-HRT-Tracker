import { v4 as uuidv4 } from 'uuid';
import { DoseEvent, HRTMode, SimulationResult } from '../../logic';
import { EncryptedShareSnapshot, sanitizeShareSnapshot } from '../../shareSnapshotSchema';
import { apiEndpoint, apiFetch } from './apiClient';
import {
    decryptShareSnapshot,
    encryptShareSnapshot,
    unwrapShareKey,
    WrappedShareKey,
    wrapShareKey,
} from './shareCrypto';

export interface SharedDosageSnapshot {
    version: 1;
    mode: HRTMode;
    timezone: string;
    createdAt: number;
    events: DoseEvent[];
    simulation: SimulationResult | null;
}

export interface ShareDetails {
    passwordRequired: boolean;
    live: boolean;
    createdAt: number;
    updatedAt: number;
    expiresAt: number | null;
    snapshot: SharedDosageSnapshot;
    /** Proof this browser gave the right password; sent back on later reads instead of re-checking it. */
    viewerPass?: string;
    /** IV of the sealed payload, used to skip re-decrypting an unchanged live share. */
    envelopeFingerprint?: string;
}

/** What the access endpoint returns before the viewer decrypts anything. */
type RawShareDetails = Omit<ShareDetails, 'snapshot'> & {
    snapshot?: SharedDosageSnapshot;
    encryptedSnapshot?: EncryptedShareSnapshot;
};

export interface CreatedShare {
    id: string;
    token: string;
    /** The full link, key included. Exists only on this device; the server never had it. */
    url: string;
    createdAt: number;
    expiresAt: number | null;
    passwordRequired: boolean;
    live: boolean;
    mode: HRTMode | null;
    updatedAt: number;
    encrypted: boolean;
    wrappedKey: WrappedShareKey | null;
}

export interface LockedShare {
    passwordRequired: true;
    live: boolean;
    createdAt: number;
    updatedAt: number;
    expiresAt: number | null;
}

export interface ShareSummary {
    id: string;
    createdAt: number;
    expiresAt: number | null;
    passwordRequired: boolean;
    live: boolean;
    mode: HRTMode | null;
    updatedAt: number;
    expired: boolean;
    /** False only for links made before share encryption shipped. */
    encrypted: boolean;
    wrappedKey: WrappedShareKey | null;
}

export class ShareApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly retryAfterMs: number | null = null,
    ) {
        super(message);
        this.name = 'ShareApiError';
    }
}

/** Thrown when a link's key is missing or does not open what the server sent. */
export const SHARE_KEY_INVALID = 'SHARE_KEY_INVALID';

/** Errors that cannot be fixed by polling again: deleted, expired, or a bad key. */
export const isTerminalLiveShareError = (error: unknown): boolean =>
    error instanceof ShareApiError &&
    (error.status === 410 ||
        error.status === 404 ||
        error.code === 'SHARE_EXPIRED' ||
        error.code === SHARE_KEY_INVALID);

/**
 * Prepare a snapshot for one link and seal it with that link's key. The
 * server used to rebuild every snapshot field by field so nothing but dosage
 * data could reach a public link; it cannot see inside a sealed one, so the
 * same check runs here first. Each link also gets its own event IDs, so
 * recipients of two links cannot match records across them.
 */
export async function sealSnapshotForLink(
    snapshot: SharedDosageSnapshot,
    key: string,
): Promise<EncryptedShareSnapshot> {
    const sanitized = sanitizeShareSnapshot({
        ...snapshot,
        events: snapshot.events.map(event => ({ ...event, id: uuidv4() })),
    });
    if (!sanitized.snapshot) throw new ShareApiError(400, 'INVALID_SNAPSHOT', sanitized.error ?? 'Invalid snapshot');
    return encryptShareSnapshot(sanitized.snapshot, key);
}

const openDetails = async (
    raw: RawShareDetails,
    key: string | null,
    previous?: ShareDetails,
): Promise<ShareDetails> => {
    if (raw.encryptedSnapshot) {
        // Live links re-fetch the same ciphertext every 10s. The IV is unique
        // per sealed payload, so an unchanged IV means there is nothing new to
        // decrypt or decompress.
        if (previous?.envelopeFingerprint === raw.encryptedSnapshot.iv) return previous;
        const snapshot = key ? await decryptShareSnapshot(raw.encryptedSnapshot, key) : null;
        if (!snapshot) throw new ShareApiError(400, SHARE_KEY_INVALID, 'The link key is missing or wrong');
        return {
            ...raw,
            snapshot: snapshot as unknown as SharedDosageSnapshot,
            envelopeFingerprint: raw.encryptedSnapshot.iv,
        };
    }
    if (!raw.snapshot) throw new ShareApiError(404, 'SHARE_NOT_FOUND', 'Share not found');
    return { ...raw, snapshot: raw.snapshot };
};

const readError = async (response: Response): Promise<ShareApiError> => {
    let body: { code?: string; message?: string } | null = null;
    try {
        body = (await response.json()) as { code?: string; message?: string };
    } catch {
        // The worker also has plain-text error responses outside share routes.
    }
    const retryAfterSeconds = Number(response.headers.get('Retry-After'));
    return new ShareApiError(
        response.status,
        body?.code ?? 'SHARE_REQUEST_FAILED',
        body?.message ?? `Share request failed (${response.status})`,
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1_000 : null,
    );
};

export const sharingService = {
    async create(
        authToken: string,
        encryptedSnapshot: EncryptedShareSnapshot,
        options: { password?: string; expiresAt: number; live?: boolean; wrappedKey?: WrappedShareKey },
    ): Promise<CreatedShare> {
        const response = await apiFetch(apiEndpoint('/api/shares'), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                encryptedSnapshot,
                wrappedKey: options.wrappedKey,
                password: options.password || undefined,
                expiresAt: options.expiresAt,
                live: options.live ?? false,
            }),
        });
        if (!response.ok) throw await readError(response);
        return (await response.json()) as CreatedShare;
    },

    async open(token: string, key: string | null, previous?: ShareDetails): Promise<ShareDetails | LockedShare> {
        const response = await fetch(apiEndpoint('/api/shares/access'), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({ token }),
        });
        if (response.status === 401) {
            const body = (await response.json()) as LockedShare & { code?: string };
            if (body.code === 'PASSWORD_REQUIRED' || body.passwordRequired) return body;
        }
        if (!response.ok) throw await readError(response);
        return openDetails((await response.json()) as RawShareDetails, key, previous);
    },

    async unlock(
        token: string,
        key: string | null,
        password: string,
        viewerPass?: string,
        previous?: ShareDetails,
    ): Promise<ShareDetails> {
        const response = await fetch(apiEndpoint('/api/shares/access'), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({ token, password, viewerPass }),
        });
        if (!response.ok) throw await readError(response);
        return openDetails((await response.json()) as RawShareDetails, key, previous);
    },

    async list(authToken: string): Promise<ShareSummary[]> {
        const response = await apiFetch(apiEndpoint('/api/shares'), {
            headers: {
                Authorization: `Bearer ${authToken}`,
                Accept: 'application/json',
            },
            cache: 'no-store',
        });
        if (!response.ok) throw await readError(response);
        const body = (await response.json()) as { shares: ShareSummary[] };
        return body.shares;
    },

    /** Push freshly sealed snapshots to the owner's encrypted live links, one per link. */
    async syncEncryptedLive(
        authToken: string,
        updates: { id: string; encryptedSnapshot: EncryptedShareSnapshot }[],
        signal?: AbortSignal,
    ): Promise<{ updated: number; updatedAt: number }> {
        const response = await apiFetch(apiEndpoint('/api/shares/live'), {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ updates }),
            signal,
        });
        if (!response.ok) throw await readError(response);
        return (await response.json()) as { updated: number; updatedAt: number };
    },

    /** Live links made before share encryption shipped still take a plaintext snapshot. */
    async syncLegacyLive(
        authToken: string,
        snapshot: SharedDosageSnapshot,
        signal?: AbortSignal,
    ): Promise<{ updated: number; updatedAt: number }> {
        const response = await apiFetch(apiEndpoint('/api/shares/live'), {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ snapshot }),
            signal,
        });
        if (!response.ok) throw await readError(response);
        return (await response.json()) as { updated: number; updatedAt: number };
    },

    async replaceWrappedKeys(authToken: string, keys: { id: string; wrappedKey: WrappedShareKey }[]): Promise<void> {
        const response = await apiFetch(apiEndpoint('/api/shares/keys'), {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ keys }),
        });
        if (!response.ok) throw await readError(response);
    },

    async revoke(authToken: string, shareId: string): Promise<void> {
        const response = await apiFetch(apiEndpoint(`/api/shares/${encodeURIComponent(shareId)}`), {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!response.ok) throw await readError(response);
    },
};

export const LIVE_SHARES_CHANGED_EVENT = 'hrt-live-shares-changed';

export const notifyLiveSharesChanged = (): void => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(LIVE_SHARES_CHANGED_EVENT));
};

/**
 * After a password change, re-seal every live link key from the old cloud key
 * to the new one, so this account's devices can keep those links updated.
 * Keys this device cannot open are left as they are.
 */
export async function rewrapLiveShareKeys(authToken: string, oldCloudKey: string, newCloudKey: string): Promise<void> {
    const shares = await sharingService.list(authToken);
    const keys: { id: string; wrappedKey: WrappedShareKey }[] = [];
    for (const share of shares) {
        if (share.expired || !share.wrappedKey) continue;
        const opened = await unwrapShareKey(share.wrappedKey, oldCloudKey);
        if (opened) keys.push({ id: share.id, wrappedKey: await wrapShareKey(opened.key, opened.mode, newCloudKey) });
    }
    if (keys.length > 0) await sharingService.replaceWrappedKeys(authToken, keys);
}
