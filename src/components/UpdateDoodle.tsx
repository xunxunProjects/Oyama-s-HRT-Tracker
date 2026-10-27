import React from 'react';

/**
 * A cat climbing out of a parcel: the new version has arrived. Drawn in
 * Doodle's hand (one line colour, one flat wash, paths a little off true,
 * outlines that overshoot where they close), on the same 40 by 40 grid so it
 * sits at the head of a line the same way the other small drawings do.
 *
 * The head is drawn first and the box front over it, so the wash hides
 * whatever of the cat is still inside. On arrival the cat peeks up out of the
 * box once; when `leaping` is set (the user tapped refresh) it hops out. No
 * marks fly off it and it doesn't blink on a loop: the cat is the news.
 */
const UpdateDoodle: React.FC<{ size?: number; leaping?: boolean }> = ({ size = 2.25, leaping = false }) => (
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
        className="shrink-0 overflow-visible text-[var(--illustration-line)]"
    >
        <g className={leaping ? 'ud-leap' : 'ud-peek'}>
            <g transform="translate(0 -1.6)">
                {/* Head and ears, rising out of the box */}
                <path d="M13.6 23 C 13.4 19.4, 14.2 15.6, 15.8 12.8 C 17 14.4, 18.2 15.6, 20 15.8 C 21.8 15.6, 23 14.4, 24.4 12.6 C 25.8 15.6, 26.6 19.4, 26.4 23.2" />
                {/* Eyes */}
                <path d="M17.6 19.2 L 17.7 19.6" strokeWidth={2.4} />
                <path d="M22.4 19.2 L 22.5 19.6" strokeWidth={2.4} />
            </g>
        </g>

        {/* Box front, washed, over the cat */}
        <path
            className="fill-[var(--illustration-wash)]"
            stroke="none"
            d="M9.4 21.4 C 16 21, 24 21.6, 30.6 21.2 C 31 25.6, 30.6 30.4, 30.8 34.2 C 24 34.6, 16 34, 9.2 34.4 C 8.8 30.4, 9.2 25.6, 9.4 21.4 Z"
        />
        <path d="M9.4 21.4 C 16 21, 24 21.6, 30.6 21.2 C 31 25.6, 30.6 30.4, 30.8 34.2 C 24 34.6, 16 34, 9.2 34.4 C 8.8 30.4, 9.2 25.6, 9.4 21.1" />
        {/* Flaps, pushed open */}
        <path d="M9.4 21.4 C 7.6 19.8, 5.8 18.4, 3.8 16.6" />
        <path d="M30.6 21.2 C 32.6 19.4, 34.4 18.2, 36.4 16.2" />
        {/* Tape down the front */}
        <path d="M20 21.6 C 19.8 23.6, 20.2 25.4, 20 27.2" strokeWidth={1.5} />
    </svg>
);

export default UpdateDoodle;
