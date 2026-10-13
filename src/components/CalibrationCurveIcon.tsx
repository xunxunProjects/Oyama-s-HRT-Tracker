import React from 'react';

interface CalibrationCurveIconProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
    strokeWidth?: number | string;
}

/**
 * Calibration icon: a solid model curve and a dashed (calibrated) curve,
 * with an × cross marker beside the dashed curve representing a measured
 * lab data point. Drawn in the lucide style (24×24, currentColor, round
 * caps) so it sits seamlessly among the other nav icons.
 *
 * A caller's className is added to `lucide`, not put in its place: that class
 * is what scales every icon with --ui-scale, and the sidebar passing its own
 * classes left this one 2px smaller than its neighbours and its label out of
 * line with theirs.
 */
const CalibrationCurveIcon: React.FC<CalibrationCurveIconProps> = ({
    size = 24,
    strokeWidth = 2,
    className,
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
        className={className ? `lucide ${className}` : 'lucide'}
        {...props}
    >
        {/* Solid model curve — starts high, bends down through the dashed curve */}
        <path d="M3 13 C 7 13 9 5 13 5 S 17 21 21 21" />
        {/* Dashed calibrated curve */}
        <path d="M3 18 C 7 18 9 12 13 12 S 17 16 21 14" strokeDasharray="3 2.5" />
        {/* × cross marker beside the dashed curve */}
        <path d="M14.5 17 l3 3 M17.5 17 l-3 3" />
    </svg>
);

export default CalibrationCurveIcon;
