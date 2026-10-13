import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from './LanguageContext';
import { isSteppingBack } from '../hooks/navHistory';

type DialogType = 'alert' | 'confirm';

interface DialogOptions {
    /** The action deletes, clears, revokes or overwrites something: the confirm
     *  button turns red and Cancel takes the initial focus, so a stray Enter
     *  backs out instead of going through with it. */
    danger?: boolean;
    /** Says what the dialog is about, in place of the generic "Confirm" or
     *  "Alert" heading. */
    title?: string;
    /** Names the action on the confirm button ("Delete", "Import") in place
     *  of "OK", so the button says what pressing it will do. */
    confirmLabel?: string;
    /** Runs when a confirm is backed out of: Cancel, Escape, a tap outside,
     *  or the system Back. */
    onCancel?: () => void;
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
    const [title, setTitle] = useState<string | undefined>(undefined);
    const [confirmLabel, setConfirmLabel] = useState<string | undefined>(undefined);
    const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null);
    const [onCancel, setOnCancel] = useState<(() => void) | null>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const okRef = useRef<HTMLButtonElement>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    // Set when the dialog opens while the app's own step back is still on its
    // way ("Done" right after a page closes): that popstate is the page
    // closing, not the person pressing Back, so it leaves the dialog be.
    const ownStepPendingRef = useRef(false);

    const showDialog = useCallback((type: DialogType, message: string, onConfirm?: () => void, options?: DialogOptions) => {
        if (document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement;
        ownStepPendingRef.current = isSteppingBack();
        setType(type);
        setMessage(message);
        setDanger(!!options?.danger);
        setTitle(options?.title);
        setConfirmLabel(options?.confirmLabel);
        setOnConfirm(() => onConfirm || null);
        setOnCancel(() => options?.onCancel || null);
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

    const cancel = useCallback(() => {
        close();
        if (onCancel) onCancel();
    }, [onCancel, close]);

    // An alert has nothing to back out of, so dismissing it is the same as OK.
    const dismiss = type === 'confirm' ? cancel : handleConfirm;

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

    // The system Back moves the page underneath (each level is a history
    // entry), and a dialog left open over a different page would act on
    // something no longer in view. So Back backs out of the dialog too, the
    // same as Cancel.
    useEffect(() => {
        if (!isOpen) return;
        const onPop = () => {
            if (ownStepPendingRef.current) {
                ownStepPendingRef.current = false;
                return;
            }
            dismiss();
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
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
                                {title ?? (type === 'confirm' ? t('dialog.confirm_title') : t('dialog.alert_title'))}
                            </h3>
                            <p id="app-dialog-message" className="text-sm text-muted mb-5 leading-relaxed whitespace-pre-line">{message}</p>
                            <div className="flex gap-2">
                                {type === 'confirm' && (
                                    <button ref={cancelRef} onClick={cancel} className="btn-secondary flex-1">
                                        {t('btn.cancel')}
                                    </button>
                                )}
                                <button ref={okRef} onClick={handleConfirm} className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1`}>
                                    {confirmLabel ?? t('btn.ok')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
};
