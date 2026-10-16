// A rough, dependency-free strength estimate shared by the worker and the UI.
//
// The server hashes passwords with bcrypt and caps guesses per account, per
// link and per address, so this is not the defence itself. It exists to stop
// someone picking something an attacker would try first: a common password, a
// keyboard walk, a date, one character repeated. The estimate is deliberately
// pessimistic about patterns and generous about nothing else.

export type PasswordStrength = 'weak' | 'fair' | 'strong';

/** Below this many estimated bits a password is refused. */
export const WEAK_BITS = 40;
/** At or above this many estimated bits a password reads as strong. */
export const STRONG_BITS = 60;

/** bcrypt only reads the first 72 bytes of a password; anything past that is
 *  silently the same password, so setting one is refused instead (login keeps
 *  working for accounts made before this rule). */
export const MAX_PASSWORD_BYTES = 72;

/** UTF-8 length, which is what bcrypt truncates. */
export function passwordByteLength(password: string): number {
    return new TextEncoder().encode(password).length;
}

// The passwords leaked lists are made of, plus the ones common among Chinese
// speaking users. Matched after lowercasing and stripping trailing digits and
// symbols, so "Password123!" still counts as "password".
const COMMON = new Set([
    'password',
    'passw0rd',
    'p@ssw0rd',
    'iloveyou',
    'woaini',
    'woaiwojia',
    'aini',
    'qwerty',
    'qwertyuiop',
    'asdfgh',
    'asdfghjkl',
    'zxcvbnm',
    'qazwsx',
    '1qaz2wsx',
    'abc',
    'abcd',
    'abcdef',
    'abcdefg',
    'abcdefgh',
    'admin',
    'administrator',
    'root',
    'letmein',
    'welcome',
    'monkey',
    'dragon',
    'master',
    'sunshine',
    'princess',
    'football',
    'baseball',
    'superman',
    'batman',
    'shadow',
    'michael',
    'qq',
    'wang',
    'zhang',
    'li',
    'liu',
    'chen',
    'hrt',
    'estradiol',
    'estrogen',
    'trans',
    'hello',
    'test',
    'guest',
    'secret',
    'changeme',
    'mima',
    'woshishui',
]);

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'abcdefghijklmnopqrstuvwxyz'];

// Character classes the estimator reasons about. These are model parameters
// (how many choices each class offers), not results: every value derived below
// comes from the password actually typed.
export interface PasswordCharset {
    lower: boolean;
    upper: boolean;
    digits: boolean;
    symbols: boolean;
    nonAscii: boolean;
}

