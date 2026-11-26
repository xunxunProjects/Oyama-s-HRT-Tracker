import React from 'react';
import { FILL, REGULAR } from './phosphor';

export type GlyphName = keyof typeof REGULAR;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref' | 'name'> {
    /** Width and height in px. */
    size?: number | string;
    /** Kept for the callers that set a pen; the icons are drawn filled, so it
     *  only weighs the tick (the one icon drawn as a stroke). */
    strokeWidth?: number | string;
    /** `fill` for the solid version, where there is one (the tab bar's). */
    weight?: 'regular' | 'fill';
    /** What the icon means, when nothing beside it says so. Without one the
     *  icon is hidden from screen readers, as decoration next to its words. */
    label?: string;
}

export type IconComponent = React.FC<IconProps>;

// The tick, as Phosphor draws its check, but as a stroke, so it can be
// written on (.tick-draw): 16 units of 256 is Phosphor's regular line.
const CHECK = 'M40,144l56,56L216,80';

/**
 * One icon from the set (Phosphor Icons, in phosphor.ts), in the colour of the
 * text around it. Every icon carries `ink-icon`, which scales it with
 * --ui-scale like the type beside it and lets the motion rules find it.
 */
export const Icon: React.FC<IconProps & { name: GlyphName }> = ({
    name,
    size = 24,
    strokeWidth = 1.75,
    weight = 'regular',
    label,
    className,
    ...rest
}) => {
    const common = {
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 256 256',
        role: label ? 'img' : undefined,
        'aria-label': label,
        'aria-hidden': label ? undefined : true,
        focusable: 'false' as const,
        className: className ? `ink-icon ${className}` : 'ink-icon',
    };
    if (name === 'check') {
        return (
            <svg
                {...common}
                fill="none"
                stroke="currentColor"
                strokeWidth={16 * ((Number(strokeWidth) || 1.75) / 1.75)}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...rest}
            >
                <path d={CHECK} pathLength={1} />
            </svg>
        );
    }
    const d = (weight === 'fill' && FILL[name]) || REGULAR[name];
    return (
        <svg {...common} fill="currentColor" {...rest}>
            <path d={d} />
        </svg>
    );
};

export default Icon;
