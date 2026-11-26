import { Alert } from './icons';
import { highestSeverity, type SafetyAlert } from '../../logic';

export default function SafetyAlertNotice({
    alerts,
    t,
    onOpenSettings,
}: {
    alerts: SafetyAlert[];
    t: (k: string) => string;
    onOpenSettings: () => void;
}) {
    const severity = highestSeverity(alerts);
    if (!severity) return null;
    return (
        <p className="flex items-start gap-2 text-sm">
            <span className="icon-line">
                <Alert size={16} strokeWidth={1.75} className="text-[var(--warning)]" />
            </span>
            <span className="min-w-0">
                <span className="font-medium text-[var(--warning)]">{t(`safety.notice.${severity}`)}</span>{' '}
                <button type="button" className="underline" onClick={onOpenSettings}>
                    {t('safety.notice.settings')}
                </button>
            </span>
        </p>
    );
}
