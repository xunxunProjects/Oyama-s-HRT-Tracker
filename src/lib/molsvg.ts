/* A molecule drawn the way chemists draw it, from PubChem's own 2D layout
   (scripts/fetch-structures.mjs): the skeletal formula, in one ink.

   - Carbon is a corner, not a letter; other atoms are their symbol, with
     their hydrogens on whichever side its bonds leave free: after it (OH),
     before it (H₂N), or under or over it when bonds take both sides (the N
     of a chain's NH). A charge sits in a corner no bond or label runs through.
   - A double bond in a ring has its second line inside the ring, a little
     shorter; one to an atom at the end of a chain (C=O) is drawn as two
     lines either side of the bond; a triple bond is three lines.
   - A wedge points at the reader and a row of hashes points away, narrow at
     the stereocentre.
   - Bonds stop short of a label rather than running into it.

   Pure: no DOM, so the site and the link preview cards draw the same way. */

export interface Mol {
    /** element, x and y (PubChem's coordinates × 100), hydrogens, charge */
    a: [string, number, number, number, number][];
    /** from, to, order, stereo (1 wedge, 6 hashes, from the narrow end) */
    b: [number, number, number, number][];
}

const BL = 30; // every bond drawn this long
const FS = BL * 0.56; // label size
const GAP = BL * 0.17; // between the lines of a double bond
const INSET = BL * 0.13; // how much shorter a ring's inner line is at each end
const WEDGE = BL * 0.13; // half the width of a wedge's broad end
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';

/** Rough widths of letters as a share of the font size, for laying labels out. */
const W: Record<string, number> = { I: 0.3, l: 0.24, i: 0.24, r: 0.36, M: 0.84, H: 0.74, N: 0.74, O: 0.78, C: 0.72 };
const widthOf = (s: string) => [...s].reduce((w, ch) => w + (W[ch] ?? (ch === ch.toUpperCase() ? 0.64 : 0.54)), 0) * FS;

const f = (n: number) => (Math.round(n * 100) / 100).toString();

interface Atom {
    el: string;
    x: number;
    y: number;
    h: number;
    c: number;
    nb: number[];
    label: boolean;
    /** half the symbol's width */
    half: number;
    /** which side its hydrogens go (right, left, under, over), and their width */
    hSide: Side;
    hWidth: number;
}

type Side = 'r' | 'l' | 'd' | 'u';

/** The angle between two directions, 0 to π. */
const turn = (p: number, q: number) => {
    const d = Math.abs(p - q) % (2 * Math.PI);
    return d > Math.PI ? 2 * Math.PI - d : d;
};

