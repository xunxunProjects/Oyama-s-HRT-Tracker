import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SafetyAlert } from '../../logic';
import { Close } from './icons';

export default function SafetyAlertModal({
    alert,
    t,
    onClose,
    onOpenSettings,
}: {
    alert: SafetyAlert;
    t: (k: string) => string;
    onClose: () => void;
    onOpenSettings: () => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            if (!focusable || focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus();
        };
    }, []);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            onClick={() => onCloseRef.current()}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="safety-alert-title"
                className="glass relative max-h-[90vh] w-full max-w-[var(--modal-width)] overflow-y-auto rounded-2xl p-5 pt-12 shadow-xl"
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    ref={closeRef}
                    type="button"
                    className="tap-target absolute end-1 top-1 flex items-center justify-center rounded-full text-[var(--text-muted)]"
                    aria-label={t('safety.modal.close')}
                    onClick={onClose}
                >
                    <Close size={16} strokeWidth={1.75} />
                </button>

                <h2 id="safety-alert-title" className="text-lg font-semibold">
                    {alert.kind === 'cumulative_dose'
                        ? t('safety.modal.title_cumulative')
                        : t('safety.modal.title_extreme')}
                </h2>
                <p className="mt-3 text-sm text-[var(--text-muted)]">{t('safety.modal.body')}</p>

                <button
                    type="button"
                    className="mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-medium text-[var(--accent-ink)]"
                    onClick={onClose}
                >
                    {t('safety.modal.close')}
                </button>
                <button
                    type="button"
                    className="mt-3 w-full text-center text-xs text-[var(--text-muted)] underline"
                    onClick={onOpenSettings}
                >
                    {t('safety.modal.disable_hint')}
                </button>
            </div>
        </div>,
        document.body,
    );
}
