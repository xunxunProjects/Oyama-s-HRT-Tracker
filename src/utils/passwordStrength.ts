// A rough, dependency-free strength estimate for share passwords.
//
// The server already checks share passwords with bcrypt and caps guesses per
// link (worker.ts), so this is not the defence itself. It exists to stop the
// owner from picking something an attacker would try first: a common
// password, a keyboard walk, a date, one character repeated. The estimate is
// deliberately pessimistic about patterns and generous about nothing else.

export type PasswordStrength = 'weak' | 'fair' | 'strong';

/** Below this many estimated bits a password is refused. */
export const WEAK_BITS = 40;
/** At or above this many estimated bits a password reads as strong. */
export const STRONG_BITS = 60;

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

const poolSize = (password: string): number => {
    let pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/[0-9]/.test(password)) pool += 10;
    if (/[!-/:-@[-`{-~ ]/.test(password)) pool += 33;
    // Anything outside ASCII (CJK, accented letters, emoji) draws from a far
    // larger alphabet, but people pick common characters, so count it modestly.
    if (/[^\x20-\x7e]/.test(password)) pool += 100;
    return Math.max(pool, 10);
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