/** How far point p is from the segment a–b. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax,
        dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function molToSvg(mol: Mol): string {
    if (!mol.a.length) return '';

    // Scale PubChem's layout so the typical bond is BL long, y pointing down.
    const raw = mol.a.map(([, x, y]) => ({ x: x / 100, y: -y / 100 }));
    const lengths = mol.b
        .map(([i, j]) => Math.hypot(raw[i].x - raw[j].x, raw[i].y - raw[j].y))
        .filter(l => l > 0)
        .sort((p, q) => p - q);
    const scale = BL / (lengths.length ? lengths[Math.floor(lengths.length / 2)] : 1);

    const atoms: Atom[] = mol.a.map(([el, , , h, c], i) => ({
        el,
        x: raw[i].x * scale,
        y: raw[i].y * scale,
        h,
        c,
        nb: [],
        label: false,
        half: 0,
        hSide: 'r',
        hWidth: 0,
    }));
    for (const [i, j] of mol.b) {
        atoms[i].nb.push(j);
        atoms[j].nb.push(i);
    }
    // A hydrogen drawn on a wedge sits a quarter closer in, so two at a ring
    // fusion (a steroid's) don't run into each other or into the next bond.
    for (const a of atoms) {
        if (a.el !== 'H' || a.nb.length !== 1) continue;
        const o = atoms[a.nb[0]];
        a.x = o.x + (a.x - o.x) * 0.75;
        a.y = o.y + (a.y - o.y) * 0.75;
    }
    for (const a of atoms) {
        a.label = a.el !== 'C' || a.c !== 0 || a.nb.length === 0;
        if (!a.label) continue;
        a.half = widthOf(a.el) / 2;
        a.hWidth = a.h ? widthOf('H') + (a.h > 1 ? FS * 0.4 : 0) : 0;
        // Hydrogens after the symbol if no bond leaves within ~56° of that
        // side (closer, and the bond would clip the H), else before it, else
        // under or over it, whichever is further from the bonds.
        const dirs = a.nb.map(k => Math.atan2(atoms[k].y - a.y, atoms[k].x - a.x));
        const room = (t: number) => (dirs.length ? Math.min(...dirs.map(d => turn(t, d))) : Math.PI);
        const free = (56 * Math.PI) / 180;
        a.hSide =
            room(0) >= free ? 'r' : room(Math.PI) >= free ? 'l' : room(Math.PI / 2) >= room(-Math.PI / 2) ? 'd' : 'u';
    }

    /** How far from a labelled atom's centre a bond leaving in direction (ux, uy) should start. */
    const clearance = (a: Atom, ux: number, uy: number) => {
        if (!a.label) return 0;
        const pad = FS * 0.16;
        const hw = a.half + pad + (a.h && a.hSide === (ux >= 0 ? 'r' : 'l') ? a.hWidth : 0);
        const hh = FS * 0.44 + pad + (a.h && a.hSide === (uy >= 0 ? 'd' : 'u') ? FS * 0.95 : 0);
        const tx = Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity;
        const ty = Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity;
        return Math.min(tx, ty, BL * 0.45);
    };

    const orderOf = new Map<string, number>();
    for (const [i, j, o] of mol.b) orderOf.set(i < j ? `${i}-${j}` : `${j}-${i}`, o);
    const orderBetween = (i: number, j: number) => orderOf.get(i < j ? `${i}-${j}` : `${j}-${i}`) ?? 1;

    /** The smallest ring through bond i–j on each side of it, if any (up to 8 atoms). */
    const ringsThrough = (i: number, j: number): number[][] => {
        const found: number[][] = [];
        for (const k of atoms[i].nb) {
            if (k === j) continue;
            // Shortest path k → j that doesn't pass through i.
            const prev = new Map<number, number>([[k, -1]]);
            const queue = [k];
            while (queue.length) {
                const v = queue.shift()!;
                if (v === j) break;
                for (const w of atoms[v].nb) {
                    if (w === i || prev.has(w)) continue;
                    prev.set(w, v);
                    queue.push(w);
                }
            }
            if (!prev.has(j)) continue;
            const path: number[] = [];
            for (let v: number = j; v !== -1; v = prev.get(v)!) path.push(v);
            if (path.length + 1 <= 8) found.push([i, ...path.reverse()]);
        }
        return found;
    };

    /** Which side of bond i→j a double bond's second line goes: +1, −1, or 0 for both sides. */
    const sideOf = (i: number, j: number): number => {
        const a = atoms[i],
            b = atoms[j];
        const ux = b.x - a.x,
            uy = b.y - a.y;
        const side = (x: number, y: number) => Math.sign(ux * (y - a.y) - uy * (x - a.x));
        const others = [...a.nb.filter(k => k !== j), ...b.nb.filter(k => k !== i)];
        if (a.nb.length === 1 || b.nb.length === 1) return 0;
        // In a ring: inside it, preferring the ring with more double bonds (the aromatic one).
        const rings = ringsThrough(i, j);
        if (rings.length) {
            let best: { s: number; doubles: number; size: number } | null = null;
            for (const r of rings) {
                const cx = r.reduce((s, k) => s + atoms[k].x, 0) / r.length;
                const cy = r.reduce((s, k) => s + atoms[k].y, 0) / r.length;
                const s = side(cx, cy);
                let doubles = 0;
                for (let k = 0; k < r.length; k++) if (orderBetween(r[k], r[(k + 1) % r.length]) === 2) doubles++;
                const cand = { s, doubles, size: r.length };
                if (!best || cand.doubles > best.doubles || (cand.doubles === best.doubles && cand.size < best.size))
                    best = cand;
            }
            if (best && best.s) return best.s;
        }
        // In a chain: on the side the neighbours are, or both sides if it's even.
        const lean = others.reduce((s, k) => s + side(atoms[k].x, atoms[k].y), 0);
        return Math.sign(lean);
    };

    const lines: string[] = [];
    const fills: string[] = [];
    const line = (x1: number, y1: number, x2: number, y2: number) =>
        lines.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`);

    for (const [i, j, order, stereo] of mol.b) {
        const a = atoms[i],
            b = atoms[j];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6) continue;
        const ux = (b.x - a.x) / len,
            uy = (b.y - a.y) / len;
        const nx = -uy,
            ny = ux;
        const s0 = clearance(a, ux, uy),
            s1 = clearance(b, -ux, -uy);
        const x1 = a.x + ux * s0,
            y1 = a.y + uy * s0;
        const x2 = b.x - ux * s1,
            y2 = b.y - uy * s1;

        if (stereo === 1) {
            // A wedge, narrow at the stereocentre.
            fills.push(
                `<polygon points="${f(x1)},${f(y1)} ${f(x2 + nx * WEDGE)},${f(y2 + ny * WEDGE)} ${f(x2 - nx * WEDGE)},${f(y2 - ny * WEDGE)}"/>`,
            );
            continue;
        }
        if (stereo === 6) {
            // Hashes, widening away from the stereocentre.
            const n = Math.max(4, Math.round(len / (BL * 0.14)));
            for (let k = 1; k <= n; k++) {
                const t = k / n;
                const mx = x1 + (x2 - x1) * t,
                    my = y1 + (y2 - y1) * t;
                const w = WEDGE * Math.max(t, 0.2);
                line(mx - nx * w, my - ny * w, mx + nx * w, my + ny * w);
            }
            continue;
        }
        if (order === 3) {
            line(x1, y1, x2, y2);
            line(x1 + nx * GAP, y1 + ny * GAP, x2 + nx * GAP, y2 + ny * GAP);
            line(x1 - nx * GAP, y1 - ny * GAP, x2 - nx * GAP, y2 - ny * GAP);
            continue;
        }
        if (order === 2 || order === 4) {
            const s = sideOf(i, j);
            if (s === 0) {
                const g = GAP / 2;
                line(x1 + nx * g, y1 + ny * g, x2 + nx * g, y2 + ny * g);
                line(x1 - nx * g, y1 - ny * g, x2 - nx * g, y2 - ny * g);
            } else {
                line(x1, y1, x2, y2);
                const ia = a.label ? 0 : INSET,
                    ib = b.label ? 0 : INSET;
                line(
                    x1 + ux * ia + nx * GAP * s,
                    y1 + uy * ia + ny * GAP * s,
                    x2 - ux * ib + nx * GAP * s,
                    y2 - uy * ib + ny * GAP * s,
                );
            }
            continue;
        }
        line(x1, y1, x2, y2);
    }

    // Labels: the symbol centred on its atom, hydrogens beside it, a charge in a free corner.
    const texts: string[] = [];
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    const grow = (x: number, y: number) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    };
    for (const a of atoms) grow(a.x, a.y);
    const sub = (n: number) => (n > 1 ? `<tspan font-size="${f(FS * 0.68)}" dy="${f(FS * 0.28)}">${n}</tspan>` : '');

    /** How much room a charge at (x, y) has: its distance to the nearest bond or other label. */
    const roomAt = (x: number, y: number, self: Atom) => {
        let r = Infinity;
        for (const [i, j] of mol.b) r = Math.min(r, segDist(x, y, atoms[i].x, atoms[i].y, atoms[j].x, atoms[j].y));
        for (const o of atoms)
            if (o !== self && o.label) r = Math.min(r, Math.hypot(x - o.x, y - o.y) - Math.max(o.half, FS * 0.44));
        return r;
    };

    for (const a of atoms) {
        if (!a.label) continue;
        texts.push(`<text x="${f(a.x)}" y="${f(a.y)}" text-anchor="middle" dy="0.35em">${a.el}</text>`);
        let left = a.x - a.half,
            right = a.x + a.half,
            top = a.y - FS * 0.5,
            bottom = a.y + FS * 0.5;
        if (a.h) {
            const hs = `H${sub(a.h)}`;
            if (a.hSide === 'r') {
                texts.push(`<text x="${f(right)}" y="${f(a.y)}" dy="0.35em">${hs}</text>`);
                right += a.hWidth;
            } else if (a.hSide === 'l') {
                texts.push(`<text x="${f(left)}" y="${f(a.y)}" text-anchor="end" dy="0.35em">${hs}</text>`);
                left -= a.hWidth;
            } else {
                // The H itself centred under or over the symbol, a count hanging off it.
                const y = a.y + (a.hSide === 'd' ? 1 : -1) * FS * 0.95;
                texts.push(`<text x="${f(a.x - widthOf('H') / 2)}" y="${f(y)}" dy="0.35em">${hs}</text>`);
                if (a.hSide === 'd') bottom = y + FS * 0.5;
                else top = y - FS * 0.5;
                right = Math.max(right, a.x - widthOf('H') / 2 + a.hWidth);
            }
        }
        if (a.c) {
            const sign = a.c > 0 ? '+' : '−';
            const mag = Math.abs(a.c) > 1 ? String(Math.abs(a.c)) : '';
            const cw = widthOf(mag + '+') * 0.68;
            const r = right + cw / 2 + FS * 0.02,
                l = left - cw / 2 - FS * 0.02;
            // Raised after the label if that corner is clear, as chemists write
            // it; otherwise the first corner (or above, or below) that is.
            const spots: [number, number][] = [
                [r, a.y - FS * 0.55],
                [l, a.y - FS * 0.55],
                [r, a.y + FS * 0.55],
                [l, a.y + FS * 0.55],
                [a.x, top - FS * 0.3],
                [a.x, bottom + FS * 0.3],
            ];
            let spot = spots[0],
                most = -Infinity;
            for (const p of spots) {
                const room = roomAt(p[0], p[1], a);
                if (room >= FS * 0.38) {
                    spot = p;
                    break;
                }
                if (room > most) {
                    spot = p;
                    most = room;
                }
            }
            texts.push(
                `<text x="${f(spot[0])}" y="${f(spot[1])}" text-anchor="middle" dy="0.3em" font-size="${f(FS * 0.68)}">${mag}${sign}</text>`,
            );
            grow(spot[0] - cw / 2, spot[1] - FS * 0.4);
            grow(spot[0] + cw / 2, spot[1] + FS * 0.4);
        }
        grow(left, top);
        grow(right, bottom);
    }

    const m = BL * 0.3;
    const vb = `${f(minX - m)} ${f(minY - m)} ${f(maxX - minX + 2 * m)} ${f(maxY - minY + 2 * m)}`;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" aria-hidden="true" focusable="false">` +
        `<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${lines.join('')}</g>` +
        `<g fill="currentColor" stroke="none">${fills.join('')}</g>` +
        `<g fill="currentColor" stroke="none" font-size="${f(FS)}" font-family='${FONT}'>${texts.join('')}</g>` +
        `</svg>`
    );
}
