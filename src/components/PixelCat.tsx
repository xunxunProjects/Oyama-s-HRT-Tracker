import React from 'react';
import { usePixelCats, CatStyle } from '../contexts/PixelCatContext';

// Pixel cats for empty states, drawn on a 26×15 grid. Horizontal bands echo the
// trans pride flag (blue · pink · white · pink · blue).
//
// Legend: # fur   d ear inner   E eye   N nose   p paw
//         T tail  t tail edge   . transparent
//
// Tails and paws are painted one shade darker than the band they cross — that
// contrast is what makes them read as lying *in front of* the body instead of
// dissolving into it. The tail also has to break the body silhouette, or it
// just looks like the cat is sitting on a plate.

interface Layer {
    grid: string[];
    /** Animation class, or '' for a layer that just sits there. */
    className: string;
}

interface Pose {
    body: string[];
    /** Grids folded into the silhouette used for outlining. */
    silhouette: string[][];
    layers: Layer[];
    wrapperClass: string;
}

// ── Donut: curled up, facing the viewer. Twitches an ear. ──────────────
// Ears live outside `body` so they can be swapped between two positions.
const DONUT_BODY = [
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '...################.......',
    '..##################......',
    '..##E#######E#######......',
    '..#####NN###########......',
    '.####################.....',
    '.####################.....',
    '..##################......',
    '..##################......',
    '...################.......',
    '.....##############.......',
    '..........................',
];

const DONUT_EARS_REST = [
    '',
    '......##.....##...........',
    '.....####...####..........',
    '.....#d##...##d#..........',
];

// Left ear leans a pixel outward — the whole twitch is that one step.
const DONUT_EARS_TWITCH = [
    '',
    '.....##......##...........',
    '....####....####..........',
    '.....#d##...##d#..........',
];

// Swings clear of the body to the right, then hooks up at the tip. It has to
// leave the silhouette — tucked against the curl it just reads as a lump.
const DONUT_TAIL = [
    '', '', '', '', '', '', '', '',
    '.......................tt.',
    '......................tTTt',
    '......................tTTt',
    '...................TTTTTT.',
    '...................tttttt.',
];

// Two front paws tucked under the chin. Outlined, or they vanish into the body.
const DONUT_PAWS = [
    '', '', '', '', '', '', '', '', '', '', '',
    '......PPP...PPP...........',
    '......ppp...ppp...........',
];

const DONUT_BLINK = [
    '', '', '', '', '', '',
    '....#.......#.............',
];

// ── Loaf: lying on its side, front paw out. Rolls about. ───────────────
const LOAF_BODY = [
    '..........................',
    '...##.......##............',
    '..####.....####...........',
    '..#d##.....##d#...........',
    '.################.........',
    '.################.........',
    '.##E#####E#######.........',
    '.################.........',
    '.################.........',
    '..#################.......',
    '..##################......',
    '...#################......',
    '...#################......',
    '....###############.......',
    '..........................',
];

// Tapers toward the tip; a constant-width tail just reads as a lump.
const LOAF_TAIL = [
    '', '', '', '', '', '', '',
    '.....................tt...',
    '....................tTt...',
    '....................tTt...',
    '...................tTt....',
    '.................tTTt.....',
    '..............tTTTt.......',
];

// Two front paws along the bottom of the chest. Any higher and they read as
// teeth sitting under the eyes.
const LOAF_PAWS = [
    '', '', '', '', '', '', '', '', '', '', '',
    '....PPP..PPP..............',
    '....ppp..ppp..............',
];

const LOAF_BLINK = [
    '', '', '', '', '', '',
    '...##....##...............',
];

export type CatPose = 'donut' | 'loaf';

const POSES: Record<CatPose, Pose> = {
    donut: {
        body: DONUT_BODY,
        silhouette: [DONUT_EARS_REST, DONUT_TAIL],
        layers: [
            { grid: DONUT_TAIL, className: '' },
            { grid: DONUT_PAWS, className: '' },
            { grid: DONUT_EARS_REST, className: 'px-ear-rest' },
            { grid: DONUT_EARS_TWITCH, className: 'px-ear-twitch' },
            { grid: DONUT_BLINK, className: 'px-blink' },
        ],
        wrapperClass: 'px-bob',
    },
    loaf: {
        body: LOAF_BODY,
        silhouette: [LOAF_TAIL],
        layers: [
            { grid: LOAF_TAIL, className: '' },
            { grid: LOAF_PAWS, className: '' },
            { grid: LOAF_BLINK, className: 'px-blink' },
        ],
        wrapperClass: 'px-roll',
    },
};

