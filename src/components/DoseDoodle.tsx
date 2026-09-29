import React from 'react';

/**
 * A capsule drawn by hand, for the empty Overview. One colour of line on the
 * page, one flat wash on half the capsule, nothing else: no gradient, no
 * shadow. The paths are deliberately a little unsteady, and the outline
 * overshoots where it closes, the way a pen line does when the hand comes back
 * round to where it started.
 *
 * Sized by the caller in rem (the SVG has no width of its own), so it scales
 * with the rest of the page rather than staying a fixed number of pixels.
 */
const DoseDoodle: React.FC<{ className?: string }> = ({ className = '' }) => (
    <svg
        viewBox="0 0 96 72"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] ${className}`}
    >
        <g transform="rotate(-28 48 38)">
            {/* Colour on the left half only, laid in a hair inside the line. */}
            <path
                d="M34.6 27.2 C 29 26.6, 23.6 30.6, 23 37.6 C 22.6 43.4, 27 47, 34 46.6 C 39 46.4, 43.6 46.8, 46 46.4 C 46.8 40, 45.6 33.4, 46.2 27.6 C 42 27.4, 38.4 27.6, 34.6 27.2 Z"
                className="fill-[var(--color-m3-primary-container)] dark:fill-[var(--color-m3-dark-primary-container)]"
                stroke="none"
            />
            {/* Outline */}
            <path d="M34 25.6 C 47 24.4, 62 26, 65 25.2 C 73.4 24.4, 78.8 30.6, 78 37.6 C 77.2 45, 71.6 50, 64.6 49.2 C 52.6 50.4, 40.4 48.8, 32.8 49.6 C 24.6 50.2, 19.4 44.4, 19.8 37.2 C 20.2 30, 26 25.4, 35.2 25.5" />
            {/* Seam */}
            <path d="M47 25.6 C 45.8 31.4, 48.2 43, 46.6 49.4" />
            {/* A stroke of shine on the right half */}
            <path d="M56 31.4 C 60 30.6, 64 31, 67.4 30.4" strokeWidth={1.8} />
        </g>
        {/* Sparks */}
        <path d="M74 14.6 L 77 8.6" />
        <path d="M82.6 21.2 L 88.4 18.4" />
        <path d="M65.4 10.2 L 66.6 4.6" />
        {/* The ground it sits on */}
        <path d="M14 65.4 C 28 63.8, 40 66.6, 54 64.8 S 74 65.6, 83 64.2" strokeWidth={1.8} />
    </svg>
);

export default DoseDoodle;