const LOWER = /[a-z]/;
const UPPER = /[A-Z]/;
const DIGITS = /[0-9]/;
const SYMBOLS = /[!-/:-@[-`{-~ ]/;
const NON_ASCII = /[^\x20-\x7e]/;

/** Which character classes the password actually uses. */
export function analyzePasswordCharset(password: string): PasswordCharset {
    return {
        lower: LOWER.test(password),
        upper: UPPER.test(password),
        digits: DIGITS.test(password),
        symbols: SYMBOLS.test(password),
        nonAscii: NON_ASCII.test(password),
    };
}

/**
 * Alphabet size behind the observed classes: 26 lower + 26 upper + 10 digits
 * + 33 ASCII symbols (space included) + 100 for anything non-ASCII. People
 * pick common CJK, accented and emoji characters, so the real alphabet is far
 * larger, but counting it modestly keeps the estimate pessimistic.
 */
export function charsetSize(charset: PasswordCharset): number {
    let size = 0;
    if (charset.lower) size += 26;
    if (charset.upper) size += 26;
    if (charset.digits) size += 10;
    if (charset.symbols) size += 33;
    if (charset.nonAscii) size += 100;
    return size;
}

const poolSize = (password: string): number => Math.max(charsetSize(analyzePasswordCharset(password)), 10);

const isStep = (a: string, b: string): boolean => {
    const lowerA = a.toLowerCase();
    const lowerB = b.toLowerCase();
    if (Math.abs(lowerA.charCodeAt(0) - lowerB.charCodeAt(0)) === 1) return true;
    return ROWS.some(row => {
        const i = row.indexOf(lowerA);
        return i >= 0 && (row[i + 1] === lowerB || row[i - 1] === lowerB);
    });
};

/**
 * How many characters actually carry surprise. A run of the same character, a
 * run along the alphabet or a keyboard row, and a repeated chunk each count
 * as roughly one character.
 */
const effectiveLength = (password: string): number => {
    const chars = Array.from(password);
    // "abcabcabc", "1212121212": only the first copy of the chunk counts.
    for (let size = 1; size <= chars.length / 2; size++) {
        if (chars.length % size !== 0) continue;
        const chunk = chars.slice(0, size).join('');
        if (chunk.repeat(chars.length / size) === password) return effectiveLength(chunk) + 1;
    }
    let length = chars.length ? 1 : 0;
    let runLength = 1;
    for (let i = 1; i < chars.length; i++) {
        const prev = chars[i - 1];
        const cur = chars[i];
        if (cur === prev || isStep(prev, cur)) {
            runLength++;
            // The second character of a run still adds a little: it fixes the
            // direction. Everything after that is free to guess.
            if (runLength === 2) length += 0.5;
        } else {
            runLength = 1;
            length += 1;
        }
    }
    return length;
};

const looksLikeDate = (password: string): boolean =>
    /^(19|20)\d{2}[-./]?(0[1-9]|1[0-2])[-./]?(0[1-9]|[12]\d|3[01])$/.test(password) ||
    /^(0[1-9]|[12]\d|3[01])[-./]?(0[1-9]|1[0-2])[-./]?(19|20)\d{2}$/.test(password);

/** Estimated bits of entropy. Pessimistic about patterns. */
export function estimatePasswordBits(password: string): number {
    if (!password) return 0;
    const lower = password.toLowerCase();
    const core = lower.replace(/[\d!-/:-@[-`{-~ ]+$/, '').replace(/^[\d!-/:-@[-`{-~ ]+/, '');
    if (COMMON.has(lower) || (core && COMMON.has(core) && lower.length - core.length <= 6)) return 10;
    if (/^\d+$/.test(password) && (looksLikeDate(password) || /^(?:520|1314)+\d{0,4}$/.test(password))) return 10;
    return effectiveLength(password) * Math.log2(poolSize(password));
}

export function passwordStrength(password: string): PasswordStrength {
    const bits = estimatePasswordBits(password);
    if (bits < WEAK_BITS) return 'weak';
    if (bits < STRONG_BITS) return 'fair';
    return 'strong';
}

export interface TheoreticalEntropy {
    /** Code points, not UTF-16 units: an astral character counts once. */
    length: number;
    charsetSize: number;
    bits: number;
}

/**
 * Theoretical search-space entropy, H = L x log2(N), under the explicit
 * assumption that every position drew independently and uniformly from an
 * alphabet of N characters. N is taken from the classes the password actually
 * uses unless the caller knows better (a generator's real alphabet,
 * deduplicated, or a chosen charset): observed classes bound what the
 * password could have been drawn from, they do not say how it was made.
 *
 * This is the uniform-random model only. It is not the guess-model estimate
 * above, it is not a crack-time promise, and it must not be presented as
 * "this password is safe". Returns null for an empty password or an alphabet
 * under 2 choices: there is nothing to estimate and inventing a number would
 * fake precision.
 */
export function theoreticalPasswordBits(password: string, allowedCharsetSize?: number): TheoreticalEntropy | null {
    const length = Array.from(password).length;
    if (length === 0) return null;
    const size = allowedCharsetSize ?? charsetSize(analyzePasswordCharset(password));
    if (!Number.isFinite(size) || size < 2) return null;
    return { length, charsetSize: size, bits: length * Math.log2(size) };
}
