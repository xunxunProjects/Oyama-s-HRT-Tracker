import React from 'react';
import { Route } from '../../logic';

const WASH = 'fill-[var(--color-m3-primary-container)] dark:fill-[var(--color-m3-dark-primary-container)]';

/** One pen stroke. */
const Line: React.FC<{ d: string; w?: number }> = ({ d, w }) => <path d={d} strokeWidth={w} />;

/**
 * The small drawings: one for each route a dose can take, and the ones the
 * intro's rows carry. All in the same hand as DoseDoodle (see there for the
 * rules): one line colour, one flat wash, paths a little off true, outlines
 * that overshoot where they close. Small enough to sit at the head of a row,
 * so there is no ground line, and the wash is what the row is about: the
 * liquid, half the capsule, the tablet, the gel, the pad, the sample.
 */
export type DoodleName = Route | 'syringe' | 'chart' | 'vial' | 'lock' | 'cloud' | 'caution';

const DRAWINGS: Partial<Record<DoodleName, React.ReactNode>> = {
    // An ampoule: the drawn-out tip, the ring it snaps at, liquid in the body.
    [Route.injection]: (
        <g transform="rotate(-8 20 20)">
            <path className={WASH} stroke="none" d="M14.8 23.8 C 18 23.4, 22 24, 25.2 23.6 C 25 26, 25.4 28.6, 25.2 30.4 C 25 32.4, 22.8 33.2, 20 33 C 17.2 33.2, 15 32.4, 14.8 30.4 C 14.6 28.6, 15 26, 14.8 23.8 Z" />
            {/* Glass, from the tip round and back */}
            <Line d="M17.2 9.6 C 16.4 7.2, 17.6 5.8, 20 5.8 C 22.4 5.8, 23.6 7.2, 22.8 9.6 C 23 11.4, 22.6 13.2, 22.8 15 C 25.2 16.2, 26.6 18, 26.6 20.2 C 26.4 24, 26.8 28, 26.4 30.4 C 26.2 33.2, 23.6 34.4, 20 34.2 C 16.4 34.4, 13.8 33.2, 13.6 30.4 C 13.2 28, 13.6 24, 13.4 20.2 C 13.4 18, 14.8 16.2, 17.2 15 C 17.4 13.2, 17 11.4, 17.1 9.2" />
            {/* The ring at the neck */}
            <Line d="M16.4 13 C 18 12.6, 21.2 13.2, 23.6 12.8" w={1.5} />
            {/* Level of the liquid */}
            <Line d="M14.4 24 C 18 23.4, 22 24.2, 25.6 23.6" w={1.5} />
            {/* A stroke of shine on the glass */}
            <Line d="M16.6 26.4 C 16.4 27.8, 16.8 29.4, 17.1 30.8" w={1.5} />
        </g>
    ),
    // DoseDoodle's capsule, brought down to this size.
    [Route.oral]: (
        <g transform="translate(20 20) scale(0.58) rotate(-28) translate(-48.8 -37.4)" strokeWidth={3.2}>
            <path className={WASH} stroke="none" d="M34.6 27.2 C 29 26.6, 23.6 30.6, 23 37.6 C 22.6 43.4, 27 47, 34 46.6 C 39 46.4, 43.6 46.8, 46 46.4 C 46.8 40, 45.6 33.4, 46.2 27.6 C 42 27.4, 38.4 27.6, 34.6 27.2 Z" />
            <Line d="M34 25.6 C 47 24.4, 62 26, 65 25.2 C 73.4 24.4, 78.8 30.6, 78 37.6 C 77.2 45, 71.6 50, 64.6 49.2 C 52.6 50.4, 40.4 48.8, 32.8 49.6 C 24.6 50.2, 19.4 44.4, 19.8 37.2 C 20.2 30, 26 25.4, 35.2 25.5" />
            <Line d="M47 25.6 C 45.8 31.4, 48.2 43, 46.6 49.4" />
            <Line d="M56 31.4 C 60 30.6, 64 31, 67.4 30.4" w={2.4} />
        </g>
    ),
    // A scored tablet, beginning to dissolve.
    [Route.sublingual]: (
        <>
            <path className={WASH} stroke="none" d="M20.2 12.6 C 26 12.4, 30.4 16.6, 30.2 22.2 C 30.4 27.8, 26 32, 20.2 31.8 C 14.4 32, 10 27.8, 10.2 22.2 C 10 16.6, 14.4 12.4, 20.2 12.6 Z" />
            {/* The tablet */}
            <Line d="M20.2 12.6 C 26 12.4, 30.4 16.6, 30.2 22.2 C 30.4 27.8, 26 32, 20.2 31.8 C 14.4 32, 10 27.8, 10.2 22.2 C 10 16.6, 14.4 12.4, 20.6 12.7" />
            {/* Score line */}
            <Line d="M11.4 22.4 C 16 21.8, 25 22.4, 29 21.9" w={1.6} />
            {/* Dissolving */}
            <Line d="M30.2 9.6 L 32.8 6.8" w={1.6} />
            <Line d="M25.4 7.6 L 26.2 4.2" w={1.6} />
            <Line d="M33.4 14.4 L 36.8 13.6" w={1.6} />
        </>
    ),
    // A tube, squeezed: crimped end up to the right, a bead of gel at the nozzle.
    [Route.gel]: (
        <g transform="translate(21.6 18.6) rotate(-40)">
            <path className={WASH} stroke="none" d="M-11.6 -0.2 C -12.8 -2.6, -16.6 -2.8, -17.6 -0.2 C -18.2 2.2, -15.8 3.6, -13.8 2.8 C -12.4 2.2, -11.2 1.2, -11.6 -0.2 Z" />
            {/* Body */}
            <Line d="M14 -7.2 C 8 -6.6, 0 -5.6, -6.2 -4.6 C -6.6 -1.6, -5.9 1.8, -6.3 4.7 C 0 5.7, 8 6.5, 14.2 7.2 C 13.7 2.4, 14.4 -2.6, 13.9 -7.7" />
            {/* Crimp */}
            <Line d="M10.8 -6.7 C 10.4 -2, 11.1 2.4, 10.7 6.7" w={1.5} />
            {/* Nozzle */}
            <Line d="M-6.2 -2.2 C -7.4 -2.4, -8.4 -2.1, -9.4 -2.3 C -9.7 -0.6, -9.2 0.8, -9.5 2.3 C -8.4 2.5, -7.4 2.1, -6.3 2.3" />
            {/* Gel */}
            <Line d="M-11.6 -0.2 C -12.8 -2.6, -16.6 -2.8, -17.6 -0.2 C -18.2 2.2, -15.8 3.6, -13.8 2.8 C -12.4 2.2, -11.2 1.2, -11.7 -0.6" w={1.5} />
        </g>
    ),
    // A patch, its backing peeled up at one corner.
    [Route.patchApply]: (
        <g transform="rotate(-6 20 20)">
            <path className={WASH} stroke="none" d="M13.6 13.8 C 16 13.4, 19 13.9, 21.6 13.5 C 21.3 16, 21.8 19, 21.5 21.6 C 19 21.9, 16 21.4, 13.5 21.8 C 13.8 19, 13.3 16, 13.6 13.8 Z" />
            {/* Outline, round at three corners and cut across the fourth */}
            <Line d="M14.2 8.8 C 18 8.4, 22 9.2, 26 8.8 C 29.4 8.6, 31.4 10.8, 31.2 14 C 30.8 17, 31.4 20, 31 23.2 C 28.4 25.8, 25.8 28.4, 23.2 31 C 20 31.4, 17 30.8, 14 31.2 C 10.8 31.4, 8.6 29.2, 8.8 26 C 9.2 22, 8.4 18, 8.8 14 C 8.6 10.8, 10.6 8.6, 14.6 8.7" />
            {/* The corner, curled back over the patch */}
            <Line d="M31 23.2 C 28.4 22.8, 25.6 23.2, 24.2 24.4 C 23 25.8, 22.9 28.4, 23.2 31" w={1.5} />
        </g>
    ),

    // ── The intro's rows ──────────────────────────────────────────────────

    // A syringe, needle down and to the left: a dose being given.
    syringe: (
        <g transform="translate(21.2 18.8) rotate(-40)">
            <path className={WASH} stroke="none" d="M-7.2 -3.3 C -4 -3.6, -1 -3.2, 1.4 -3.4 C 1.1 -1, 1.6 1.4, 1.3 3.4 C -2 3.7, -5 3.2, -7.3 3.5 Z" />
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
            <path className={WASH} stroke="none" d="M10.4 32.6 C 12.4 22, 14.4 12.6, 17.8 12.8 C 21.2 13.2, 22.8 23.4, 26.6 27.4 C 29.2 29.8, 31.8 31, 33.8 31.6 L 33.6 32.8 Z" />
            {/* Axes */}
            <Line d="M8.2 6.4 C 7.8 14, 8.6 24, 8.2 33.8 C 16 33.4, 26 34.2, 35.4 33.6" />
            {/* The curve */}
            <Line d="M9.8 31.2 C 12.2 21, 14.2 10.6, 17.8 10.8 C 21.2 11.2, 22.8 22.4, 26.6 26.4 C 29.2 29, 32 30.4, 34.6 30.8" />
        </>
    ),
    // VialDoodle's tube and stopper, without its drop, brought down to this size.
    vial: (
        <g transform="translate(20 20) scale(0.6) translate(-44.3 -35.6)" strokeWidth={3.2}>
            <path className={WASH} stroke="none" d="M33.4 38.6 C 39 37.6, 46 39.8, 55.2 38.4 C 55.4 44, 55.2 49, 55.2 52 C 55 59.4, 50.4 62.4, 44.4 62.2 C 38.4 62.4, 33.8 59.4, 33.4 52 C 33.2 47, 33.4 42, 33.4 38.6 Z" />
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
            <path className={WASH} stroke="none" d="M10.2 19.8 C 16 19.4, 24 20, 30 19.6 C 30.6 24, 30.2 29, 30.4 32.6 C 24 33.2, 16 32.6, 9.8 33 C 9.4 29, 9.8 24, 9.6 19.8 Z" />
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
            <path className={WASH} stroke="none" d="M11.4 30.6 C 6.4 30.8, 5.6 24, 10.6 22.4 C 9.6 16.4, 16.4 13.4, 19.8 17 C 21.8 11.8, 30.4 12.8, 30 19.6 C 35 19.4, 36.2 28, 31 30.4 C 25 30.8, 17 30.4, 11.4 30.6 Z" />
            <Line d="M11.8 30.7 C 6.4 30.8, 5.6 24, 10.6 22.4 C 9.6 16.4, 16.4 13.4, 19.8 17 C 21.8 11.8, 30.4 12.8, 30 19.6 C 35 19.4, 36.2 28, 31 30.4 C 25 30.8, 17 30.4, 11.2 30.6" />
        </>
    ),
    // A warning sign: a triangle round an exclamation mark.
    caution: (
        <>
            <path className={WASH} stroke="none" d="M20 8.6 C 24 15, 28.4 22.6, 33 30.4 C 24.4 30.8, 15.6 30.2, 7 30.6 C 11.4 23, 15.8 15.6, 20 8.6 Z" />
            <Line d="M20 8.6 C 24 15, 28.4 22.6, 33 30.4 C 24.4 30.8, 15.6 30.2, 7 30.6 C 11.4 23, 15.8 15.6, 19.7 8.2" />
            <Line d="M20 15.6 C 19.8 18, 20.2 21, 20 23.2" w={2} />
            <Line d="M20 26.6 L 20.1 26.8" w={2.6} />
        </>
    ),
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
        className={`shrink-0 text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] ${asleep ? 'dd-asleep' : ''} ${className}`}
    >
        {DRAWINGS[name]}
    </svg>
);

export default Doodle;
