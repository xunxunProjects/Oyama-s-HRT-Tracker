import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from './LanguageContext';

type DialogType = 'alert' | 'confirm';

interface DialogOptions {
    /** The action deletes, clears, revokes or overwrites something: the confirm
     *  button turns red and Cancel takes the initial focus, so a stray Enter
     *  backs out instead of going through with it. */
    danger?: boolean;
}

export type ShowDialog = (type: DialogType, message: string, onConfirm?: () => void, options?: DialogOptions) => void;

interface DialogContextType {
    showDialog: ShowDialog;
}

const DialogContext = createContext<DialogContextType | null>(null);

export const useDialog = () => {
    const ctx = useContext(DialogContext);
    if (!ctx) throw new Error("useDialog must be used within DialogProvider");
    return ctx;
};

/**
 * Every alert and confirm in the app goes through here, so they all look,
 * move and answer the keyboard the same way: Escape or a tap outside backs
 * out, focus moves into the dialog on open and returns to where it was on
 * close, and a destructive confirm is marked as one.
 */
export const DialogProvider = ({ children }: { children: React.ReactNode }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [type, setType] = useState<DialogType>('alert');
    const [message, setMessage] = useState("");
    const [danger, setDanger] = useState(false);
    const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const okRef = useRef<HTMLButtonElement>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);

    const showDialog = useCallback((type: DialogType, message: string, onConfirm?: () => void, options?: DialogOptions) => {
        if (document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement;
        setType(type);
        setMessage(message);
        setDanger(!!options?.danger);
        setOnConfirm(() => onConfirm || null);
        setIsOpen(true);
    }, []);

    // Stable reference so opening/closing the dialog doesn't re-render every
    // consumer of useDialog() across the app (showDialog itself never changes).
    const contextValue = useMemo(() => ({ showDialog }), [showDialog]);

    const close = useCallback(() => {
        setIsOpen(false);
        returnFocusRef.current?.focus?.();
        returnFocusRef.current = null;
    }, []);

    // Close first, then run the action: an action that opens a follow-up
    // dialog ("Deleted." after "Delete this?") would otherwise be shut by the
    // close that came after it.
    const handleConfirm = useCallback(() => {
        close();
        if (onConfirm) onConfirm();
    }, [onConfirm, close]);

    // An alert has nothing to back out of, so dismissing it is the same as OK.
    const dismiss = type === 'confirm' ? close : handleConfirm;

    useEffect(() => {
        if (!isOpen) return;
        (type === 'confirm' && danger ? cancelRef : okRef).current?.focus();
    }, [isOpen, type, danger, message]);

    // Capture phase, and stopped there: the dialog can open over a modal that
    // closes on Escape too (the dose form), and one press should only take
    // down the thing on top.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            dismiss();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [isOpen, dismiss]);

    return (
        <DialogContext.Provider value={contextValue}>
            {children}
            {isOpen && (
                <div className="modal-overlay z-[100]" onClick={dismiss}>
                    <div className="modal-shell" onClick={e => e.stopPropagation()}>
                        <div
                            className="modal-card"
                            role={type === 'confirm' ? 'alertdialog' : 'dialog'}
                            aria-modal="true"
                            aria-labelledby="app-dialog-title"
                            aria-describedby="app-dialog-message"
                        >
                            <h3 id="app-dialog-title" className="modal-title">
                                {type === 'confirm' ? t('dialog.confirm_title') : t('dialog.alert_title')}
                            </h3>
                            <p id="app-dialog-message" className="text-sm text-muted mb-5 leading-relaxed whitespace-pre-line">{message}</p>
                            <div className="flex gap-2">
                                {type === 'confirm' && (
                                    <button ref={cancelRef} onClick={close} className="btn-secondary flex-1">
                                        {t('btn.cancel')}
                                    </button>
                                )}
                                <button ref={okRef} onClick={handleConfirm} className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1`}>
                                    {t('btn.ok')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
};
