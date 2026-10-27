export interface CalibrationDomain {
    lo: number;
    hi: number;
    ticks: number[];
}

const STEPS = [1, 2, 5, 10];

// Snap a value down/up to the 1-2-5 sequence, so the axes end on round numbers.
export const snap125 = (v: number, dir: 'down' | 'up'): number => {
    if (!Number.isFinite(v) || v <= 0) return v;
    const mag = Math.pow(10, Math.floor(Math.log10(v) + 1e-12));
    const n = v / mag;
    const s =
        dir === 'down' ? ([...STEPS].reverse().find(x => x <= n + 1e-9) ?? 1) : (STEPS.find(x => x >= n - 1e-9) ?? 10);
    const snapped = s * mag;
    return Number.isFinite(snapped) ? snapped : v;
};

// Keep labels short enough for an axis, without losing the magnitude.
export const formatAxisTick = (v: number): string => {
    if (!Number.isFinite(v) || v <= 0) return '';
    if (v >= 1e5 || v < 0.01) {
        const exponent = Math.floor(Math.log10(v) + 1e-12);
        const mantissa = Math.round((v / Math.pow(10, exponent)) * 10) / 10;
        return `${mantissa}e${exponent}`;
    }
    if (v < 1) return String(Number(v.toPrecision(2)));
    return String(Math.round(v));
};

// 1-2-5 ticks across the domain, thinned to decades and finally sampled down
// to at most `maxTicks`, so a 27-decade outlier cannot stack labels.
export const logTicks = (lo: number, hi: number, maxTicks = 8): number[] => {
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi <= lo) return [];
    if (!Number.isFinite(maxTicks) || maxTicks < 2) return [];
    const limit = Math.max(2, Math.floor(maxTicks));

    const all: number[] = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
        for (const s of [1, 2, 5]) {
            const v = s * Math.pow(10, e);
            if (v >= lo * 0.999 && v <= hi * 1.001) all.push(v);
        }
    }
    if (all.length <= limit) return all;

    const lead = (v: number) => Math.round(v / Math.pow(10, Math.floor(Math.log10(v) + 1e-9)));
    const noTwos = all.filter(v => lead(v) !== 2);
    if (noTwos.length <= limit) return noTwos;

    const decades = all.filter(v => lead(v) === 1);
    if (decades.length <= limit) return decades;
    if (!decades.length) return noTwos.slice(0, limit);

    const count = Math.min(limit, decades.length);
    return Array.from({ length: count }, (_, i) => {
        const index = count === 1 ? 0 : Math.round((i * (decades.length - 1)) / (count - 1));
        return decades[index];
    });
};

// Build the shared x/y domain from finite, positive observations. Invalid
// entries are ignored so one bad lab cannot turn both axes into NaN/Infinity.
export const calibrationDomain = (values: readonly number[], maxTicks = 8): CalibrationDomain | null => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const value of values) {
        if (!Number.isFinite(value) || value <= 0) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

    let lo = snap125(min / 1.35, 'down');
    let hi = snap125(max * 1.35, 'up');
    if (!Number.isFinite(hi) || hi <= lo) {
        lo = snap125(min, 'down');
        hi = snap125(max, 'up');
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;

    const ticks = logTicks(lo, hi, maxTicks);
    return ticks.length ? { lo, hi, ticks } : null;
};
