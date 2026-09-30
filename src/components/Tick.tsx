import React from 'react';
import { Check, Copy } from 'lucide-react';

const PRIMARY = 'text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]';

/**
 * The one tick in the app. It stays mounted and is drawn on when `on` turns
 * true and rubbed out again when it turns false (see .tick-draw), so choosing
 * another row reads as the old mark being erased while the new one is
 * written. Nothing animates on first render: a row that mounts already chosen
 * just shows its tick.
 *
 * `tone="current"` takes the colour of the surrounding text, for ticks that
 * stand in for another icon (Copy) or sit on a filled mark (a checkbox).
 */
const Tick: React.FC<{
    on: boolean;
    size?: number;
    strokeWidth?: number;
    tone?: 'primary' | 'current';
    className?: string;
}> = ({ on, size = 16, strokeWidth = 2, tone = 'primary', className = '' }) => (
    <Check
        size={size}
        strokeWidth={strokeWidth}
        aria-hidden="true"
        data-on={on}
        className={`tick-draw shrink-0 ${tone === 'primary' ? PRIMARY : ''} ${className}`}
    />
);

/**
 * The Copy glyph, which turns into a tick for as long as `copied` is true. The
 * two share one box so nothing beside them shifts: Copy fades out while the
 * tick draws on in its place, and the reverse when the moment passes.
 */
export const CopyTick: React.FC<{ copied: boolean; size?: number; strokeWidth?: number; className?: string }> = ({
    copied, size = 14, strokeWidth = 2, className = '',
}) => (
    <span className={`inline-grid shrink-0 place-items-center ${className}`} aria-hidden="true">
        <Copy
            size={size}
            strokeWidth={strokeWidth}
            data-hidden={copied}
            className="copy-glyph col-start-1 row-start-1"
        />
        <Tick on={copied} size={size} strokeWidth={strokeWidth} tone="current" className="col-start-1 row-start-1" />
    </span>
);

export default Tick;
