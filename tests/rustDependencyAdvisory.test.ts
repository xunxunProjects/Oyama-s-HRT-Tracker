import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lockfile = readFileSync(new URL('../src-tauri/Cargo.lock', import.meta.url), 'utf8');

function lockedVersion(crate: string): string {
    const block = lockfile.match(new RegExp(`\\[\\[package\\]\\]\\nname = "${crate}"\\nversion = "([^"]+)"`));
    expect(block, `${crate} must be in src-tauri/Cargo.lock`).not.toBeNull();
    return block![1];
}

function atLeast(version: string, minimum: string): boolean {
    const left = version.split('.').map(Number);
    const right = minimum.split('.').map(Number);
    for (let i = 0; i < right.length; i += 1) {
        if (left[i] !== right[i]) return left[i] > right[i];
    }
    return true;
}

describe('Rust dependency advisory regression', () => {
    it('keeps url at or above the RUSTSEC-2026-0592 fix', () => {
        // Stack overflow in Url::origin() on nested blob: URLs, fixed in 2.5.9.
        expect(atLeast(lockedVersion('url'), '2.5.9')).toBe(true);
    });
});