const GRID_W = 26;
const GRID_H = 15;

type Band = 'blue' | 'pink' | 'white';

// 'flag' stripes the sprite; the solid styles keep the same three-tone
// fill/shade/edge structure, so the tail and paws still read.
function bandAt(y: number, style: CatStyle): Band {
    if (style === 'blue') return 'blue';
    if (style === 'pink') return 'pink';
    if (y <= 3) return 'blue';
    if (y <= 5) return 'pink';
    if (y <= 8) return 'white';
    if (y <= 11) return 'pink';
    return 'blue';
}

const BAND_FILL: Record<Band, string> = {
    blue: 'var(--pixel-blue)',
    pink: 'var(--pixel-pink)',
    white: 'var(--pixel-white)',
};

const BAND_SHADE: Record<Band, string> = {
    blue: 'var(--pixel-blue-shade)',
    pink: 'var(--pixel-pink-shade)',
    white: 'var(--pixel-white-shade)',
};

const BAND_EDGE: Record<Band, string> = {
    blue: 'var(--pixel-blue-edge)',
    pink: 'var(--pixel-pink-edge)',
    white: 'var(--pixel-white-edge)',
};

// Silhouette pixels get the edge colour; without it the white band dissolves
// into the app's near-white surface. Ears and tail are included even though
// they are drawn from overlays, otherwise an outline cuts across the joins.
function silhouetteOf(grids: string[][]): Set<string> {
    const solid = new Set<string>();
    grids.forEach(grid => grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            if (row[x] !== '.') solid.add(`${x},${y}`);
        }
    }));
    return solid;
}

function fillFor(ch: string, x: number, y: number, solid: Set<string>, style: CatStyle): string | null {
    const band = bandAt(y, style);
    const onEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
        ([dx, dy]) => !solid.has(`${x + dx},${y + dy}`),
    );
    switch (ch) {
        case '#':
            return onEdge ? BAND_EDGE[band] : BAND_FILL[band];
        case 'T':
        case 'p':
        case 'd':
            return BAND_SHADE[band];
        case 't':
        case 'P':
            return BAND_EDGE[band];
        case 'E':
            return 'var(--pixel-eye)';
        case 'N':
            return 'var(--pixel-nose)';
        default:
            return null;
    }
}

function pixels(grid: string[], keyPrefix: string, solid: Set<string>, style: CatStyle): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            const fill = fillFor(row[x], x, y, solid, style);
            if (!fill) continue;
            out.push(
                <rect key={`${keyPrefix}-${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />,
            );
        }
    });
    return out;
}

interface PixelCatProps {
    pose?: CatPose;
    /** Rendered width in px. Height follows the 26:15 grid. */
    size?: number;
    className?: string;
}

const PixelCat: React.FC<PixelCatProps> = ({ pose = 'donut', size = 150, className = '' }) => {
    const { showCats, catStyle } = usePixelCats();
    const { body, silhouette, layers, wrapperClass } = POSES[pose];
    if (!showCats) return null;
    const solid = silhouetteOf([body, ...silhouette]);
    return (
        <svg
            viewBox={`0 0 ${GRID_W} ${GRID_H}`}
            width={size}
            height={Math.round((size * GRID_H) / GRID_W)}
            shapeRendering="crispEdges"
            role="img"
            aria-hidden="true"
            className={className}
        >
            <g className={wrapperClass}>
                {pixels(body, 'body', solid, catStyle)}
                {layers.map((layer, i) => (
                    <g key={i} className={layer.className}>
                        {pixels(layer.grid, `layer-${i}`, solid, catStyle)}
                    </g>
                ))}
            </g>
        </svg>
    );
};

export default PixelCat;
