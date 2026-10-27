import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useMemo,
    useEffect,
    useLayoutEffect,
    useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from './LanguageContext';
import { isSteppingBack } from '../hooks/navHistory';
import { PAGE_COLUMN } from '../components/PageHeader';

type DialogType = 'alert' | 'confirm';

interface DialogOptions {
    /** The action deletes, clears, revokes or overwrites something: the
     *  button that goes ahead turns red, the way out reads "Keep it" and takes
     *  the focus, so a stray Enter backs out instead of going through. */
    danger?: boolean;
    /** Says what the prompt is about, above the message. */
    title?: string;
    /** Names the action on the button that goes ahead ("Delete", "Import")
     *  in place of "OK", so the button says what pressing it will do. */
    confirmLabel?: string;
    /** Runs when a confirm is backed out of: the way-out button, Escape, the
     *  system Back, or the page it was asked on going away. */
    onCancel?: () => void;
}

export type ShowDialog = (type: DialogType, message: string, onConfirm?: () => void, options?: DialogOptions) => void;

interface DialogContextType {
    showDialog: ShowDialog;
}

const DialogContext = createContext<DialogContextType | null>(null);

export const useDialog = () => {
    const ctx = useContext(DialogContext);
    if (!ctx) throw new Error('useDialog must be used within DialogProvider');
    return ctx;
};

interface Prompt {
    type: DialogType;
    message: string;
    onConfirm: (() => void) | null;
    options: DialogOptions;
    /** Where the line goes: a host put into the page under the pressed row,
     *  or null for the banner at the top of the page. */
    host: HTMLElement | null;
    /** The page the host was put into, to tell a row that went away from a
     *  page that did. */
    view: Element | null;
}

/** What was last pressed, so the prompt it causes can be put under it. Safari
 *  doesn't focus a button that's clicked, so focus alone can't say. */
const lastPress: { el: HTMLElement | null; at: number } = { el: null, at: 0 };
const PRESS_TARGET = 'button, a, summary, label, [role="button"], [role="switch"], [role="tab"], [role="option"]';

// A host remembers the row it was put under, so a prompt raised from inside
// another prompt ("Deleted" after "Delete this?") can go in the same place.
const anchorOf = new WeakMap<HTMLElement, HTMLElement>();

/** Whether a new line can go between this box's children: they stack. */
function stacks(el: HTMLElement): boolean {
    const cs = getComputedStyle(el);
    if (cs.display === 'block' || cs.display === 'flow-root' || cs.display === 'list-item') return true;
    if (cs.display.includes('flex')) return cs.flexDirection.startsWith('column');
    if (cs.display.includes('grid')) return cs.gridTemplateColumns.trim().split(/\s+/).length <= 1;
    return false;
}

/** The row a pressed control sits in: the nearest box, from the control up,
 *  whose parent stacks its children. A row can also name itself with
 *  `data-prompt-anchor` where the shape of the page would mislead this. */
function rowFor(el: HTMLElement): HTMLElement | null {
    const named = el.closest<HTMLElement>('[data-prompt-anchor]');
    if (named) return named;
    let node: HTMLElement = el;
    while (node.parentElement && node.parentElement !== document.body) {
        const parent = node.parentElement;
        if (parent.id === 'root') return null;
        if (stacks(parent)) return node;
        node = parent;
    }
    return null;
}

/** Puts an empty host into the page right after the row, lined up with the
 *  row's content, for the prompt to render into. */
function hostAfter(row: HTMLElement): HTMLElement {
    const host = document.createElement('div');
    host.className = 'inline-prompt-host';
    const parent = row.parentElement!;
    const r = row.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    const rs = getComputedStyle(row);
    const ps = getComputedStyle(parent);
    const start =
        r.left + parseFloat(rs.paddingLeft) - (p.left + parseFloat(ps.paddingLeft) + parseFloat(ps.borderLeftWidth));
    const width = r.width - parseFloat(rs.paddingLeft) - parseFloat(rs.paddingRight);
    if (Math.abs(start) > 0.5) host.style.marginInlineStart = `${start}px`;
    host.style.maxWidth = `${width}px`;
    // insertBefore, not after(): the worker types' Element shadows the DOM one.
    parent.insertBefore(host, row.nextSibling);
    anchorOf.set(host, row);
    return host;
}

