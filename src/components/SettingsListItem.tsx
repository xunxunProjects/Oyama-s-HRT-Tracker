import React from 'react';
import { ChevronRight } from 'lucide-react';

const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';
const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
const divider = 'border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]';

export const settingsMuted = muted;
export const settingsOn = on;

// Accepts lucide icons as well as custom icon components with the same props.
export type SettingsIcon = React.ComponentType<{ size?: number | string; className?: string }>;

export function SettingsIconBox({ icon: Icon }: { icon: SettingsIcon }) {
    return <Icon size={18} className={`${muted} shrink-0`} />;
}

interface SettingsListItemProps {
    icon: SettingsIcon;
    title: string;
    description?: string;
    trailing?: React.ReactNode;
    onClick?: () => void;
    showChevron?: boolean;
    className?: string;
}

export const SettingsListItem: React.FC<SettingsListItemProps> = ({
    icon: Icon,
    title,
    description,
    trailing,
    onClick,
    showChevron = true,
    className = '',
}) => {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`w-full flex items-center gap-3 py-4 ${divider} text-start ${className}`}
        >
            <Icon size={18} className={`${muted} shrink-0`} />
            <div className="flex-1 min-w-0 text-start">
                <p className={`text-sm font-medium ${on}`}>{title}</p>
                {description && <p className={`text-xs ${muted} mt-0.5 leading-relaxed`}>{description}</p>}
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
