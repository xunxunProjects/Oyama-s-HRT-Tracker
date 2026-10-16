import { describe, expect, it } from 'vitest';
import { estimatePasswordBits, passwordStrength } from '../src/utils/passwordStrength';

describe('share password strength', () => {
    it.each([
        '12345678',
        '88888888',
        'aaaaaaaaaaaa',
        'abcdefgh',
        'qwertyuiop',
        'asdfghjkl;',
        'password',
        'Password123!',
        'woaini1314',
        '5201314520',
        '20000101',
        'abcabcabcabc',
        '1212121212',
        'iloveyou',
    ])('refuses %s', password => {
        expect(passwordStrength(password)).toBe('weak');
    });

    it('treats a long random mixed password as strong', () => {
        expect(passwordStrength('t7#Kq2!vRm9pLx')).toBe('strong');
    });

    it('treats a passphrase of several words as strong', () => {
        expect(passwordStrength('violet harbor tiny lantern')).toBe('strong');
    });

    it('treats a moderate password as fair', () => {
        expect(passwordStrength('Kf8mz2Qw')).toBe('fair');
    });

    it('counts non-Latin characters', () => {
        expect(estimatePasswordBits('猫猫今天也很开心')).toBeGreaterThanOrEqual(40);
    });

    it('scores the empty string as zero', () => {
        expect(estimatePasswordBits('')).toBe(0);
    });
});
