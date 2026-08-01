import React from 'react';
import { usePixelCats, CatStyle, CatState } from '../contexts/PixelCatContext';

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
    /** One layer stack per state of the day. See CAT_SCHEDULE. */
    states: Record<CatState, Layer[]>;
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


// Narrowed, not shut: two pixels where the open eye is one and the shut eye is
// three. Drawn in eye colour — a lid painted in fur colour simply deletes the
// eye and the cat looks faceless.
const DONUT_EYES_DROOPY = [
    '',
    '',
    '',
    '',
    '',
    '',
    '...EE......EE.............',
];

// The quilt kicked down to the base overnight — still on, no longer up to the
// chin. Same clay tones as the full quilt so it reads as the same object.
const DONUT_QUILT_LOW = [
    '', '', '', '', '', '', '', '', '', '', '',
    '.oooooooooooooooooooo.....',
    'oBBBBBBBBBBBBBBBBBBBBo....',
    '.oooooooooooooooooooo.....',
];

// Raised to the cheek and deliberately poking past the head's left edge. Kept
// entirely inside the body it was white-edge on white and vanished.
const DONUT_PAW_FACE = [
    '',
    '',
    '',
    '',
    '',
    'PP........................',
    'pp........................',
    'Pp........................',
];

// A ball of wool on the floor, in the same clay palette as the bowl and quilt
// so the props read as one set.
const DONUT_YARN = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '.oo.......................',
    'oBoBo.....................',
    '.ooo......................',
];

// Bowl on the floor at the cat's left. y13 is the only row with space beside
// the body, and y14 is free the whole way across.
const DONUT_BOWL_EMPTY = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'oBBBBBo...................',
    '.ooooo....................',
];

const DONUT_BOWL_FULL = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '..FFF.....................',
    'oFFFFFo...................',
    '.ooooo....................',
];

const LOAF_EYES_DROOPY = [
    '',
    '',
    '',
    '',
    '',
    '..........EE.....EE.......',
];

const LOAF_QUILT_LOW = [
    '', '', '', '', '', '', '', '', '', '', '',
    '.....oooooooooooooooooooo.',
    '....oBBBBBBBBBBBBBBBBBBBBo',
    '.....oooooooooooooooooooo.',
];

const LOAF_PAW_FACE = [
    '',
    '',
    '',
    '',
    '....PP....................',
    '....pp....................',
    '....Pp....................',
];

const LOAF_YARN = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '......................oo..',
    '.....................oBoBo',
    '......................ooo.',
];

// Bowl to the cat's right: y13 leaves x23-25 clear and y14 is free, so the
// bowl tucks against the body rather than floating.
const LOAF_BOWL_EMPTY = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '...................oBBBBBo',
    '....................ooooo.',
];

const LOAF_BOWL_FULL = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '.....................FFF..',
    '...................oFFFFFo',
    '....................ooooo.',
];

// Second grooming frame: the same paw a pixel higher. Alternating the two is
// the lick — the paw travelling to the face and back, not the cat moving.
const DONUT_PAW_FACE_UP = [
    '', '', '', '',
    'PP........................',
    'pp........................',
    'Pp........................',
];

// Head down into the bowl. Covers the resting face in fur and redraws it a row
// lower, so only the head dips — shifting the whole cat would be the idle bob
// that was deliberately removed. Drawn after the shut-eye layer, so toggling
// this one layer is the whole chew.
const DONUT_EAT_FACE_LOW = [
    '', '', '', '', '', '',
    '...###.....###............',
    '...EEE.##..EEE............',
    '.......NN.................',
];

// Two z's drifting up and to the right, in the free corner above the tail.
const DONUT_ZZZ = [
    '.......................zzz',
    '........................z.',
    '.......................zzz',
    '....................zzz...',
    '.....................z....',
    '....................zzz...',
];

const LOAF_PAW_FACE_UP = [
    '', '', '',
    '....PP....................',
    '....pp....................',
    '....Pp....................',
];

const LOAF_EAT_FACE_LOW = [
    '', '', '', '', '',
    '..........###....###......',
    '..........EEE....EEE......',
    '..............##..........',
    '..............NN..........',
];

// Up and to the left here: the loaf's right side is body all the way out, but
// everything above its shoulder on the left is clear.
const LOAF_ZZZ = [
    'zzz.......................',
    '.z........................',
    'zzz.......................',
    '...zzz....................',
    '....z.....................',
    '...zzz....................',
];

export type CatPose = 'donut' | 'loaf';

/**
 * The day, per pose.
 *
 * Ears twitch in every state, asleep included — that much a sleeping cat does
 * do. Everything else is composed from the shared overlays, so a state is a
 * choice of eyes, of what the paws are doing, and of at most one prop. Order
 * matters: a prop listed after the body is drawn in front of it.
 */
