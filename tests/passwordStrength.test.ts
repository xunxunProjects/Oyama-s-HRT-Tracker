import { describe, expect, it } from 'vitest';
import {
    MAX_PASSWORD_BYTES,
    analyzePasswordCharset,
    charsetSize,
    estimatePasswordBits,
    passwordByteLength,
    passwordStrength,
    theoreticalPasswordBits,
} from '../passwordStrength';

describe('password strength', () => {
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

    it('measures the UTF-8 byte length bcrypt sees', () => {
        expect(passwordByteLength('abc')).toBe(3);
        expect(passwordByteLength('猫')).toBe(3);
        expect(MAX_PASSWORD_BYTES).toBe(72);
    });
});

describe('theoretical password entropy', () => {
    it('computes H = L x log2(N) from the observed character classes', () => {
        expect(theoreticalPasswordBits('abcdef')).toEqual({ length: 6, charsetSize: 26, bits: 6 * Math.log2(26) });
        expect(theoreticalPasswordBits('abcdef')!.bits).toBeCloseTo(28.202639, 5);
        expect(theoreticalPasswordBits('abcABC123')!.bits).toBe(9 * Math.log2(62));
        expect(theoreticalPasswordBits('abc123!')!.bits).toBe(7 * Math.log2(69));
        expect(theoreticalPasswordBits('12345678')!.bits).toBe(8 * Math.log2(10));
    });

    it('uses the provided alphabet size when the caller knows it', () => {
        expect(theoreticalPasswordBits('abcdef', 94)).toEqual({ length: 6, charsetSize: 94, bits: 6 * Math.log2(94) });
        expect(theoreticalPasswordBits('a!', 59)!.bits).toBe(2 * Math.log2(59));
    });

    it('counts Unicode code points, not UTF-16 units', () => {
        const cjk = theoreticalPasswordBits('密码')!;
        expect(cjk.length).toBe(2);
        expect(cjk.charsetSize).toBe(100);
        expect(cjk.bits).toBe(2 * Math.log2(100));

        const astral = theoreticalPasswordBits('𝄞𝄞')!;
        expect(astral.length).toBe(2);
        expect(astral.bits).toBe(2 * Math.log2(100));
    });

    it('returns null instead of a made-up result for empty input or invalid alphabets', () => {
        expect(theoreticalPasswordBits('')).toBeNull();
        expect(theoreticalPasswordBits('abcabc', 0)).toBeNull();
        expect(theoreticalPasswordBits('abcabc', 1)).toBeNull();
        expect(theoreticalPasswordBits('abcabc', -5)).toBeNull();
        expect(theoreticalPasswordBits('abcabc', Number.NaN)).toBeNull();
        expect(theoreticalPasswordBits('abcabc', Number.POSITIVE_INFINITY)).toBeNull();
    });

    it('reports which classes were observed and their combined alphabet size', () => {
        expect(analyzePasswordCharset('aA1!猫')).toEqual({
            lower: true,
            upper: true,
            digits: true,
            symbols: true,
            nonAscii: true,
        });
        expect(analyzePasswordCharset('abc')).toEqual({
            lower: true,
            upper: false,
            digits: false,
            symbols: false,
            nonAscii: false,
        });
        expect(charsetSize(analyzePasswordCharset('a'))).toBe(26);
        expect(charsetSize(analyzePasswordCharset('A'))).toBe(26);
        expect(charsetSize(analyzePasswordCharset('1'))).toBe(10);
        expect(charsetSize(analyzePasswordCharset('!'))).toBe(33);
        expect(charsetSize(analyzePasswordCharset('猫'))).toBe(100);
        expect(charsetSize(analyzePasswordCharset('a1'))).toBe(36);
        expect(charsetSize(analyzePasswordCharset('aA1!'))).toBe(95);
    });
});
