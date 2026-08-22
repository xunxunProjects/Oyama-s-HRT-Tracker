import React from 'react';

interface LevelCurveIconProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
    strokeWidth?: number | string;
}

/**
 * A single smooth blood-level curve on a pair of axes: one dose absorbing to a
 * peak, then a longer decay back toward baseline. The decay is deliberately the
 * longer half — a symmetric hill reads as a bump, not as a drug clearing.
 *
 * Sibling of CalibrationCurveIcon, and drawn to the same rules (24×24,
 * currentColor, round caps) so the two sit together. The axes are lucide's own
 * L (`M3 3v18h18`), which is what keeps this reading as a chart next to the
 * stock icons rather than as a loose squiggle.
 */
const LevelCurveIcon: React.FC<LevelCurveIconProps> = ({
    size = 24,
    strokeWidth = 2,
    ...props
}) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="lucide"
        {...props}
    >
        {/* Axes */}
        <path d="M3 3v18h18" />
        {/* Curve, held clear of both axes so it reads as plotted inside them
            rather than growing out of the corner. Both ends leave horizontally
            and the S reflects the peak's control point, so the tangent at the
            top is flat — that is what makes it a maximum rather than a corner
            rounded off. */}
        <path d="M6 17.5 C 8 17.5 9 8 11.5 8 S 16 13.5 20 14" />
    </svg>
);

export default LevelCurveIcon;