function donutStates(): Record<CatState, Layer[]> {
    const ears: Layer[] = [
        { grid: DONUT_EARS_REST, className: 'px-ear-rest' },
        { grid: DONUT_EARS_TWITCH, className: 'px-ear-twitch' },
    ];
    const tailIdle: Layer[] = [
        { grid: DONUT_TAIL, className: 'px-tail-rest' },
        { grid: DONUT_TAIL_FLICK, className: 'px-tail-flick' },
    ];
    const tailStill: Layer[] = [{ grid: DONUT_TAIL, className: '' }];
    const pawsIdle: Layer[] = [{ grid: DONUT_PAWS, className: '' }];
    const pawsKnead: Layer[] = [
        { grid: DONUT_PAWS, className: 'px-paw-rest' },
        { grid: DONUT_PAWS_LEFT, className: 'px-paw-left' },
        { grid: DONUT_PAWS_RIGHT, className: 'px-paw-right' },
    ];
    const blink: Layer = { grid: DONUT_BLINK, className: 'px-blink' };
    const shut: Layer = { grid: DONUT_SLEEP_EYES, className: '' };
    const droopy: Layer = { grid: DONUT_EYES_DROOPY, className: '' };

    return {
        // Quilt kicked to the base, eyes not open yet.
        waking: [...tailStill, { grid: DONUT_QUILT_LOW, className: '' }, ...ears, droopy],
        // The liveliest stretch: everything that moves, moves.
        alert: [...tailIdle, ...pawsKnead, ...ears, blink],
        playing: [...tailIdle, { grid: DONUT_YARN, className: '' }, ...ears, blink],
        napping: [...tailStill, ...pawsIdle, ...ears, shut],
        grooming: [...tailIdle, ...pawsIdle, ...ears, shut,
            { grid: DONUT_PAW_FACE, className: 'px-lick-a' },
            { grid: DONUT_PAW_FACE_UP, className: 'px-lick-b' }],
        // Bowl first so the cat sits in front of it, then a hard stare at it.
        waiting: [{ grid: DONUT_BOWL_EMPTY, className: '' }, ...tailIdle, ...pawsIdle, ...ears],
        eating: [{ grid: DONUT_BOWL_FULL, className: '' }, ...tailStill, ...pawsIdle, ...ears, shut,
            { grid: DONUT_EAT_FACE_LOW, className: 'px-chew' }],
        winding: [...tailStill, ...pawsIdle, ...ears, droopy],
        asleep: [...tailStill, { grid: DONUT_QUILT, className: '' }, ...ears, shut,
            { grid: DONUT_ZZZ, className: 'px-zzz' }],
    };
}

function loafStates(): Record<CatState, Layer[]> {
    const ears: Layer[] = [
        { grid: LOAF_EARS_REST, className: 'px-ear-rest' },
        { grid: LOAF_EARS_TWITCH, className: 'px-ear-twitch' },
    ];
    const tailIdle: Layer[] = [
        { grid: LOAF_TAIL, className: 'px-tail-rest' },
        { grid: LOAF_TAIL_WAG, className: 'px-tail-flick' },
    ];
    const tailStill: Layer[] = [{ grid: LOAF_TAIL, className: '' }];
    const pawsIdle: Layer[] = [{ grid: LOAF_PAWS, className: '' }];
    const pawsStretch: Layer[] = [
        { grid: LOAF_PAWS, className: 'px-paw-still' },
        { grid: LOAF_PAWS_STRETCH, className: 'px-paw-stretch' },
    ];
    const blink: Layer = { grid: LOAF_BLINK, className: 'px-blink' };
    const shut: Layer = { grid: LOAF_SLEEP_EYES, className: '' };
    const droopy: Layer = { grid: LOAF_EYES_DROOPY, className: '' };

    return {
        waking: [...tailStill, { grid: LOAF_QUILT_LOW, className: '' }, ...ears, droopy],
        alert: [...tailIdle, ...pawsStretch, ...ears, blink],
        playing: [...tailIdle, { grid: LOAF_YARN, className: '' }, ...ears, blink],
        napping: [...tailStill, ...pawsIdle, ...ears, shut],
        grooming: [...tailIdle, ...pawsIdle, ...ears, shut,
            { grid: LOAF_PAW_FACE, className: 'px-lick-a' },
            { grid: LOAF_PAW_FACE_UP, className: 'px-lick-b' }],
        waiting: [{ grid: LOAF_BOWL_EMPTY, className: '' }, ...tailIdle, ...pawsIdle, ...ears],
        eating: [{ grid: LOAF_BOWL_FULL, className: '' }, ...tailStill, ...pawsIdle, ...ears, shut,
            { grid: LOAF_EAT_FACE_LOW, className: 'px-chew' }],
        winding: [...tailStill, ...pawsIdle, ...ears, droopy],
        asleep: [...tailStill, { grid: LOAF_QUILT, className: '' }, ...ears, shut,
            { grid: LOAF_ZZZ, className: 'px-zzz' }],
    };
}

const POSES: Record<CatPose, Pose> = {
    donut: {
        body: DONUT_BODY,
        silhouette: [DONUT_EARS_REST, DONUT_TAIL],
        states: donutStates(),
    },
    loaf: {
        body: LOAF_BODY,
        silhouette: [LOAF_EARS_REST, LOAF_TAIL],
        states: loafStates(),
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
        case 'F':
            return 'var(--pixel-food)';
        case 'z':
            return 'var(--pixel-zzz)';
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
    /**
     * Show a specific state instead of whatever the clock says. Only the
     * developer-mode gallery passes this — everywhere else the time of day is
     * the point, and pinning it would be a lie about what the cat is doing.
     */
    state?: CatState;
    /** Ignore the "show pixel cats" preference. The gallery is about the art. */
    force?: boolean;
}

const PixelCat: React.FC<PixelCatProps> = ({
    pose = 'donut', size = 150, className = '', state, force = false,
}) => {
    const { showCats, catStyle, catState } = usePixelCats();
    const { body, silhouette, states } = POSES[pose];
    if (!showCats && !force) return null;
    const solid = silhouetteOf([body, ...silhouette]);
    const activeLayers = states[state ?? catState];
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
