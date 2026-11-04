export function timingSafeEqual(a: string, b: string): boolean {
    try {
        const enc = new TextEncoder();
        const aBytes = enc.encode(a);
        const bBytes = enc.encode(b);

        const TARGET_LEN = 512;
        const aFixed = new Uint8Array(TARGET_LEN);
        const bFixed = new Uint8Array(TARGET_LEN);

        aFixed.set(aBytes.slice(0, TARGET_LEN));
        bFixed.set(bBytes.slice(0, TARGET_LEN));

        let result = 0;
        for (let i = 0; i < TARGET_LEN; i++) {
            result |= aFixed[i] ^ bFixed[i];
        }

        return result === 0 && aBytes.length === bBytes.length && aBytes.length <= TARGET_LEN;
    } catch (e) {
        return false;
    }
}
