import React from 'react';
import { ChevronRight } from 'lucide-react';

const muted = 'text-[var(--text-muted)]';
const on = 'text-[var(--text)]';

export const settingsMuted = muted;
export const settingsOn = on;

/**
 * Wraps a run of rows. Rows are divided by a hairline between each pair, never
 * above the first or below the last, so a section that ends on a conditional
 * row (or one hidden at this breakpoint) still closes cleanly. Rows carry no
 * border of their own; a row with a leading icon insets its rule to where its
 * text starts (.settings-section in index.css).
 */
export const settingsSection = 'settings-section';

/**
 * A clickable row bleeds 12px into the gutter on each side so its hover fill
 * has room around the content, and tells the section divider to follow.
 */
export const rowBleed = '-mx-3 w-[calc(100%+1.5rem)] px-3 rounded-[var(--radius-md)] hover:bg-[var(--surface-hover)]';
export const rowBleedStyle = { '--row-bleed': '0.75rem' } as React.CSSProperties;

// Accepts lucide icons as well as custom icon components with the same props.
export type SettingsIcon = React.ComponentType<{ size?: number | string; className?: string }>;

export function SettingsIconBox({ icon: Icon }: { icon: SettingsIcon }) {
    return <Icon size={20} className={`${muted} shrink-0`} />;
}

interface SettingsListItemProps {
    /** A component to draw at 20px in the muted colour, or an element drawn as given. */
    icon: SettingsIcon | React.ReactElement;
    title: string;
    description?: React.ReactNode;
    trailing?: React.ReactNode;
    onClick?: () => void;
    showChevron?: boolean;
    /** Deletes something for good: icon and title in red. */
    danger?: boolean;
    disabled?: boolean;
    className?: string;
}

const danger = 'text-[var(--danger)]';

export const SettingsListItem: React.FC<SettingsListItemProps> = ({
    icon: Icon,
    title,
    description,
    trailing,
    onClick,
    showChevron = true,
    danger: isDanger = false,
    disabled = false,
    className = '',
}) => {
    const Tag = onClick ? 'button' : 'div';
    // The rule above this row starts after the 20px icon and its 12px gap.
    const style = { '--divider-inset': '2rem', ...(onClick ? rowBleedStyle : null) } as React.CSSProperties;
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            disabled={onClick ? disabled : undefined}
            style={style}
            className={`w-full min-h-14 flex items-center gap-3 py-3.5 text-start disabled:opacity-45 disabled:cursor-not-allowed ${onClick ? `${rowBleed} disabled:hover:bg-transparent` : ''} ${className}`}
        >
            {React.isValidElement(Icon)
                ? Icon
                : <Icon size={20} className={`${isDanger ? danger : muted} shrink-0`} />}
            <div className="flex-1 min-w-0 text-start">
                <p className={`text-sm font-medium ${isDanger ? danger : on}`}>{title}</p>
                {description && <div className={`text-xs ${muted} mt-0.5`}>{description}</div>}
            </div>
            {trailing}
            {showChevron && onClick && <ChevronRight size={18} className={`${muted} shrink-0 opacity-70 rtl:-scale-x-100`} />}
        </Tag>
    );
};

export function maskIpAddress(ip: string | null | undefined): string {
    if (!ip) return '—';
    const trimmed = ip.trim();
    if (!trimmed) return '—';

    const v4 = trimmed.split('.');
    if (v4.length === 4 && v4.every(p => /^\d{1,3}$/.test(p))) {
        return `${v4[0]}.${v4[1]}.•••.•••`;
    }

    if (trimmed.includes(':')) {
        const head = trimmed.split(':').filter(Boolean)[0] ?? '';
        return head ? `${head}:••••:••••:••••` : '••••:••••:••••:••••';
    }

    return '•••.•••.•••.•••';
}
