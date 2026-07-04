import React from 'react';

interface ShieldIconProps {
    size?: number | string;
    className?: string;
    strokeWidth?: number | string;
}

// Custom 2FA shield: soft rounded silhouette with a light fill and a check,
// drawn to sit visually closer to the app's M3 style than the stock lucide
// Shield. Accepts LucideIcon-style props so it can drop into SettingsIconBox.
const ShieldIcon: React.FC<ShieldIconProps> = ({ size = 24, className, strokeWidth = 1.5 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
    >
        <path
            d="M12 2.75c.22 0 .44.05.64.14l6.3 2.72c.66.28 1.1.94 1.08 1.66-.08 3.1-.55 5.5-1.64 7.5-1.1 2.02-2.8 3.6-5.34 4.98a2.28 2.28 0 0 1-2.08 0c-2.54-1.38-4.24-2.96-5.34-4.98-1.09-2-1.56-4.4-1.64-7.5a1.78 1.78 0 0 1 1.08-1.66l6.3-2.72c.2-.09.42-.14.64-.14Z"
            fill="currentColor"
            fillOpacity="0.14"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
        />
        <path
            d="m9.1 12.1 2 2 3.8-4.1"
            stroke="currentColor"
            strokeWidth={(Number(strokeWidth) || 1.5) + 0.25}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

export default ShieldIcon;
