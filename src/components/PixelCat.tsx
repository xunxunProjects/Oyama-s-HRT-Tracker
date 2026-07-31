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
    /** Swapped in after dark: tucked in, eyes shut. Paws stay under the quilt. */
    nightLayers: Layer[];
}

// ── Donut: curled up, facing the viewer. Flicks its tail, kneads, twitches
// an ear, blinks, and every so often squints happily. ──────────────────
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
    '......#.......#...........',
    '.....###.....###..........',
    '.....#d##...##d#..........',
];

// Left ear leans a pixel outward — the whole twitch is that one step.
const DONUT_EARS_TWITCH = [
    '',
    '.....#........#...........',
    '....###......###..........',
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

// Only the hook moves, a pixel to the left; the base stays put. Swing the whole
// tail and it reads as the cat shifting its weight rather than flicking.
const DONUT_TAIL_FLICK = [
    '', '', '', '', '', '', '', '',
    '......................tt..',
    '.....................tTTt.',
    '.....................tTTt.',
    '...................TTTTTT.',
    '...................tttttt.',
];

// Two front paws tucked under the chin. Outlined, or they vanish into the body.
const DONUT_PAWS = [
    '', '', '', '', '', '', '', '', '', '', '',
    '......PPP...PPP...........',
    '......ppp...ppp...........',
];

// Making biscuits: one paw up while the other stays down, then the reverse.
// Lifting both at once just looks like the cat hiccuped.
const DONUT_PAWS_LEFT = [
    '', '', '', '', '', '', '', '', '', '', '',
    '......PPP.................',
    '......ppp...PPP...........',
    '............ppp...........',
];

const DONUT_PAWS_RIGHT = [
    '', '', '', '', '', '', '', '', '', '', '',
    '............PPP...........',
    '......PPP...ppp...........',
    '......ppp.................',
];

const DONUT_BLINK = [
    '', '', '', '', '', '',
    '....#.......#.............',
];

// Asleep: shut eyes are wider than the open pupil, which is most of what sells
// them at 44px — a one-pixel lid just looks like the eye went missing.
const DONUT_SLEEP_EYES = [
    '', '', '', '', '', '',
    '...EEE.....EEE............',
];

// The quilt. Straight hem against a round cat is the whole trick: matched to
// the body outline it reads as the cat being two colours, and it has to sit a
// pixel proud of the body below the hem so it drapes rather than fits.
const DONUT_QUILT = [
    '', '', '', '', '', '', '', '', '',
    '.oooooooooooooooooooo.....',
    'oBBBBBBBBBBBBBBBBBBBBo....',
    'oBBBBBBBBBBBBBBBBBBBBo....',
    'obbbbbbbbbbbbbbbbbbbbo....',
    '..oooooooooooooooooo......',
];

// ── Loaf: the big one, sat facing you with its paws tucked under. ──────
// One unbroken dome from the ear tips down, widest low and narrowing again at
// the base — the taper is what makes it read as weight resting on the floor
// rather than a rectangle. Ears are lifted out of the body, same as the donut,
// so this one can flick one too.
const LOAF_BODY = [
    '..........................',
    '..........................',
    '...........########.......',
    '.........############.....',
    '.......################...',
    '......#####E######E#####..',
    '......##################..',
    '.....#########NN#########.',
    '.....####################.',
    '.....####################.',
    '.....####################.',
    '.....####################.',
    '......##################..',
    '.......################...',
    '..........................',
];

// 1 → 3 → 4 across the three rows. A two-pixel tip on a four-pixel base is a
// bump, not a point; dropping the tip to one pixel is what makes it a cat.
const LOAF_EARS_REST = [
    '...........#......#.......',
    '..........###....###......',
    '..........#d##..##d#......',
];

const LOAF_EARS_TWITCH = [
    '..........#.......#.......',
    '.........###.....###......',
    '.........#d##...##d#......',
];

// Draped down the near side and onto the floor, clear of the body the whole
// way. A shape this wide swallows a tail that crosses it — the flank rows are
// the white band, and a shaded tail on white reads as a smudge, not a tail.
const LOAF_TAIL = [
    '', '', '', '', '', '', '', '', '',
    '.tt.......................',
    '.tTTt.....................',
    '.tTTt.....................',
    '..tTTt....................',
    '...tTTt...................',
];

const LOAF_TAIL_WAG = [
    '', '', '', '', '', '', '', '', '',
    '..tt......................',
    '..tTTt....................',
    '.tTTt.....................',
    '..tTTt....................',
    '...tTTt...................',
];

// Both front paws tucked under the chest, right at the base. Outlined, or they
// disappear into the bottom band.
const LOAF_PAWS = [
    '', '', '', '', '', '', '', '', '', '', '', '',
    '...........PPP..PPP.......',
    '...........ppp..ppp.......',
];

// One paw slides forward — the half-stretch a cat does without bothering to
// get up.
const LOAF_PAWS_STRETCH = [
    '', '', '', '', '', '', '', '', '', '', '', '',
    '...........PPP...PPP......',
    '...........ppp...ppp......',
];

const LOAF_BLINK = [
    '', '', '', '', '',
    '...........#......#.......',
];

const LOAF_SLEEP_EYES = [
    '', '', '', '', '',
    '..........EEE....EEE......',
];

// Starts a pixel in from the tail so the tip still shows down the near side —
// a tail poking out from under the covers is the bit that reads as a cat in
// bed rather than a cat behind a rectangle.
const LOAF_QUILT = [
    '', '', '', '', '', '', '', '',
    '.....oooooooooooooooooooo.',
    '....oBBBBBBBBBBBBBBBBBBBBo',
    '....oBBBBBBBBBBBBBBBBBBBBo',
    '....oBBBBBBBBBBBBBBBBBBBBo',
    '....obbbbbbbbbbbbbbbbbbbbo',
    '.....oooooooooooooooooooo.',
];


export type CatPose = 'donut' | 'loaf';

const POSES: Record<CatPose, Pose> = {
    donut: {
        body: DONUT_BODY,
        silhouette: [DONUT_EARS_REST, DONUT_TAIL],
        layers: [
            { grid: DONUT_TAIL, className: 'px-tail-rest' },
            { grid: DONUT_TAIL_FLICK, className: 'px-tail-flick' },
            { grid: DONUT_PAWS, className: 'px-paw-rest' },
            { grid: DONUT_PAWS_LEFT, className: 'px-paw-left' },
            { grid: DONUT_PAWS_RIGHT, className: 'px-paw-right' },
            { grid: DONUT_EARS_REST, className: 'px-ear-rest' },
            { grid: DONUT_EARS_TWITCH, className: 'px-ear-twitch' },
            { grid: DONUT_BLINK, className: 'px-blink' },
        ],
        // Quilt after the tail, so the tail goes under it and only the hook
        // clear of the quilt's right edge still shows. Ears keep twitching —
        // that much a sleeping cat does do.
        nightLayers: [
            { grid: DONUT_TAIL, className: '' },
            { grid: DONUT_QUILT, className: '' },
            { grid: DONUT_EARS_REST, className: 'px-ear-rest' },
            { grid: DONUT_EARS_TWITCH, className: 'px-ear-twitch' },
            { grid: DONUT_SLEEP_EYES, className: '' },
        ],
    },
    loaf: {
        body: LOAF_BODY,
        silhouette: [LOAF_EARS_REST, LOAF_TAIL],
        layers: [
            { grid: LOAF_TAIL, className: 'px-tail-rest' },
            { grid: LOAF_TAIL_WAG, className: 'px-tail-flick' },
            { grid: LOAF_PAWS, className: 'px-paw-still' },
            { grid: LOAF_PAWS_STRETCH, className: 'px-paw-stretch' },
            { grid: LOAF_EARS_REST, className: 'px-ear-rest' },
            { grid: LOAF_EARS_TWITCH, className: 'px-ear-twitch' },
            { grid: LOAF_BLINK, className: 'px-blink' },
        ],
        nightLayers: [
            { grid: LOAF_TAIL, className: '' },
            { grid: LOAF_QUILT, className: '' },
            { grid: LOAF_EARS_REST, className: 'px-ear-rest' },
            { grid: LOAF_EARS_TWITCH, className: 'px-ear-twitch' },
            { grid: LOAF_SLEEP_EYES, className: '' },
        ],
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
        // The quilt sits outside the flag banding on purpose — striped to match
        // the cat it would just look like more cat.
        case 'B':
            return 'var(--pixel-quilt)';
        case 'b':
            return 'var(--pixel-quilt-shade)';
        case 'o':
            return 'var(--pixel-quilt-edge)';
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
    const { showCats, catStyle, isNight } = usePixelCats();
    const { body, silhouette, layers, nightLayers } = POSES[pose];
    if (!showCats) return null;
    const solid = silhouetteOf([body, ...silhouette]);
    const activeLayers = isNight ? nightLayers : layers;
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
            {pixels(body, 'body', solid, catStyle)}
            {activeLayers.map((layer, i) => (
                <g key={i} className={layer.className}>
                    {pixels(layer.grid, `layer-${i}`, solid, catStyle)}
                </g>
            ))}
        </svg>
    );
};

export default PixelCat;
