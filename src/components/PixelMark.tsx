import React from 'react';

// The marks on the intro, drawn on a 14×14 grid in the pixel cat's palette so
// the first screens of the app look like they belong to the cat rather than to
// an icon library. Same conventions as PixelCat: a base grid plus overlay
// layers, one rect per pixel, crisp edges, `.` transparent.
//
// A mark beside the chart is asleep (grey) until the chart reaches its beat,
// plays the beat — its overlays flip at fixed fractions of the beat, see the
// pm-* rules in index.css — so the syringe presses, the chart draws and the
// vial fills while the real curve is doing the same thing, and then rests in
// colour on its final frame. A mark with no beat to wait for is just done.

interface Layer {
    grid: string[];
    /**
     * pm-on-N: hidden until N% of the beat, then shown for good.
     * pm-off-N: shown until N%, then hidden.
     */
    className?: string;
}

interface Sprite {
    layers: Layer[];
    /** Character → fill. Missing characters are transparent. */
    palette: Record<string, string>;
}

const INK = 'var(--pixel-ink)';

// ── Syringe, upright, needle down. Laid flat it was a short block with a stub
// on one end; standing, it gets the whole height for a long thin barrel and a
// needle as long as the barrel is wide. The barrel is fixed; the plunger and
// the liquid are two overlays, drawn out and then pressed in. ───────────────
const SYRINGE: Sprite = {
    layers: [
        { grid: [
            '', '', '',
            '...ooooooo....',
            '....o...o.....',
            '....o...o.....',
            '....o...o.....',
            '....o...o.....',
            '....o...o.....',
            '....ooooo.....',
            '......N.......',
            '......N.......',
            '......N.......',
        ] },
        // Drawn: handle at the top, rod through the flange, rubber head just
        // inside the barrel, liquid filling the rest.
        { className: 'pm-off-50', grid: [
            '...ooooooo....',
            '......o.......',
            '......o.......',
            '',
            '.....ppp......',
            '.....LLL......',
            '.....LLL......',
            '.....LLL......',
            '.....LLL......',
        ] },
        // Pressed: handle and head both two pixels further in, the rod now
        // visible inside the barrel, half the liquid gone and a drop at the
        // tip. The head moving is what reads as a push; the handle alone just
        // looks like it teleported.
        { className: 'pm-on-50', grid: [
            '', '',
            '...ooooooo....',
            '',
            '......o.......',
            '......o.......',
            '.....ppp......',
            '.....LLL......',
            '.....LLL......',
            '', '', '', '',
            '......D.......',
        ] },
    ],
    palette: {
        o: INK,
        N: 'var(--pixel-white-edge)',
        p: 'var(--pixel-white-edge)',
        L: 'var(--pixel-pink)',
        D: 'var(--pixel-pink)',
    },
};

// ── A chart: one dose absorbing to a peak and clearing more slowly than it
// rose, the same shape the old curve icon drew. Every pixel of the line shares
// an edge with the next — a diagonal of lone pixels reads as dots at this size,
// not as a line. It arrives in two halves, rise then decay, so it draws left
// to right with the real curve. ─────────────────────────────────────────────
const CHART: Sprite = {
    layers: [
        { grid: [
            '', '',
            '..o...........',
            '..o...........',
            '..o...........',
            '..o...........',
            '..o...........',
            '..o...........',
            '..o...........',
            '..o...........',
            '..o...........',
            '..oooooooooooo',
        ] },
        { className: 'pm-on-33', grid: [
            '', '', '', '',
            '......LL......',
            '.....LLLL.....',
            '.....L..L.....',
            '....LL........',
            '....L.........',
            '...LL.........',
            '...L..........',
        ] },
        { className: 'pm-on-66', grid: [
            '', '', '', '', '', '',
            '.........L....',
            '.........LLL..',
            '...........LLL',
            '.............L',
        ] },
    ],
    palette: {
        o: INK,
        L: 'var(--pixel-pink)',
    },
};

// ── A capped sample tube, empty until the labs come back. The sample is the
// terracotta of the cat's food bowl rather than anything redder: it is blood,
// and it does not need to look like it. ─────────────────────────────────────
const VIAL: Sprite = {
    layers: [
        { grid: [
            '',
            '.....ooooo....',
            '.....oCCCo....',
            '....ooooooo...',
            '.....oGGGo....',
            '.....oGGGo....',
            '.....oGGGo....',
            '.....oGGGo....',
            '.....oGGGo....',
            '.....oGGGo....',
            '.....oGGGo....',
            '......ooo.....',
        ] },
        { className: 'pm-on-33', grid: [
            '', '', '', '', '', '', '',
            '......SSS.....',
            '......SSS.....',
            '......SSS.....',
            '......SSS.....',
        ] },
    ],
    palette: {
        o: INK,
        C: 'var(--pixel-pink-shade)',
        G: 'var(--pixel-white-shade)',
        S: 'var(--pixel-food)',
    },
};

