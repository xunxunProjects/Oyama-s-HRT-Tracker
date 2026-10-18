// A rough, dependency-free strength estimate shared by the worker and the UI.
//
// The server hashes passwords with bcrypt and caps guesses per account, per
// link and per address, so this is not the defence itself. It exists to stop
// someone picking something an attacker would try first: a common password, a
// keyboard walk, a date, one character repeated. The estimate is deliberately
// pessimistic about patterns and generous about nothing else.

export type PasswordStrength = 'weak' | 'fair' | 'strong';

/** Shortest password the server accepts for an account, a share or an export. */
export const MIN_PASSWORD_LENGTH = 8;

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
    'zaq12wsx',
    '1q2w3e4r',
    'q1w2e3r4',
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

// Keyboard rows, the shifted number row, and the columns people walk down
// ("1qaz", "2wsx"): a step along any of these is a run, not a new choice.
const ROWS = [
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
    '1234567890',
    '!@#$%^&*()',
    'abcdefghijklmnopqrstuvwxyz',
    '1qaz',
    '2wsx',
    '3edc',
    '4rfv',
    '5tgb',
    '6yhn',
    '7ujm',
    '8ik,',
    '9ol.',
    '0p;/',
];

// Words long enough to look for anywhere in a password. The shorter entries
// ("qq", "li", "abc") would match inside almost anything, so they only count
// when they are the whole password minus its trimmings.
const WORDS = [...COMMON].filter(word => word.length >= 4).sort((a, b) => b.length - a.length);

// Common letter swaps, undone before looking for words, so "Pa$$w0rd" is still
// "password". "1" stands for both "i" and "l", so it is tried both ways.
const LEET: Record<string, string> = {
    '0': 'o',
    '@': 'a',
    '4': 'a',
    $: 's',
    '5': 's',
    '3': 'e',
    '!': 'i',
    '7': 't',
    '+': 't',
};

// Year-month-day, day-month-year and month-day-year, with or without
// separators, anchored at the start of whatever they are tested against.
const DATES = [
    /^(19|20)\d{2}[-./]?(0[1-9]|1[0-2])[-./]?(0[1-9]|[12]\d|3[01])/,
    /^(0[1-9]|[12]\d|3[01])[-./]?(0[1-9]|1[0-2])[-./]?(19|20)\d{2}/,
    /^(0[1-9]|1[0-2])[-./]?(0[1-9]|[12]\d|3[01])[-./]?(19|20)\d{2}/,
];

const dateLength = (text: string): number => {
    for (const pattern of DATES) {
        const match = pattern.exec(text);
        if (match) return match[0].length;
    }
    return 0;
};

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

// The guess model's alphabet. Unlike charsetSize, a space on its own adds one
// choice, not all 33 symbols: it is the separator between words, and counting
// it as a symbol made every lowercase passphrase look 1.2 bits stronger per
// character.
const poolSize = (password: string): number => {
    const charset = analyzePasswordCharset(password);
    const onlySpaces = charset.symbols && !/[!-/:-@[-`{-~]/.test(password);
    return Math.max(charsetSize({ ...charset, symbols: false }) + (onlySpaces ? 1 : charset.symbols ? 33 : 0), 10);
};

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
 * A span starting at `i` that an attacker would try as one piece: a date
 * (worth two characters), a common word with its letter swaps undone, or a
 * chunk of three or more characters already typed earlier (one character
 * each). Returns null when the next character stands on its own.
 */
const patternAt = (chars: string[], swapped: string[][], i: number): { length: number; weight: number } | null => {
    const date = dateLength(chars.slice(i).join(''));
    if (date) return { length: date, weight: 2 };
    for (const word of WORDS) {
        if (swapped.some(variant => Array.from(word).every((letter, j) => variant[i + j] === letter))) {
            return { length: word.length, weight: 1 };
        }
    }
    const before = chars.slice(0, i).join('');
    for (let size = Math.min(chars.length - i, i); size >= 3; size--) {
        if (before.includes(chars.slice(i, i + size).join(''))) return { length: size, weight: 1 };
    }
    return null;
};

/**
 * How many characters actually carry surprise. A run of the same character or
 * along the alphabet or a keyboard row counts as about one character, and so
 * does each word, date or repeated chunk, wherever it sits in the password.
 */
const effectiveLength = (lower: string): number => {
    const chars = Array.from(lower);
    const swapped = ['i', 'l'].map(one => chars.map(char => (char === '1' ? one : (LEET[char] ?? char))));
    let length = 0;
    let prev: string | null = null;
    let runLength = 0;
    for (let i = 0; i < chars.length;) {
        const pattern = patternAt(chars, swapped, i);
        if (pattern) {
            length += pattern.weight;
            prev = null;
            i += pattern.length;
            continue;
        }
        const cur = chars[i];
        if (prev !== null && (cur === prev || isStep(prev, cur))) {
            runLength++;
            // The second character of a run still adds a little: it fixes the
            // direction. Everything after that is free to guess.
            if (runLength === 2) length += 0.5;
        } else {
            runLength = 1;
            length += 1;
        }
        prev = cur;
        i++;
    }
    return length;
};

/** Estimated bits of entropy. Pessimistic about patterns. */
export function estimatePasswordBits(password: string): number {
    if (typeof password !== 'string' || !password) return 0;
    const lower = password.toLowerCase();
    const core = lower.replace(/[\d!-/:-@[-`{-~ ]+$/, '').replace(/^[\d!-/:-@[-`{-~ ]+/, '');
    if (COMMON.has(lower) || (core && COMMON.has(core) && lower.length - core.length <= 6)) return 10;
    if (dateLength(lower) === lower.length || /^(?:520|1314)+\d{0,4}$/.test(lower)) return 10;
    return effectiveLength(lower) * Math.log2(poolSize(password));
}

export function passwordStrength(password: string): PasswordStrength {
    const bits = estimatePasswordBits(password);
    if (bits < WEAK_BITS) return 'weak';
    if (bits < STRONG_BITS) return 'fair';
    return 'strong';
}

export type NewPasswordLevel = PasswordStrength | 'tooLong';

/**
 * What the form should say about a password being chosen: nothing until it
 * reaches the minimum length, 'tooLong' past what bcrypt reads, otherwise its
 * strength. The server refuses 'weak' and 'tooLong' the same way.
 */
export function newPasswordLevel(password: string): NewPasswordLevel | null {
    if (password.length < MIN_PASSWORD_LENGTH) return null;
    if (passwordByteLength(password) > MAX_PASSWORD_BYTES) return 'tooLong';
    return passwordStrength(password);
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
