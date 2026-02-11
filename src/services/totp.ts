/**
 * TOTP (Time-based One-Time Password) client utilities.
 * Communicates with the server-side TOTP endpoints for 2FA setup and verification.
 */

export interface TOTPSetupResponse {
    secret: string;
    otpauthUrl: string;
}

export const totpService = {
    /**
     * Request a new TOTP secret from the server for 2FA enrollment.
     */
    async setup(token: string): Promise<TOTPSetupResponse> {
        const res = await fetch('/api/totp/setup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        });
        if (!res.ok) throw new Error(await res.text());
        return (await res.json()) as TOTPSetupResponse;
    },

    /**
     * Confirm TOTP enrollment by verifying the first code.
     */
    async verify(token: string, code: string): Promise<void> {
        const res = await fetch('/api/totp/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ code }),
        });
        if (!res.ok) throw new Error(await res.text());
    },

    /**
     * Disable 2FA for the current user.
     */
    async disable(token: string, code: string): Promise<void> {
        const res = await fetch('/api/totp/disable', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ code }),
        });
        if (!res.ok) throw new Error(await res.text());
    },
};