function findHost(): HTMLElement | null {
    const pressed =
        lastPress.el?.isConnected && Date.now() - lastPress.at < 15000
            ? lastPress.el
            : document.activeElement instanceof HTMLElement && document.activeElement !== document.body
              ? document.activeElement
              : null;
    if (!pressed) return null;
    // Raised from inside a prompt: under the row that prompt was under.
    const insidePrompt = pressed.closest<HTMLElement>('.inline-prompt-host');
    const row = insidePrompt ? anchorOf.get(insidePrompt) : rowFor(pressed);
    if (!row || !row.isConnected || !row.parentElement) return null;
    return hostAfter(row);
}

/**
 * A place in the page right under what was just pressed, for a line that asks
 * for more than yes or no (a password, a form) to render into with a portal.
 * Null while closed, or when nothing on the page was pressed; the caller then
 * renders in its own place. The host goes when `open` turns false.
 */
export function useInlineHost(open: boolean): HTMLElement | null {
    const [host, setHost] = useState<HTMLElement | null>(null);
    useLayoutEffect(() => {
        if (!open) return;
        const made = findHost();
        setHost(made);
        return () => {
            made?.remove();
            setHost(null);
        };
    }, [open]);
    return host;
}

/**
 * Every alert and confirm in the app goes through here, and none of them is a
 * pop-up. The question is put into the page as a line right under the row
 * that was pressed ("Delete this dose? Keep it / Delete"), and the rest of
 * the page stays as it was. Asked with nothing on the page to put it under (a
 * sync that finished on its own), it floats at the top of the page instead.
 * Escape, the system Back, or the page going away backs out of it, and focus
 * goes back to where it was.
 */
