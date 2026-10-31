import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vps = readFileSync(resolve(root, 'wiki/Deployment-VPS.md'), 'utf8');

describe('VPS deployment hardening', () => {
    it('turns off Wrangler admin surfaces in the systemd unit', () => {
        expect(vps).toContain('Environment=X_LOCAL_EXPLORER=false');
        expect(vps).toContain('Environment=X_LOCAL_OBSERVABILITY=false');
    });

    it('blocks the Wrangler admin path at the reverse proxy', () => {
        expect(vps).toMatch(/@wrangler_admin\s+path\s+\/cdn-cgi\/\*/);
        expect(vps).toMatch(/respond\s+@wrangler_admin\s+404/);
    });
});
