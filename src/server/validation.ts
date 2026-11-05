import type { Env } from './env';
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, passwordByteLength, passwordStrength } from '../../passwordStrength';

export const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
export const MAX_PASSWORD_LENGTH = 128;

const RESERVED_USERNAMES = new Set([
    'admin',
    'administrator',
    'root',
    'system',
    'sysadmin',
    'mod',
    'moderator',
    'support',
    'help',
    'staff',
    'owner',
    'official',
    'oauth',
    'api',
    'www',
    'me',
    'user',
    'users',
    'security',
    'null',
    'undefined',
]);

export function validateUsername(username: string): boolean {
    return USERNAME_REGEX.test(username) && !RESERVED_USERNAMES.has(username.toLowerCase());
}

export function reservedForAdmin(env: Env, username: string): boolean {
    const admin = env.ADMIN_USERNAME;
    return !!admin && admin.length > 0 && username.toLowerCase() === admin.toLowerCase();
}

export function validatePassword(password: unknown): { valid: boolean; error?: string } {
    if (typeof password !== 'string') return { valid: false, error: 'Password must be a string' };
    if (password.length < MIN_PASSWORD_LENGTH)
        return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` };
    if (password.length > MAX_PASSWORD_LENGTH)
        return { valid: false, error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters long` };
    if (passwordByteLength(password) > MAX_PASSWORD_BYTES)
        return { valid: false, error: `Password must be at most ${MAX_PASSWORD_BYTES} bytes (UTF-8)` };
    if (passwordStrength(password) === 'weak')
        return { valid: false, error: 'Password is too easy to guess; use a longer or less regular one' };
    return { valid: true };
}
