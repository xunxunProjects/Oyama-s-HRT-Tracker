import React from 'react';

/**
 * A sample vial and a drop, for the empty lab results. Drawn in the same hand
 * as DoseDoodle: one line colour, one flat wash, paths a little off true, and
 * the outlines overshoot where they close. See DoseDoodle for the rules.
 */
const VialDoodle: React.FC<{ className?: string }> = ({ className = '' }) => (
    <svg
        viewBox="0 0 96 72"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`text-[var(--illustration-line)] ${className}`}
    >
        {/* What is in the vial, laid in just inside the glass. */}
        <path
            d="M33.4 38.6 C 39 37.6, 46 39.8, 55.2 38.4 C 55.4 44, 55.2 49, 55.2 52 C 55 59.4, 50.4 62.4, 44.4 62.2 C 38.4 62.4, 33.8 59.4, 33.4 52 C 33.2 47, 33.4 42, 33.4 38.6 Z"
            className="fill-[var(--illustration-wash)]"
            stroke="none"
        />
        {/* Glass, open at the top where the stopper goes */}
        <path d="M32 14.4 C 31.6 24, 32.2 40, 32.4 52.4 C 32.8 60, 38 64, 44.4 63.8 C 51 64, 56 60.2, 56.2 52.4 C 56.6 40, 55.8 24, 56.4 14" />
        {/* Rim */}
        <path d="M28.4 14.4 C 36 13.6, 50 14.8, 60 14" />
        {/* Stopper */}
        <path d="M34.2 13.8 C 33.6 9.6, 35 7.2, 37.6 7 C 43 6.6, 49.4 7.6, 51.8 7.2 C 54.6 7.6, 55 10, 54.6 13.8" />
        {/* Level of the sample */}
        <path d="M32.6 38.8 C 38.4 37.8, 45.4 40, 56.2 38.4" strokeWidth={1.8} />
        {/* Graduations up the side */}
        <path d="M32.8 22.4 L 37.6 22.6" strokeWidth={1.8} />
        <path d="M32.6 29.4 L 35.8 29.5" strokeWidth={1.8} />
        {/* A stroke of shine on the glass */}
        <path d="M38.2 47 C 38 50.6, 38.4 54, 39.6 57" strokeWidth={1.8} />

        {/* A drop */}
        <path
            d="M73 25.6 C 71.4 28, 65.8 34.4, 65.8 39.6 C 65.8 43.6, 68.8 46.4, 72.8 46.4 C 76.8 46.4, 79.6 43.6, 79.4 39.4 C 79.2 34.2, 74.6 28.4, 73 25.6 Z"
            className="fill-[var(--illustration-wash)]"
        />
        <path d="M70.4 40.6 C 70.4 42.4, 71.2 43.6, 72.6 44" strokeWidth={1.6} />

        {/* The ground they stand on */}
        <path d="M12 68 C 26 66.4, 40 69.2, 54 67.4 S 74 68.2, 86 66.8" strokeWidth={1.8} />
    </svg>
);

export default VialDoodle;
