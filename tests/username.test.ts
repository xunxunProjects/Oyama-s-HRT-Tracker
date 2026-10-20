import { describe, expect, it } from 'vitest';
import { isValidUsername } from '../src/utils/username';

describe('isValidUsername', () => {
    it.each(['abc', 'user_name-1', 'A1_b-2'])('accepts %s', username => {
        expect(isValidUsername(username)).toBe(true);
    });

    it.each(['', 'a', 'ab', 'user name', 'üser', 'user.name', 'abc ', 'a'.repeat(31)])('rejects %j', username => {
        expect(isValidUsername(username)).toBe(false);
    });
});
