import { useId, useLayoutEffect, useRef } from 'react';

/* A number set on reels that roll as one.

   - While a finger drags the value, the number simply is the value: every
     change shows in the same frame as the rail under it, no roll, no blur.
   - When it changes in one step (a band picked, another route, an arrow
     key), every place rolls to its new digit together: the same start, the
     same ROLL_MS, the same easing, each the short way round in the
     direction the number went (up rolls up, down rolls down), with a faint
     vertical blur while it moves fast. A step started mid-roll carries on
     from wherever the reels are.
   - A place that comes or goes (9 → 24, 100 → 9) opens or folds in that
     same motion, so the unit after the number slides with it.

   Each place is a window one digit tall onto two stacked digits, the one
   at the reel's position and the next, moved by the fraction in between:
   the window is always filled by one or the other. Drawn by writing to the
   DOM each frame, never by re-rendering.

   The Overview's readings, the plan's counts and the model pages' figures
   all roll on it. */

const ROLL_MS = 380;
const MAX_BLUR = 1.4; // px: enough to read as motion, never enough to lose the digit

interface Reel {
    pos: number; // where the reel is, in digits (3.5 is halfway from 3 to 4)
    vis: number; // how open the place is, 0 (folded) to 1
    from: number;
    to: number;
    vFrom: number;
    vTo: number;
}

interface Nodes {
    slot: HTMLSpanElement | null;
    reel: HTMLSpanElement | null;
    a: HTMLSpanElement | null;
    b: HTMLSpanElement | null;
    blur: SVGFEGaussianBlurElement | null;
    shown: string; // what's painted, to skip writes that change nothing
}

