import React from 'react';
import { Route } from '../../logic';

const WASH = 'fill-[var(--illustration-wash)]';
const SHADE = 'fill-[var(--illustration-shade)]';
const DEEP = 'fill-[var(--illustration-deep)]';

// The syringe's washes, kept out of the drawing below so its strokes read. In
// the syringe's own frame: the barrel along x, the needle to the left.
const SYRINGE = {
    shadow: 'M8.6 35.4 C 13.6 34.4, 26.6 34.6, 31.6 35.6 C 26.4 36.6, 13.4 36.5, 8.6 35.4 Z',
    liquid: 'M-8 -4.1 C -5 -4.3, -1 -4, 1.6 -4.1 C 0.8 -2.8, 0.6 2.8, 1.6 4.1 C -1 4.2, -5 4.3, -8 4.1 C -9.3 3.4, -9.7 1.6, -9.7 0 C -9.7 -1.6, -9.3 -3.4, -8 -4.1 Z',
    underside:
        'M-8.4 2.1 C -5 2.5, -1.4 2.4, 1.1 2.2 C 1.2 2.9, 1.3 3.5, 1.6 4.1 C -1 4.2, -5 4.3, -8 4.1 C -8.6 3.6, -8.6 2.8, -8.4 2.1 Z',
    stopper:
        'M1.6 -4.1 C 2.5 -4.2, 3.3 -4.1, 4 -4.1 C 3.2 -2.8, 3 2.8, 4 4.1 C 3.3 4.2, 2.5 4.2, 1.6 4.1 C 0.6 2.8, 0.8 -2.8, 1.6 -4.1 Z',
    rod: 'M4 -1 C 7.4 -1.1, 10.8 -0.9, 13.6 -1 C 13.6 -0.3, 13.6 0.4, 13.6 1 C 10.8 1.1, 7.4 0.9, 4 1 Z',
};

/** One pen stroke. */
const Line: React.FC<{ d: string; w?: number }> = ({ d, w }) => <path d={d} strokeWidth={w} />;

/**
 * The small drawings: one for each route a dose can take, and the ones the
 * intro's rows carry. All in the same hand as DoseDoodle (see there for the
 * rules): one line colour, a flat wash, paths a little off true, outlines
 * that overshoot where they close. The injection syringe alone is drawn with
 * volume, in two deeper washes and a glint, so the one route that's a needle
 * reads as a solid thing in the hand. Small enough to sit at the head of a row,
 * so there is no ground line, and the wash is what the row is about: the
 * liquid, half the capsule, the tablet, the gel, the pad, the sample.
 */
export type DoodleName =
    | Route
    | 'syringe'
    | 'chart'
    | 'vial'
    | 'lock'
    | 'cloud'
    | 'caution'
    | 'code'
    | 'heart'
    | 'house'
    | 'notebook'
    | 'gear'
    | 'person'
    | 'report';

