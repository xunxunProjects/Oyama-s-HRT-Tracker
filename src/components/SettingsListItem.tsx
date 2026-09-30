import React from 'react';
import { ChevronRight } from 'lucide-react';

const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';
const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';

export const settingsMuted = muted;
export const settingsOn = on;

/**
 * Wraps a run of rows. Rows are divided by a rule between each pair, never
 * above the first or below the last, and the rule sits flush with the column
 * edges, so a section that ends on a conditional row (or one hidden at this
 * breakpoint) still closes cleanly. Rows themselves carry no border.
 */
export const settingsSection = '[&>*+*]:border-t [&>*+*]:border-[var(--color-m3-outline-variant)] dark:[&>*+*]:border-[var(--color-m3-dark-outline-variant)]';

// Accepts lucide icons as well as custom icon components with the same props.
export type SettingsIcon = React.ComponentType<{ size?: number | string; className?: string }>;

export function SettingsIconBox({ icon: Icon }: { icon: SettingsIcon }) {
    return <Icon size={18} className={`${muted} shrink-0`} />;
}

interface SettingsListItemProps {
    /** A component to draw at 18px in the muted colour, or an element drawn as given. */
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

const danger = 'text-red-600 dark:text-red-400';

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
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            disabled={onClick ? disabled : undefined}
            className={`w-full flex items-center gap-3 py-4 text-start disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        >
            {React.isValidElement(Icon)
                ? Icon
                : <Icon size={18} className={`${isDanger ? danger : muted} shrink-0`} />}
            <div className="flex-1 min-w-0 text-start">
                <p className={`text-sm font-medium ${isDanger ? danger : on}`}>{title}</p>
                {description && <div className={`text-xs ${muted} mt-0.5 leading-relaxed`}>{description}</div>}
            </div>
            {trailing}
            {showChevron && onClick && <ChevronRight size={16} className={`${muted} shrink-0`} />}
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
