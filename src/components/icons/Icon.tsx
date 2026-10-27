import React from 'react';
import { GLYPHS, type GlyphName, type Stroke } from './glyphs';

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref' | 'name'> {
    /** Width and height in px. The glyphs are drawn on a 24px grid. */
    size?: number | string;
    /** The pen: 1.75 at rest, 2 for the current or chosen thing. */
    strokeWidth?: number | string;
    /** What the icon means, when nothing beside it says so. Without one the
     *  icon is hidden from screen readers, as decoration next to its words. */
    label?: string;
}

export type IconComponent = React.FC<IconProps>;

/**
 * One hand-drawn glyph (see glyphs.ts), in the colour of the text around it.
 * Every icon carries `ink-icon`, which scales it with --ui-scale like the type
 * beside it and lets the motion rules find it (index.css, motion.css).
 */
export const Icon: React.FC<IconProps & { name: GlyphName }> = ({
    name,
    size = 24,
    strokeWidth = 1.75,
    label,
    className,
    ...rest
}) => {
    // A point needs a heavier pen than a line to read as the same ink.
    const dotWidth = (Number(strokeWidth) || 1.75) * 1.5;
    const thinWidth = (Number(strokeWidth) || 1.75) * 0.6;
    return (
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
            role={label ? 'img' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
            focusable="false"
            className={className ? `ink-icon ${className}` : 'ink-icon'}
            {...rest}
        >
            {/* pathLength 1 on every stroke, so one dash pattern can draw any
                of them on, whatever its length (.tick-draw, .ink-draw). */}
            {(GLYPHS[name] as readonly Stroke[]).map((stroke, i) =>
                typeof stroke === 'string' ? (
                    <path key={i} d={stroke} pathLength={1} />
                ) : (
                    <path
                        key={i}
                        d={stroke.d}
                        pathLength={1}
                        strokeWidth={stroke.dot ? dotWidth : stroke.thin ? thinWidth : undefined}
                        stroke={stroke.tint ? 'none' : undefined}
                        fill={stroke.fill || stroke.tint ? 'currentColor' : undefined}
                        fillOpacity={stroke.tint ? 0.28 : undefined}
                    />
                ),
            )}
        </svg>
    );
};

export default Icon;