export const DialogProvider = ({ children }: { children: React.ReactNode }) => {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState<Prompt | null>(null);
    // The prompt on screen, read by the listeners below without waiting for
    // a render, so a line closed a moment ago can't be backed out of again.
    const promptRef = useRef<Prompt | null>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const okRef = useRef<HTMLButtonElement>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    // Set when the prompt opens while the app's own step back is still on its
    // way ("Done" right after a page closes): that popstate is the page
    // closing, not the person pressing Back, so it leaves the prompt be.
    const ownStepPendingRef = useRef(false);
    // One prompt at a time, so its parts can have fixed ids for whatever
    // needs to read them (the e2e helpers, aria-labelledby).
    const titleId = 'app-dialog-title';
    const messageId = 'app-dialog-message';

    useEffect(() => {
        const onPress = (e: Event) => {
            const el = e.target instanceof Element ? e.target.closest<HTMLElement>(PRESS_TARGET) : null;
            if (el) {
                lastPress.el = el;
                lastPress.at = Date.now();
            }
        };
        document.addEventListener('pointerdown', onPress, true);
        return () => document.removeEventListener('pointerdown', onPress, true);
    }, []);

    const showDialog = useCallback(
        (type: DialogType, message: string, onConfirm?: () => void, options?: DialogOptions) => {
            if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
                returnFocusRef.current = document.activeElement;
            } else if (lastPress.el?.isConnected) {
                returnFocusRef.current = lastPress.el;
            }
            ownStepPendingRef.current = isSteppingBack();
            const host = findHost();
            // One line at a time: a new one takes the old one's place.
            const prev = promptRef.current;
            if (prev?.host && prev.host !== host) prev.host.remove();
            const next = {
                type,
                message,
                onConfirm: onConfirm ?? null,
                options: options ?? {},
                host,
                view: host?.closest('.main-view') ?? null,
            };
            promptRef.current = next;
            setPrompt(next);
        },
        [],
    );

    // Stable reference so a prompt opening and closing doesn't re-render every
    // consumer of useDialog() across the app (showDialog itself never changes).
    const contextValue = useMemo(() => ({ showDialog }), [showDialog]);

    const close = useCallback((refocus = true) => {
        const current = promptRef.current;
        promptRef.current = null;
        current?.host?.remove();
        setPrompt(null);
        if (refocus && returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
        returnFocusRef.current = null;
    }, []);

    // Close first, then run the action: an action that raises a follow-up
    // ("Deleted." after "Delete this?") would otherwise be shut by the close
    // that came after it.
    const handleConfirm = useCallback(() => {
        const run = promptRef.current?.onConfirm;
        close();
        run?.();
    }, [close]);

    const cancel = useCallback(
        (refocus = true) => {
            const run = promptRef.current?.options.onCancel;
            close(refocus);
            run?.();
        },
        [close],
    );

    // An alert has nothing to back out of, so dismissing it is the same as OK.
    const dismiss = useCallback(
        (refocus = true) => {
            if (!promptRef.current) return;
            if (promptRef.current.type === 'confirm') cancel(refocus);
            else handleConfirm();
        },
        [cancel, handleConfirm],
    );

    // Into the line as it opens: the way out for something that can't be
    // undone, the way on for the rest. Then the line is scrolled into view, in
    // case what was pressed sat at the bottom edge.
    useEffect(() => {
        if (!prompt) return;
        const target = prompt.type === 'confirm' && prompt.options.danger ? cancelRef : okRef;
        target.current?.focus({ preventScroll: true });
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        (prompt.host ?? target.current)?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }, [prompt]);

    // Capture phase, and stopped there: the line can open inside a form that
    // folds away on Escape too, and one press should only take down the line.
    useEffect(() => {
        if (!prompt) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            dismiss();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [prompt, dismiss]);

    // The system Back moves the page underneath (each level is a history
    // entry), and a line left over a different page would act on something
    // no longer in view. So Back backs out of it too.
    useEffect(() => {
        if (!prompt) return;
        const onPop = () => {
            if (ownStepPendingRef.current) {
                ownStepPendingRef.current = false;
                return;
            }
            dismiss(false);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [prompt, dismiss]);

    // The row it was put under went away. A question goes with it: whatever it
    // asked about is gone, or the page is. A result ("Backup merged") stays
    // on the page it belongs to, moved up to the top, since the row is often
    // what the action itself cleared away (the paste box an import empties).
    useEffect(() => {
        const host = prompt?.host;
        if (!host) return;
        const watch = new MutationObserver(() => {
            const current = promptRef.current;
            if (host.isConnected || current?.host !== host) return;
            if (current.type === 'alert' && current.view?.isConnected) {
                const moved = { ...current, host: null };
                promptRef.current = moved;
                setPrompt(moved);
                return;
            }
            dismiss(false);
        });
        watch.observe(document.body, { childList: true, subtree: true });
        return () => watch.disconnect();
    }, [prompt, dismiss]);

    const slot = prompt && !prompt.host ? document.getElementById('prompt-slot') : null;

    const line = prompt && (
        <div
            className="inline-prompt m-appear"
            data-prompt={prompt.type}
            role={prompt.type === 'confirm' ? 'group' : 'status'}
            aria-labelledby={prompt.options.title ? titleId : messageId}
            aria-describedby={prompt.options.title ? messageId : undefined}
        >
            <div className="inline-prompt-text">
                {prompt.options.title && (
                    <p id={titleId} className="inline-prompt-title">
                        {prompt.options.title}
                    </p>
                )}
                {/* Without a title the message is what the line is about, and
                    reads at the title's size. */}
                <p
                    id={messageId}
                    className={
                        prompt.options.title ? 'inline-prompt-message' : 'inline-prompt-title whitespace-pre-line'
                    }
                >
                    {prompt.message}
                </p>
            </div>
            <div className="inline-prompt-actions">
                {prompt.type === 'confirm' && (
                    <button ref={cancelRef} type="button" onClick={() => cancel()} className="btn-secondary btn-sm">
                        {prompt.options.danger ? t('btn.keep') : t('btn.cancel')}
                    </button>
                )}
                <button
                    ref={okRef}
                    type="button"
                    onClick={handleConfirm}
                    className={`${prompt.options.danger ? 'btn-danger' : prompt.type === 'confirm' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                >
                    {prompt.options.confirmLabel ?? t('btn.ok')}
                </button>
            </div>
        </div>
    );

    return (
        <DialogContext.Provider value={contextValue}>
            {children}
            {prompt?.host && createPortal(line, prompt.host)}
            {prompt &&
                !prompt.host &&
                (slot ? (
                    createPortal(
                        <div className="prompt-banner glass glass-bar">
                            <div className={PAGE_COLUMN}>{line}</div>
                        </div>,
                        slot,
                    )
                ) : (
                    <div className="prompt-banner glass glass-bar fixed inset-x-0 top-0 z-[100] pt-[env(safe-area-inset-top,0px)]">
                        <div className={PAGE_COLUMN}>{line}</div>
                    </div>
                ))}
        </DialogContext.Provider>
    );
};
