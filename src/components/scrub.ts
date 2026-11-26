import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/* Reading a chart with a finger or a pointer: a cursor that follows the
   pointer, or the finger while it presses and slides, and lingers a moment
   after the finger lifts so the reading can be read. Sideways only; a
   vertical swipe still scrolls the page. */

export function useScrub() {
    const [x, setX] = useState<number | null>(null);
    const timer = useRef(0);
    const pressing = useRef(false);
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const at = (e: ReactPointerEvent<Element>) => e.clientX - (e.currentTarget as Element).getBoundingClientRect().left;
    const show = (e: ReactPointerEvent<Element>) => {
        window.clearTimeout(timer.current);
        setX(at(e));
    };
    const handlers = {
        onPointerDown: (e: ReactPointerEvent<Element>) => {
            if (e.button !== 0) return;
            pressing.current = true;
            e.stopPropagation();
            try {
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
            } catch {
                /* already let go */
            }
            show(e);
        },
        onPointerMove: (e: ReactPointerEvent<Element>) => {
            if (e.pointerType === 'mouse' || pressing.current) {
                if (pressing.current) e.stopPropagation();
                show(e);
            }
        },
        onPointerUp: (e: ReactPointerEvent<Element>) => {
            pressing.current = false;
            if (e.pointerType !== 'mouse') {
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => setX(null), 1400);
            }
        },
        onPointerCancel: () => {
            pressing.current = false;
            setX(null);
        },
        onPointerLeave: (e: ReactPointerEvent<Element>) => {
            if (e.pointerType === 'mouse' && !pressing.current) setX(null);
        },
    };
    return { x, handlers, clear: () => setX(null) };
}

/** Where a cubic Bézier is when its x is X, for curves whose x only rises. */
export function cubicYAtX(
    p0: [number, number],
    p1: [number, number],
    p2: [number, number],
    p3: [number, number],
    X: number,
): number {
    const bx = (u: number) =>
        (1 - u) ** 3 * p0[0] + 3 * (1 - u) ** 2 * u * p1[0] + 3 * (1 - u) * u ** 2 * p2[0] + u ** 3 * p3[0];
    const by = (u: number) =>
        (1 - u) ** 3 * p0[1] + 3 * (1 - u) ** 2 * u * p1[1] + 3 * (1 - u) * u ** 2 * p2[1] + u ** 3 * p3[1];
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (bx(mid) < X) lo = mid;
        else hi = mid;
    }
    return by((lo + hi) / 2);
}

/** A run of straight lines and curves, as the charts draw a dose's effect,
 *  read at X: the line's y there, or null outside it. */
export type Piece =
    | { line: [[number, number], [number, number]] }
    | { cubic: [[number, number], [number, number], [number, number], [number, number]] };

export function yOnPieces(pieces: Piece[], X: number): number | null {
    for (const p of pieces) {
        if ('line' in p) {
            const [[x0, y0], [x1, y1]] = p.line;
            if (X >= x0 && X <= x1) return x1 === x0 ? y1 : y0 + ((X - x0) / (x1 - x0)) * (y1 - y0);
        } else {
            const [a, b, c, d] = p.cubic;
            if (X >= a[0] && X <= d[0]) return cubicYAtX(a, b, c, d, X);
        }
    }
    return null;
}