const mod10 = (n: number) => ((Math.floor(n) % 10) + 10) % 10;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeOutRate = (t: number) => 3 * (1 - t) ** 2;
/** Slow in, slow out: for a number that moves on its own, not under a finger. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const easeInOutRate = (t: number) => (t < 0.5 ? 12 * t ** 2 : 3 * (-2 * t + 2) ** 2);

export function Odometer({
    value,
    decimals,
    places,
    instant = false,
    rollMs = ROLL_MS,
    gentle = false,
    className,
}: {
    value: number;
    /** Digits after the point; fixed, so each reel keeps its place. */
    decimals: number;
    /** Most places the number can need, whole and decimal. */
    places: number;
    /** Show each change at once (while the value is being dragged). */
    instant?: boolean;
    /** How long a roll takes. */
    rollMs?: number;
    /** Ease in as well as out (for a number that changes by itself, as in the intro). */
    gentle?: boolean;
    className?: string;
}) {
    const id = useId().replace(/:/g, '');
    const scaled = Math.max(0, Math.round(value * 10 ** decimals));
    const count = Math.max(places, decimals + 1, String(scaled).length);

    const reels = useRef<Reel[]>([]);
    const nodes = useRef<Nodes[]>([]);
    const at = (k: number) =>
        (nodes.current[k] ??= { slot: null, reel: null, a: null, b: null, blur: null, shown: '' });
    const target = useRef<number | null>(null);
    const layout = useRef(decimals);
    const raf = useRef(0);
    const start = useRef(0);
    const em = useRef(48);

    // Place k counts from the right: 0 is the last digit shown.
    const digit = (k: number, n: number) => Math.floor(n / 10 ** k) % 10;
    const open = (k: number, n: number) => (k <= decimals || Math.floor(n / 10 ** k) > 0 ? 1 : 0);

    const paint = (k: number, speed: number) => {
        const r = reels.current[k];
        const n = nodes.current[k];
        if (!r || !n?.slot || !n.reel || !n.a || !n.b) return;
        const base = Math.floor(r.pos + 1e-6);
        const frac = Math.max(0, r.pos - base);
        // Speed in digits per millisecond → how far the digits move in a frame.
        const perFrame = speed * 16.7 * em.current;
        const blur = Math.min(MAX_BLUR, perFrame * 0.12);
        const key = `${base}|${frac.toFixed(4)}|${r.vis.toFixed(3)}|${blur.toFixed(2)}`;
        if (key === n.shown) return;
        n.shown = key;
        n.a.textContent = String(mod10(base));
        n.b.textContent = String(mod10(base + 1));
        n.reel.style.transform = frac > 1e-4 ? `translate3d(0, ${(-frac).toFixed(4)}em, 0)` : '';
        n.slot.style.width = r.vis >= 1 ? '' : `${r.vis.toFixed(4)}ch`;
        n.slot.style.opacity = r.vis >= 1 ? '' : r.vis.toFixed(3);
        if (n.blur) n.blur.setAttribute('stdDeviation', `0 ${blur.toFixed(2)}`);
        n.reel.style.filter = blur > 0.06 ? `url(#${id}-b${k})` : '';
    };

    const stop = () => {
        cancelAnimationFrame(raf.current);
        raf.current = 0;
    };

    /** Every reel straight to the number, this frame. */
    const snap = (n: number) => {
        stop();
        reels.current.forEach((r, k) => {
            r.pos = r.from = r.to = digit(k, n);
            r.vis = r.vFrom = r.vTo = open(k, n);
            paint(k, 0);
        });
    };

    const frame = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start.current) / rollMs));
        const e = gentle ? easeInOut(t) : easeOut(t);
        const rate = (gentle ? easeInOutRate(t) : easeOutRate(t)) / rollMs;
        reels.current.forEach((r, k) => {
            r.pos = r.from + (r.to - r.from) * e;
            r.vis = r.vFrom + (r.vTo - r.vFrom) * e;
            if (t >= 1) {
                r.pos = r.from = r.to = mod10(Math.round(r.to));
                r.vis = r.vFrom = r.vTo;
            }
            paint(k, t >= 1 ? 0 : Math.abs(r.to - r.from) * rate);
        });
        raf.current = t < 1 ? requestAnimationFrame(frame) : 0;
    };

    /** Every reel from where it is now to the new number, together. */
    const roll = (from: number, to: number) => {
        const up = to > from;
        reels.current.forEach((r, k) => {
            const d = digit(k, to);
            const pos = r.pos;
            const delta = up ? (((d - pos) % 10) + 10) % 10 : -((((pos - d) % 10) + 10) % 10);
            r.from = pos;
            r.to = pos + (Math.abs(delta) < 1e-6 ? 0 : delta);
            r.vFrom = r.vis;
            r.vTo = open(k, to);
        });
        start.current = performance.now();
        if (!raf.current) raf.current = requestAnimationFrame(frame);
    };

    useLayoutEffect(() => {
        // One reel per place, the new ones folded at 0.
        while (reels.current.length < count) reels.current.push({ pos: 0, vis: 0, from: 0, to: 0, vFrom: 0, vTo: 0 });
        reels.current.length = count;
        // A place just added has nothing painted yet: fold it before it's seen.
        reels.current.forEach((_, k) => {
            if (!nodes.current[k]?.shown) paint(k, 0);
        });
        const slot = nodes.current[0]?.slot;
        if (slot) em.current = parseFloat(getComputedStyle(slot).fontSize) || 48;

        const prev = target.current;
        target.current = scaled;
        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (prev === null || instant || still || layout.current !== decimals) {
            layout.current = decimals;
            snap(scaled);
            return;
        }
        if (prev !== scaled) roll(prev, scaled);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scaled, instant, count, decimals]);

    useLayoutEffect(
        () => () => {
            stop();
            target.current = null; // a remount (StrictMode does one) paints from scratch
        },
        [],
    );

    const order = Array.from({ length: count }, (_, i) => count - 1 - i);
    const label = (scaled / 10 ** decimals).toFixed(decimals);

    return (
        // Figures read left to right in every language the app speaks.
        <span className={`odo ${className ?? ''}`} dir="ltr" role="text" aria-label={label}>
            <svg width="0" height="0" aria-hidden="true" className="odo-defs">
                {order.map(k => (
                    <filter key={k} id={`${id}-b${k}`} x="0" y="-30%" width="100%" height="160%">
                        <feGaussianBlur
                            ref={el => {
                                at(k).blur = el;
                            }}
                            stdDeviation="0 0"
                        />
                    </filter>
                ))}
            </svg>
            {order.map(k => (
                <span key={k} className="odo-group" aria-hidden="true">
                    {k === decimals - 1 && <span className="odo-point">.</span>}
                    <span
                        className="odo-slot"
                        ref={el => {
                            at(k).slot = el;
                        }}
                    >
                        <span
                            className="odo-reel"
                            ref={el => {
                                at(k).reel = el;
                            }}
                        >
                            <span
                                className="odo-digit"
                                ref={el => {
                                    at(k).a = el;
                                }}
                            />
                            <span
                                className="odo-digit"
                                ref={el => {
                                    at(k).b = el;
                                }}
                            />
                        </span>
                    </span>
                </span>
            ))}
        </span>
    );
}

export default Odometer;