// ── Padlock, shut. Body in the quilt's clay, so the props on this screen and
// the props around the cat read as one set. ─────────────────────────────────
const LOCK: Sprite = {
    layers: [
        { grid: [
            '', '',
            '.....mmmm.....',
            '....mm..mm....',
            '....m....m....',
            '....m....m....',
            '...oooooooo...',
            '...oBBBBBBo...',
            '...oBBBBBBo...',
            '...oBBKKBBo...',
            '...oBBKKBBo...',
            '...obbbbbbo...',
            '...oooooooo...',
        ] },
    ],
    palette: {
        o: INK,
        m: 'var(--pixel-white-edge)',
        K: INK,
        B: 'var(--pixel-quilt)',
        b: 'var(--pixel-quilt-shade)',
    },
};

// ── Cloud, in the flag's blue. ───────────────────────────────────────────────
const CLOUD: Sprite = {
    layers: [
        { grid: [
            '', '', '', '',
            '.....oooo.....',
            '....oBBBBo....',
            '..oooBBBBBoo..',
            '.oBBBBBBBBBBo.',
            '.oBBBBBBBBBBo.',
            '.obbbbbbbbbbo.',
            '..oooooooooo..',
        ] },
    ],
    palette: {
        o: INK,
        B: 'var(--pixel-blue)',
        b: 'var(--pixel-blue-shade)',
    },
};

// ── A warning sign: a triangle around an exclamation mark. Clay rather than
// hazard yellow, so it reads as a caution, not an alarm. ────────────────────
const CAUTION: Sprite = {
    layers: [
        { grid: [
            '', '',
            '......oo......',
            '.....oYYo.....',
            '.....oYYo.....',
            '....oYYYYo....',
            '....oYIIYo....',
            '...oYYIIYYo...',
            '...oYYIIYYo...',
            '..oYYYYYYYYo..',
            '..oYYYIIYYYo..',
            '.oYYYYYYYYYYo.',
            '.oooooooooooo.',
        ] },
    ],
    palette: {
        o: INK,
        I: INK,
        Y: 'var(--pixel-quilt)',
    },
};

// ── A tick, in whatever colour the text around it is. ───────────────────────
const CHECK: Sprite = {
    layers: [
        { grid: [
            '.......c',
            '......cc',
            '.....cc.',
            'c...cc..',
            'cc.cc...',
            '.ccc....',
            '..c.....',
        ] },
    ],
    palette: { c: 'currentColor' },
};

const SPRITES = {
    syringe: SYRINGE,
    chart: CHART,
    vial: VIAL,
    lock: LOCK,
    cloud: CLOUD,
    caution: CAUTION,
    check: CHECK,
} as const;

export type MarkName = keyof typeof SPRITES;

const gridSize = (layers: Layer[]): { w: number; h: number } => ({
    w: Math.max(...layers.flatMap(l => l.grid.map(row => row.length))),
    h: Math.max(...layers.map(l => l.grid.length)),
});

const rects = (grid: string[], key: string, fill: (ch: string, x: number, y: number) => string | null) => {
    const out: React.ReactNode[] = [];
    grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            const f = fill(row[x], x, y);
            if (f) out.push(<rect key={`${key}-${x}-${y}`} x={x} y={y} width={1} height={1} fill={f} />);
        }
    });
    return out;
};

export type MarkState = 'asleep' | 'playing' | 'done';

interface PixelMarkProps {
    name: MarkName;
    /** Rendered width in px. Height follows the grid. */
    size?: number;
    className?: string;
    /** Where the chart is relative to this mark's beat. Default: done. */
    state?: MarkState;
    /** How long the beat runs, in ms. Only read while playing. */
    duration?: number;
}

const PixelMark: React.FC<PixelMarkProps> = ({ name, size = 28, className = '', state = 'done', duration = 0 }) => {
    const sprite = SPRITES[name];
    const layers = sprite.layers;
    const fillAt = (ch: string) => sprite.palette[ch] ?? null;

    const { w, h } = gridSize(layers);
    return (
        <svg
            viewBox={`0 0 ${w} ${h}`}
            width={size}
            height={Math.round((size * h) / w)}
            shapeRendering="crispEdges"
            aria-hidden="true"
            focusable="false"
            className={`pm ${state === 'asleep' ? 'pm-asleep' : state === 'playing' ? 'pm-play' : ''} ${className}`}
            style={state === 'playing' ? { '--pm-dur': `${duration}ms` } as React.CSSProperties : undefined}
        >
            {layers.map((layer, i) => (
                <g key={i} className={layer.className}>
                    {rects(layer.grid, `l${i}`, fillAt)}
                </g>
            ))}
        </svg>
    );
};

export default PixelMark;
