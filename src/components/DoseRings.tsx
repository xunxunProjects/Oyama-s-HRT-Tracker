import React from 'react';

/**
 * Progress, in the chart's own vocabulary: the same hollow dose ring
 * OnboardingCurve draws, each one standing alone. Filled behind you, hollow
 * ahead — so the mark has already been read once by the time the chart uses it
 * for real. Shared by the intro and the plan's questions, which sit on the same
 * ground colour the hollow rings are filled with.
 */
const DoseRings: React.FC<{ count: number; at: number }> = ({ count, at }) => {
    const GAP = 15, PAD = 7, MID = 9;
    const width = PAD * 2 + GAP * (count - 1);
    return (
        <svg
            viewBox={`0 0 ${width} 18`}
            width={width}
            height={18}
            aria-hidden="true"
            focusable="false"
            className="text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]"
        >
            {Array.from({ length: count }, (_, i) => (
                <circle
                    key={i}
                    className={`onb-ring ${i <= at
                        ? 'fill-current stroke-current'
                        : 'fill-[var(--color-m3-surface-dim)] stroke-[var(--color-m3-outline-variant)] dark:fill-[var(--color-m3-dark-surface)] dark:stroke-[var(--color-m3-dark-outline-variant)]'}`}
                    cx={PAD + i * GAP}
                    cy={MID}
                    r={i === at ? 4.2 : 3}
                    strokeWidth={1.5}
                />
            ))}
        </svg>
    );
};

export default DoseRings;
