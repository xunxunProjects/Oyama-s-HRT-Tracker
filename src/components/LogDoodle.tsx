import React from 'react';

/**
 * A logbook and a pencil, for the empty dose history. Drawn in the same hand as
 * DoseDoodle: one line colour, one flat wash, paths a little off true, and the
 * outlines overshoot where they close. See DoseDoodle for the rules.
 */
const LogDoodle: React.FC<{ className?: string }> = ({ className = '' }) => (
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
        <g transform="rotate(-4 36 34)">
            {/* The cloth spine, colour laid in just inside the line. */}
            <path
                d="M19.6 11.6 C 22.4 11.2, 26 11.4, 29 11 C 28.4 24, 29.6 42, 28.8 55.4 C 26 55.8, 22.6 55.6, 19.8 56 C 19.2 42, 20.2 24, 19.6 11.6 Z"
                className="fill-[var(--color-m3-primary-container)] dark:fill-[var(--color-m3-dark-primary-container)]"
                stroke="none"
            />
            {/* Cover */}
            <path d="M18.6 9.8 C 31 9, 45 10.4, 55.6 9.6 C 56.8 22, 55.6 40, 56.6 57.2 C 44 58, 31 56.6, 19.2 57.4 C 18 42, 19.4 24, 18.4 11.2" />
            {/* Spine seam */}
            <path d="M29 10 C 28.2 24, 29.8 42, 28.8 56.6" />
            {/* Ruled lines, the last one not finished */}
            <path d="M35.6 22 C 41 21.4, 47 22.4, 51.6 21.6" strokeWidth={1.8} />
            <path d="M35.6 31.4 C 41.4 30.8, 47.6 31.8, 51.6 31" strokeWidth={1.8} />
            <path d="M35.6 40.8 C 39.4 40.4, 43 41, 46 40.5" strokeWidth={1.8} />
        </g>
        {/* Pencil, tip down and to the left, eraser end up to the right. */}
        <g transform="translate(74 38) rotate(-58)">
            <path
                d="M10.6 -3.7 C 14 -4.2, 18.6 -3.4, 20.6 -2.6 C 22 -1.6, 22 1.6, 20.6 2.6 C 18.4 3.4, 14 4, 10.8 3.7 Z"
                className="fill-[var(--color-m3-primary-container)] dark:fill-[var(--color-m3-dark-primary-container)]"
                stroke="none"
            />
            {/* Body */}
            <path d="M-12 -3.6 C -4 -4.2, 8 -3.4, 16 -3.8 C 18.6 -4.2, 21.4 -2.8, 21.2 0 C 21.4 2.8, 19 4, 16.4 3.6 C 8 4, -4 3.2, -12 3.8" />
            {/* Sharpened tip */}
            <path d="M-12 -3.6 C -15.6 -2, -18.4 -0.6, -21.4 0.2 C -18.4 1.4, -15.6 2.8, -12 3.8" />
            {/* Where the metal band meets the eraser */}
            <path d="M10.6 -3.7 C 11.4 -1, 10.4 1.4, 10.8 3.7" />
        </g>
        {/* The ground it lies on */}
        <path d="M12 66 C 26 64.4, 40 67.2, 54 65.4 S 74 66.2, 86 64.8" strokeWidth={1.8} />
    </svg>
);

export default LogDoodle;