const DRAWINGS: Partial<Record<DoodleName, React.ReactNode>> = {
    // A syringe drawn with volume, needle down to the left: a plump barrel
    // with the dose in it, its underside a shade deeper and a glint along its
    // top, the rubber stopper, the plunger through the flange to a thumb rest
    // seen a little end-on, the hub and the needle, and a soft shadow.
    [Route.injection]: (
        <>
            <path className={SHADE} stroke="none" d={SYRINGE.shadow} />
            <g transform="translate(20.6 19) rotate(-38)">
                <path className={SHADE} stroke="none" d={SYRINGE.liquid} />
                <path className={DEEP} stroke="none" d={SYRINGE.underside} />
                <path className={DEEP} stroke="none" d={SYRINGE.stopper} />
                <path className={DEEP} stroke="none" d={SYRINGE.rod} />
                {/* The plunger rod */}
                <Line d="M4 -1 C 7.4 -1.1, 10.8 -0.9, 13.6 -1 M4 1 C 7.4 1.1, 10.8 0.9, 13.6 1" w={1.4} />
                {/* The flange, and the thumb rest seen a little end-on */}
                <path
                    className={DEEP}
                    d="M8 -6.9 C 8.9 -7.1, 9.6 -6.6, 9.7 -5.8 C 9.8 -1.9, 9.8 1.9, 9.7 5.8 C 9.6 6.6, 8.9 7.1, 8 6.9 C 7.2 6.7, 6.9 6.1, 6.9 5.5 C 6.9 1.8, 6.9 -1.8, 6.9 -5.5 C 6.9 -6.1, 7.2 -6.7, 8.2 -6.9"
                />
                <path
                    className={WASH}
                    d="M14.6 -4.4 C 15.8 -4.4, 16.5 -2.4, 16.5 0 C 16.5 2.4, 15.8 4.4, 14.6 4.4 C 13.4 4.4, 12.7 2.4, 12.7 0 C 12.7 -2.4, 13.4 -4.4, 14.8 -4.3"
                />
                {/* The barrel, round at the needle end, open at the flange */}
                <Line d="M6.9 -4.2 C 2 -4.4, -4 -4, -8 -4.2 C -9.4 -3.5, -9.9 -1.7, -9.9 0 C -9.9 1.7, -9.4 3.5, -8 4.2 C -4 4.4, 2 4, 6.9 4.2" />
                {/* The stopper's two edges */}
                <Line d="M1.6 -4.1 C 0.6 -2.8, 0.6 2.8, 1.6 4.1" w={1.3} />
                <Line d="M4 -4.1 C 3 -2.8, 3 2.8, 4 4.1" w={1.3} />
                {/* The hub and the needle */}
                <path
                    className={WASH}
                    d="M-9.8 -1.6 C -10.6 -1.7, -11.4 -1.6, -12 -1.5 C -12.3 -0.5, -12.3 0.5, -12 1.5 C -11.4 1.6, -10.6 1.7, -9.8 1.6"
                />
                <Line d="M-12.1 0 C -14.2 0.1, -16.4 -0.1, -18.4 0" w={1.4} />
                {/* Marks on the barrel, and light along its top */}
                <Line d="M-5.6 -4.2 L -5.6 -2.6 M-2.6 -4.2 L -2.6 -2.9 M0.4 -4.2 L 0.4 -2.6" w={1.1} />
                <path
                    className="stroke-[var(--illustration-shine)]"
                    d="M-7.2 -1.4 C -5.2 -1.6, -2.6 -1.5, -0.6 -1.6"
                    strokeWidth={1.6}
                />
            </g>
        </>
    ),
    // DoseDoodle's capsule, brought down to this size.
    [Route.oral]: (
        <g transform="translate(20 20) scale(0.58) rotate(-28) translate(-48.8 -37.4)" strokeWidth={3.2}>
            <path
                className={WASH}
                stroke="none"
                d="M34.6 27.2 C 29 26.6, 23.6 30.6, 23 37.6 C 22.6 43.4, 27 47, 34 46.6 C 39 46.4, 43.6 46.8, 46 46.4 C 46.8 40, 45.6 33.4, 46.2 27.6 C 42 27.4, 38.4 27.6, 34.6 27.2 Z"
            />
            <Line d="M34 25.6 C 47 24.4, 62 26, 65 25.2 C 73.4 24.4, 78.8 30.6, 78 37.6 C 77.2 45, 71.6 50, 64.6 49.2 C 52.6 50.4, 40.4 48.8, 32.8 49.6 C 24.6 50.2, 19.4 44.4, 19.8 37.2 C 20.2 30, 26 25.4, 35.2 25.5" />
            <Line d="M47 25.6 C 45.8 31.4, 48.2 43, 46.6 49.4" />
            <Line d="M56 31.4 C 60 30.6, 64 31, 67.4 30.4" w={2.4} />
        </g>
    ),
    // A scored tablet, beginning to dissolve: a crumb has come away from its
    // edge. (Lines radiating off it read as a shine, not as melting.)
    [Route.sublingual]: (
        <>
            <path
                className={WASH}
                stroke="none"
                d="M20.2 12.6 C 26 12.4, 30.4 16.6, 30.2 22.2 C 30.4 27.8, 26 32, 20.2 31.8 C 14.4 32, 10 27.8, 10.2 22.2 C 10 16.6, 14.4 12.4, 20.2 12.6 Z"
            />
            {/* The tablet */}
            <Line d="M20.2 12.6 C 26 12.4, 30.4 16.6, 30.2 22.2 C 30.4 27.8, 26 32, 20.2 31.8 C 14.4 32, 10 27.8, 10.2 22.2 C 10 16.6, 14.4 12.4, 20.6 12.7" />
            {/* Score line */}
            <Line d="M11.4 22.4 C 16 21.8, 25 22.4, 29 21.9" w={1.6} />
            {/* Crumbs come away */}
            <Line
                d="M32.6 10.2 C 33.4 9.6, 34.4 9.8, 34.6 10.8 C 34.6 11.6, 33.6 12.2, 32.8 11.6 C 32.4 11.2, 32.3 10.6, 32.8 10.1"
                w={1.4}
            />
            <Line d="M34.9 15.8 L 35 16" w={2.2} />
        </>
    ),
    // A tube, squeezed: crimped end up to the right, a bead of gel at the nozzle.
    [Route.gel]: (
        <g transform="translate(21.6 18.6) rotate(-40)">
            <path
                className={WASH}
                stroke="none"
                d="M-11.6 -0.2 C -12.8 -2.6, -16.6 -2.8, -17.6 -0.2 C -18.2 2.2, -15.8 3.6, -13.8 2.8 C -12.4 2.2, -11.2 1.2, -11.6 -0.2 Z"
            />
            {/* Body */}
            <Line d="M14 -7.2 C 8 -6.6, 0 -5.6, -6.2 -4.6 C -6.6 -1.6, -5.9 1.8, -6.3 4.7 C 0 5.7, 8 6.5, 14.2 7.2 C 13.7 2.4, 14.4 -2.6, 13.9 -7.7" />
            {/* Crimp */}
            <Line d="M10.8 -6.7 C 10.4 -2, 11.1 2.4, 10.7 6.7" w={1.5} />
            {/* Nozzle */}
            <Line d="M-6.2 -2.2 C -7.4 -2.4, -8.4 -2.1, -9.4 -2.3 C -9.7 -0.6, -9.2 0.8, -9.5 2.3 C -8.4 2.5, -7.4 2.1, -6.3 2.3" />
            {/* Gel */}
            <Line
                d="M-11.6 -0.2 C -12.8 -2.6, -16.6 -2.8, -17.6 -0.2 C -18.2 2.2, -15.8 3.6, -13.8 2.8 C -12.4 2.2, -11.2 1.2, -11.7 -0.6"
                w={1.5}
            />
        </g>
    ),
    // A patch, its backing peeled up at one corner.
    [Route.patchApply]: (
        <g transform="rotate(-6 20 20)">
            <path
                className={WASH}
                stroke="none"
                d="M13.6 13.8 C 16 13.4, 19 13.9, 21.6 13.5 C 21.3 16, 21.8 19, 21.5 21.6 C 19 21.9, 16 21.4, 13.5 21.8 C 13.8 19, 13.3 16, 13.6 13.8 Z"
            />
            {/* Outline, round at three corners and cut across the fourth */}
            <Line d="M14.2 8.8 C 18 8.4, 22 9.2, 26 8.8 C 29.4 8.6, 31.4 10.8, 31.2 14 C 30.8 17, 31.4 20, 31 23.2 C 28.4 25.8, 25.8 28.4, 23.2 31 C 20 31.4, 17 30.8, 14 31.2 C 10.8 31.4, 8.6 29.2, 8.8 26 C 9.2 22, 8.4 18, 8.8 14 C 8.6 10.8, 10.6 8.6, 14.6 8.7" />
            {/* The corner, curled back over the patch */}
            <Line d="M31 23.2 C 28.4 22.8, 25.6 23.2, 24.2 24.4 C 23 25.8, 22.9 28.4, 23.2 31" w={1.5} />
        </g>
    ),
    // The same patch coming off: smaller, tipped the other way and lifted
    // clear, its cut corner curled right back, and a loose stroke underneath
    // where it came away. The wash is the backing the curl turns up. Drawn
    // from the one above so that on and off read as a pair down the list.
    [Route.patchRemove]: (
        <>
            <g transform="rotate(14 20 15)">
                <path
                    className={WASH}
                    stroke="none"
                    d="M29 14.6 C 25.4 13.6, 21.6 14, 20 16.2 C 18.6 18.6, 18.9 21.4, 19.5 24.1 C 22.6 21, 25.8 17.8, 29 14.6 Z"
                />
                {/* Outline, cut across the corner the curl starts from */}
                <Line d="M15.4 6 C 18.4 5.7, 21.6 6.4, 24.8 6 C 27.5 5.9, 29.1 7.6, 29 10.2 C 28.7 11.8, 29.1 13.2, 29 14.6 C 25.8 17.8, 22.6 21, 19.5 24.1 C 18 24.2, 16.6 23.7, 15.2 24 C 12.6 24.1, 10.9 22.4, 11 19.8 C 11.4 16.6, 10.7 13.4, 11 10.2 C 10.9 7.6, 12.5 5.9, 15.7 6" />
                {/* The corner, curled back over itself */}
                <Line d="M29 14.6 C 25.4 13.6, 21.6 14, 20 16.2 C 18.6 18.6, 18.9 21.4, 19.5 24.1" w={1.5} />
            </g>
            {/* Where it came away */}
            <Line d="M13.2 33.6 C 16.6 32.8, 20.6 33.8, 24.6 32.9 C 25.8 32.7, 26.8 32.8, 27.8 32.5" w={1.5} />
        </>
    ),

    // ── The intro's rows ──────────────────────────────────────────────────

    // A syringe, needle down and to the left: a dose being given.
    syringe: (
        <g transform="translate(21.2 18.8) rotate(-40)">
            <path
                className={WASH}
                stroke="none"
                d="M-7.2 -3.3 C -4 -3.6, -1 -3.2, 1.4 -3.4 C 1.1 -1, 1.6 1.4, 1.3 3.4 C -2 3.7, -5 3.2, -7.3 3.5 Z"
            />
            {/* Barrel */}
            <Line d="M-8 -4.1 C -3 -4.5, 4 -3.9, 9.2 -4.2 C 8.8 -1.4, 9.4 1.6, 9 4.2 C 4 4.5, -3 3.9, -8.2 4.3 C -7.8 1.6, -8.4 -1.2, -7.9 -4.6" />
            {/* Finger flange */}
            <Line d="M9.2 -6.6 C 8.8 -2, 9.5 2.4, 9 6.6" />
            {/* Plunger: head inside the barrel, rod, thumb rest */}
            <Line d="M1.4 -3.8 C 1 -1.2, 1.7 1.4, 1.3 3.9" w={1.5} />
            <Line d="M1.6 0.1 C 5 -0.2, 11 0.3, 15 0" w={1.5} />
            <Line d="M15.2 -3.6 C 14.8 -1.2, 15.5 1.4, 15.1 3.7" />
            {/* Needle */}
            <Line d="M-8.2 0 C -11 0.2, -14.6 -0.2, -18.2 0.1" w={1.4} />
        </g>
    ),
    // One dose absorbing to a peak and clearing more slowly than it rose, the
    // shape the Overview draws.
    chart: (
        <>
            <path
                className={WASH}
                stroke="none"
                d="M10.4 32.6 C 12.4 22, 14.4 12.6, 17.8 12.8 C 21.2 13.2, 22.8 23.4, 26.6 27.4 C 29.2 29.8, 31.8 31, 33.8 31.6 L 33.6 32.8 Z"
            />
            {/* Axes */}
            <Line d="M8.2 6.4 C 7.8 14, 8.6 24, 8.2 33.8 C 16 33.4, 26 34.2, 35.4 33.6" />
            {/* The curve */}
            <Line d="M9.8 31.2 C 12.2 21, 14.2 10.6, 17.8 10.8 C 21.2 11.2, 22.8 22.4, 26.6 26.4 C 29.2 29, 32 30.4, 34.6 30.8" />
        </>
    ),
    // VialDoodle's tube and stopper, without its drop, brought down to this size.
    vial: (
        <g transform="translate(20 20) scale(0.6) translate(-44.3 -35.6)" strokeWidth={3.2}>
            <path
                className={WASH}
                stroke="none"
                d="M33.4 38.6 C 39 37.6, 46 39.8, 55.2 38.4 C 55.4 44, 55.2 49, 55.2 52 C 55 59.4, 50.4 62.4, 44.4 62.2 C 38.4 62.4, 33.8 59.4, 33.4 52 C 33.2 47, 33.4 42, 33.4 38.6 Z"
            />
            <Line d="M32 14.4 C 31.6 24, 32.2 40, 32.4 52.4 C 32.8 60, 38 64, 44.4 63.8 C 51 64, 56 60.2, 56.2 52.4 C 56.6 40, 55.8 24, 56.4 14" />
            <Line d="M28.4 14.4 C 36 13.6, 50 14.8, 60 14" />
            <Line d="M34.2 13.8 C 33.6 9.6, 35 7.2, 37.6 7 C 43 6.6, 49.4 7.6, 51.8 7.2 C 54.6 7.6, 55 10, 54.6 13.8" />
            <Line d="M32.6 38.8 C 38.4 37.8, 45.4 40, 56.2 38.4" w={2.5} />
            <Line d="M32.8 22.4 L 37.6 22.6" w={2.5} />
            <Line d="M32.6 29.4 L 35.8 29.5" w={2.5} />
            <Line d="M38.2 47 C 38 50.6, 38.4 54, 39.6 57" w={2.5} />
        </g>
    ),
    // A padlock, shut.
    lock: (
        <>
            <path
                className={WASH}
                stroke="none"
                d="M10.2 19.8 C 16 19.4, 24 20, 30 19.6 C 30.6 24, 30.2 29, 30.4 32.6 C 24 33.2, 16 32.6, 9.8 33 C 9.4 29, 9.8 24, 9.6 19.8 Z"
            />
            {/* Shackle */}
            <Line d="M13.8 19.4 C 13.4 13.4, 14.8 8.2, 20 8 C 25.2 8.2, 26.6 13.4, 26.2 19.4" />
            {/* Body */}
            <Line d="M10.2 19.8 C 16 19.4, 24 20, 30 19.6 C 30.6 24, 30.2 29, 30.4 32.6 C 24 33.2, 16 32.6, 9.8 33 C 9.4 29, 9.8 24, 9.6 19.8 C 9.8 19.7, 10.2 19.6, 10.8 19.7" />
            {/* Keyhole */}
            <Line d="M20 24.2 C 20.2 25.8, 19.8 27.4, 20 28.8" w={1.6} />
        </>
    ),
    // A cloud.
    cloud: (
        <>
            <path
                className={WASH}
                stroke="none"
                d="M11.4 30.6 C 6.4 30.8, 5.6 24, 10.6 22.4 C 9.6 16.4, 16.4 13.4, 19.8 17 C 21.8 11.8, 30.4 12.8, 30 19.6 C 35 19.4, 36.2 28, 31 30.4 C 25 30.8, 17 30.4, 11.4 30.6 Z"
            />
            <Line d="M11.8 30.7 C 6.4 30.8, 5.6 24, 10.6 22.4 C 9.6 16.4, 16.4 13.4, 19.8 17 C 21.8 11.8, 30.4 12.8, 30 19.6 C 35 19.4, 36.2 28, 31 30.4 C 25 30.8, 17 30.4, 11.2 30.6" />
        </>
    ),
    // A warning sign: a triangle round an exclamation mark.
    caution: (
        <>
            <path
                className={WASH}
                stroke="none"
                d="M20 8.6 C 24 15, 28.4 22.6, 33 30.4 C 24.4 30.8, 15.6 30.2, 7 30.6 C 11.4 23, 15.8 15.6, 20 8.6 Z"
            />
            <Line d="M20 8.6 C 24 15, 28.4 22.6, 33 30.4 C 24.4 30.8, 15.6 30.2, 7 30.6 C 11.4 23, 15.8 15.6, 19.7 8.2" />
            <Line d="M20 15.6 C 19.8 18, 20.2 21, 20 23.2" w={2} />
            <Line d="M20 26.6 L 20.1 26.8" w={2.6} />
        </>
    ),
    // A speech bubble with a tag in it: the picture on Credits, talking code.
    code: (
        <>
            <path
                className={WASH}
                stroke="none"
                d="M9 9.6 C 16 9, 25 9.4, 31.4 9 C 33.6 9.2, 34.6 10.6, 34.4 12.8 C 34.6 17, 34.2 21, 34.4 24.4 C 34.4 26.6, 33 27.6, 31 27.6 C 26 27.4, 21 27.8, 17 27.6 L 11.6 32.6 L 12.4 27.6 C 10.6 27.8, 6.6 27.4, 5.8 25 C 5.6 20, 6 15, 5.7 12.6 C 5.8 10.6, 7 9.6, 9 9.6 Z"
            />
            <Line d="M9 9.6 C 16 9, 25 9.4, 31.4 9 C 33.6 9.2, 34.6 10.6, 34.4 12.8 C 34.6 17, 34.2 21, 34.4 24.4 C 34.4 26.6, 33 27.6, 31 27.6 C 26 27.4, 21 27.8, 17 27.6 L 11.6 32.6 L 12.4 27.6 C 10.6 27.8, 6.6 27.4, 5.8 25 C 5.6 20, 6 15, 5.7 12.6 C 5.8 10.6, 7 9.4, 9.8 9.3" />
            <Line d="M15.4 14.4 C 14.4 15.8, 13.2 17, 12.2 18.4 C 13.2 19.8, 14.4 21, 15.6 22.2" w={1.6} />
            <Line d="M21.4 13.6 C 20.4 16.8, 19.6 19.8, 18.6 23" w={1.6} />
            <Line d="M24.6 14.4 C 25.6 15.8, 26.8 17, 27.8 18.4 C 26.8 19.8, 25.6 21, 24.4 22.2" w={1.6} />
        </>
    ),
    // A heart, the left lobe a little rounder than the right.
    heart: (
        <>
            <path
                className={WASH}
                stroke="none"
                d="M20 31 C 14 26.6, 8.4 22.4, 8.6 16.4 C 8.8 12, 12.4 9.4, 15.8 9.8 C 18 10, 19.4 11.6, 20 13.4 C 20.8 11.4, 22.4 9.8, 24.8 9.8 C 28.4 9.8, 31.6 12.6, 31.2 17 C 30.8 22.6, 25.6 26.8, 20 31 Z"
            />
            <Line d="M20 31 C 14 26.6, 8.4 22.4, 8.6 16.4 C 8.8 12, 12.4 9.4, 15.8 9.8 C 18 10, 19.4 11.6, 20 13.4 C 20.8 11.4, 22.4 9.8, 24.8 9.8 C 28.4 9.8, 31.6 12.6, 31.2 17 C 30.8 22.6, 25.6 26.8, 19.6 31.4" />
        </>
    ),

    // ── The sidebar's pages ───────────────────────────────────────────────

    // A house with a chimney, its door a shade deeper than the walls.
    house: (
        <>
            <path
                className={WASH}
                stroke="none"
                d="M11.2 18 C 14 15.4, 17 12.2, 20 9.4 C 23 12.2, 26 15, 28.9 17.8 C 29.2 22.6, 28.8 27.6, 29.2 32.2 C 23 32.6, 17 31.9, 11 32.2 C 11.4 27.4, 10.8 22.6, 11.2 18 Z"
            />
            <path
                className={SHADE}
                stroke="none"
                d="M17.6 32.2 C 17.4 29.6, 17.6 27, 17.5 25 C 19.2 24.6, 21 24.6, 22.6 25 C 22.8 27.2, 22.5 29.8, 22.7 32.3 Z"
            />
            {/* Chimney, behind the roof */}
            <Line d="M25.4 13.6 C 25.3 12.2, 25.5 10.8, 25.3 9.6 C 26.3 9.4, 27.3 9.4, 28.2 9.6 C 28.3 11.6, 28.1 14, 28.2 16.2" />
            {/* Roof, overshooting at the eaves */}
            <Line d="M7.4 20.8 C 11.6 16.8, 15.8 12.8, 20 8.8 C 24.2 12.6, 28.4 16.4, 32.8 20.6" />
            {/* Walls */}
            <Line d="M11.2 17.8 C 10.8 22.6, 11.4 27.6, 11 32.2 C 17 32.6, 23 31.9, 29.2 32.3 C 28.8 27.4, 29.3 22.4, 28.9 17.6" />
            {/* Door */}
            <Line
                d="M17.6 32.2 C 17.4 29.6, 17.6 27, 17.5 25 C 19.2 24.6, 21 24.6, 22.6 25 C 22.8 27.2, 22.5 29.8, 22.7 32.3"
                w={1.6}
            />
        </>
    ),
    // The dose log: a notebook page, the first line ticked off.
    notebook: (
        <>
            <path
                className={WASH}
                stroke="none"
                d="M11.6 7.8 C 17 7.4, 23.4 8, 29 7.6 C 30.6 7.6, 31.4 8.6, 31.4 10.2 C 31 17, 31.6 25, 31.2 30.6 C 31.2 32, 30.2 32.8, 28.8 32.6 C 23 32.9, 17 32.4, 11.4 32.8 C 9.8 32.8, 9 31.8, 9 30.4 C 9.4 23.6, 8.8 16.6, 9.2 10.2 C 9.1 8.6, 10 7.7, 11.6 7.8 Z"
            />
            <Line d="M11.6 7.8 C 17 7.4, 23.4 8, 29 7.6 C 30.6 7.6, 31.4 8.6, 31.4 10.2 C 31 17, 31.6 25, 31.2 30.6 C 31.2 32, 30.2 32.8, 28.8 32.6 C 23 32.9, 17 32.4, 11.4 32.8 C 9.8 32.8, 9 31.8, 9 30.4 C 9.4 23.6, 8.8 16.6, 9.2 10.2 C 9.1 8.6, 10 7.7, 12.2 7.7" />
            {/* The tick */}
            <Line d="M13.4 14.6 C 14.2 15.3, 14.9 16.1, 15.6 17 C 16.8 15.3, 18 13.8, 19.6 12.4" w={1.8} />
            {/* Lines, the last one shorter */}
            <Line d="M22 15.2 C 23.8 15, 25.8 15.3, 27.6 15.1" w={1.5} />
            <Line d="M13.4 21.4 C 18 21.1, 23 21.5, 27.6 21.2" w={1.5} />
            <Line d="M13.4 26.8 C 16.8 26.6, 20.4 26.9, 23.4 26.7" w={1.5} />
        </>
    ),
    // Settings: a gear with eight teeth, a little uneven, its hub hollow.
    gear: (
        <>
            <path
                className={WASH}
                stroke="none"
                d="M20.0 9.9 L 21.4 7.1 L 24.1 7.4 L 24.1 10.9 Q 26.3 10.9, 27.2 12.8 L 30.2 11.8 L 31.6 14.1 L 29.5 16.4 Q 30.9 18.0, 30.0 20.0 L 33.1 21.4 L 32.3 24.0 L 29.1 24.1 Q 29.1 26.3, 27.2 27.2 L 28.4 30.4 L 25.9 31.6 L 23.6 29.4 Q 22.0 30.9, 20.0 30.3 L 18.5 33.3 L 15.9 32.6 L 15.8 29.2 Q 13.7 29.1, 12.6 27.4 L 9.9 28.1 L 8.1 26.1 L 10.6 23.6 Q 9.1 22.0, 10.0 20.0 L 7.1 18.6 L 7.5 16.0 L 10.6 15.7 Q 10.9 13.7, 12.9 12.9 L 11.7 9.7 L 14.0 8.2 L 16.4 10.5 Q 18.0 9.1, 20.0 9.9 Z"
            />
            <Line d="M20.0 9.9 L 21.4 7.1 L 24.1 7.4 L 24.1 10.9 Q 26.3 10.9, 27.2 12.8 L 30.2 11.8 L 31.6 14.1 L 29.5 16.4 Q 30.9 18.0, 30.0 20.0 L 33.1 21.4 L 32.3 24.0 L 29.1 24.1 Q 29.1 26.3, 27.2 27.2 L 28.4 30.4 L 25.9 31.6 L 23.6 29.4 Q 22.0 30.9, 20.0 30.3 L 18.5 33.3 L 15.9 32.6 L 15.8 29.2 Q 13.7 29.1, 12.6 27.4 L 9.9 28.1 L 8.1 26.1 L 10.6 23.6 Q 9.1 22.0, 10.0 20.0 L 7.1 18.6 L 7.5 16.0 L 10.6 15.7 Q 10.9 13.7, 12.9 12.9 L 11.7 9.7 L 14.0 8.2 L 16.4 10.5 Q 18.0 9.1, 20.0 9.9 L 20.5 8.9" />
            <path
                className={SHADE}
                d="M20 15.6 C 22.5 15.5, 24.5 17.5, 24.4 20 C 24.4 22.5, 22.4 24.5, 19.9 24.4 C 17.4 24.4, 15.5 22.4, 15.6 19.9 C 15.6 17.4, 17.6 15.5, 20.4 15.7"
            />
        </>
    ),
    // Account: someone's head and shoulders.
    person: (
        <>
            <path
                className={WASH}
                d="M9.6 32.2 C 10 26.6, 14.4 23.2, 20 23.2 C 25.8 23.2, 30 26.8, 30.4 32 C 23.4 32.5, 16.6 31.9, 9.2 32.3"
            />
            <path
                className={SHADE}
                d="M20 8.6 C 23.4 8.5, 25.9 11.2, 25.8 14.6 C 25.8 18, 23.2 20.6, 19.9 20.5 C 16.6 20.5, 14.1 17.9, 14.2 14.6 C 14.2 11.2, 16.8 8.5, 20.6 8.7"
            />
        </>
    ),
    // A lab report: a sheet with a little curve on it and the lines under it.
    report: (
        <>
            <path
                className={WASH}
                stroke="none"
                d="M11.6 7.8 C 17 7.4, 23.4 8, 29 7.6 C 30.6 7.6, 31.4 8.6, 31.4 10.2 C 31 17, 31.6 25, 31.2 30.6 C 31.2 32, 30.2 32.8, 28.8 32.6 C 23 32.9, 17 32.4, 11.4 32.8 C 9.8 32.8, 9 31.8, 9 30.4 C 9.4 23.6, 8.8 16.6, 9.2 10.2 C 9.1 8.6, 10 7.7, 11.6 7.8 Z"
            />
            <Line d="M11.6 7.8 C 17 7.4, 23.4 8, 29 7.6 C 30.6 7.6, 31.4 8.6, 31.4 10.2 C 31 17, 31.6 25, 31.2 30.6 C 31.2 32, 30.2 32.8, 28.8 32.6 C 23 32.9, 17 32.4, 11.4 32.8 C 9.8 32.8, 9 31.8, 9 30.4 C 9.4 23.6, 8.8 16.6, 9.2 10.2 C 9.1 8.6, 10 7.7, 12.2 7.7" />
            {/* One dose's curve, as on Overview */}
            <Line
                d="M13 20.4 C 14.6 15.6, 16 12.4, 18 12.6 C 20 12.8, 21 17, 23.2 18.6 C 24.6 19.6, 26.4 20, 27.8 20.2"
                w={1.6}
            />
            <Line d="M13.4 25.2 C 18 24.9, 23 25.3, 27.6 25" w={1.4} />
            <Line d="M13.4 29 C 16.4 28.8, 19.4 29.1, 22.2 28.9" w={1.4} />
        </>
    ),
};

/** Each page's own drawing, for the sidebar. A page
 *  without one (Admin) keeps its line icon. */
export const NAV_DOODLES: Record<string, DoodleName> = {
    home: 'house',
    history: 'notebook',
    lab: 'report',
    settings: 'gear',
    account: 'person',
};

interface DoodleProps {
    name: DoodleName;
    /** Rendered width and height in rem, so it scales with the type beside it. */
    size?: number;
    /** Grey: a row whose turn has not come, or that can't be chosen. */
    asleep?: boolean;
    className?: string;
}

const Doodle: React.FC<DoodleProps> = ({ name, size = 2.25, asleep = false, className = '' }) => (
    <svg
        viewBox="0 0 40 40"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: `${size}rem`, height: `${size}rem` }}
        className={`shrink-0 text-[var(--illustration-line)] ${asleep ? 'dd-asleep' : ''} ${className}`}
    >
        {DRAWINGS[name]}
    </svg>
);

export default Doodle;
