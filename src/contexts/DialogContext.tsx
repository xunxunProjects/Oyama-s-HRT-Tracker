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
     *  system Back, the page it was asked on going away, or another prompt
     *  taking its place. */
    onCancel?: () => void;
}

/** Shows a prompt. What it returns takes that prompt down again, if it's still
 *  the one on screen (a confirm taken down that way is backed out of). */
export type ShowDialog = (
    type: DialogType,
    message: string,
    onConfirm?: () => void,
    options?: DialogOptions,
) => () => void;

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
    id: number;
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

/** Where a prompt can be put under a row: the app's page area, and the intro,
 *  which takes the whole screen instead. A press anywhere else (the bars
 *  around the page, the banner) has no row of its own to go under. */
const PAGE_AREA = '.main-view, [data-prompt-area]';

/** What was last pressed, with a pointer or a key, so the prompt it causes can
 *  be put under it. Safari doesn't focus a button that's clicked, so focus
 *  alone can't say. */
const lastPress: { el: HTMLElement | null; at: number } = { el: null, at: 0 };
const PRESS_TARGET = 'button, a, summary, label, [role="button"], [role="switch"], [role="tab"], [role="option"]';

// Never put a line inside these: in a label it becomes part of what the label
// names (and a tap anywhere on it presses the labelled control), and in a
// button or a list of options it's inside the control itself.
const NOT_INSIDE = 'label, button, a, summary, select, [role="button"], [role="listbox"], [role="option"]';

/** A press a line can still go under: on the page, drawn, and not in
 *  something folded away (a collapsed list keeps its options, inert). */
function usable(el: Element | null): el is HTMLElement {
    return (
        el instanceof HTMLElement &&
        el !== document.body &&
        el.isConnected &&
        !el.closest('[inert], [hidden]') &&
        el.getClientRects().length > 0
    );
}

/** Whether a new line can go between this box's children: they stack. */
function stacks(el: HTMLElement): boolean {
    const cs = getComputedStyle(el);
    if (cs.display === 'block' || cs.display === 'flow-root' || cs.display === 'list-item') return true;
    if (cs.display.includes('flex')) return cs.flexDirection.startsWith('column');
    if (cs.display.includes('grid')) return cs.gridTemplateColumns.trim().split(/\s+/).length <= 1;
    return false;
}

/** The row a pressed control sits in: the nearest box, from the control up,
 *  whose parent stacks its children and that is wide enough to hold a line
 *  (its words and its two buttons). A button alone in a grid cell or a tight
 *  span isn't a row; the run of fields or the list item around it is. */
function rowFor(el: HTMLElement, area: Element): HTMLElement | null {
    const need = Math.min(320, area.clientWidth - 48);
    for (let node = el; node !== area && node.parentElement; node = node.parentElement) {
        const parent = node.parentElement;
        if (stacks(parent) && !parent.closest(NOT_INSIDE) && node.getBoundingClientRect().width >= need) return node;
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
    return host;
}

/** A host under the row of what was just pressed (or, failing that, what has
 *  the focus), or null for the banner: nothing on the page was, the press was
 *  in the bars around the page, or it was in the banner itself, where what it
 *  raises follows it. A press inside a line already in the page counts like
 *  any other, so what it raises goes right under that line. */
function findHost(): HTMLElement | null {
    if (lastPress.el && (!lastPress.el.isConnected || Date.now() - lastPress.at >= 15000)) lastPress.el = null;
    const pressed = usable(lastPress.el)
        ? lastPress.el
        : usable(document.activeElement)
          ? document.activeElement
          : null;
    const area = pressed?.closest(PAGE_AREA);
    if (!pressed || !area || pressed.closest('.prompt-banner')) return null;
    const row = rowFor(pressed, area);
    return row ? hostAfter(row) : null;
}

/**
 * A place in the page right under what was just pressed, for a line that asks
 * for more than yes or no (a password, a form) to render into with a portal.
 * Undefined while closed, and for the moment the place is being chosen, so
 * nothing of the caller's is on the page yet to be mistaken for what was
 * pressed; null with nowhere to put it, for the banner. A new `key` (another
 * user's panel, another backup) moves it under the row pressed for that one.
 * If its row goes away (the paste box an import folds up), it moves up to the
 * banner. The host goes when `open` turns false.
 */
export function useInlineHost(open: boolean, key?: unknown): HTMLElement | null | undefined {
    const [host, setHost] = useState<HTMLElement | null | undefined>(undefined);
    useLayoutEffect(() => {
        if (!open) return;
        const made = findHost();
        setHost(made);
        if (!made) return () => setHost(undefined);
        const watch = new MutationObserver(() => {
            if (made.isConnected) return;
            watch.disconnect();
            setHost(null);
        });
        watch.observe(document.body, { childList: true, subtree: true });
        return () => {
            watch.disconnect();
            made.remove();
            setHost(undefined);
        };
    }, [open, key]);
    return open ? host : undefined;
}

/**
 * Renders a line where useInlineHost (or a prompt) put it: into its host in
 * the page, or with none, in the banner at the top of the page. Nothing while
 * the place is still undefined. Without the app's banner slot (the intro, a
 * shared page), the banner floats over the top of the screen.
 */
export const PromptPlace: React.FC<{
    host: HTMLElement | null | undefined;
    children: React.ReactNode;
    /** The banner's column, for a line narrower than the page's. */
    column?: string;
}> = ({ host, children, column = PAGE_COLUMN }) => {
    if (host === undefined) return null;
    if (host) return createPortal(children, host);
    const slot = document.getElementById('prompt-slot');
    return createPortal(
        <div
            className={`prompt-banner glass glass-bar ${slot ? '' : 'fixed inset-x-0 top-0 z-[100] pt-[env(safe-area-inset-top,0px)]'}`}
        >
            <div className={column}>{children}</div>
        </div>,
        slot ?? document.body,
    );
};

/**
 * Every alert and confirm in the app goes through here, and none of them is a
 * pop-up. The question is put into the page as a line right under the row
 * that was pressed ("Delete this dose? Keep it / Delete"), and the rest of
 * the page stays as it was. Asked with nothing on the page to put it under (a
 * sync that finished on its own), or as the page it was asked on closes, it
 * floats at the top of the page instead. Escape, the system Back, or the page
 * going away backs out of it, and focus goes back to where it was.
 */
export const DialogProvider = ({ children }: { children: React.ReactNode }) => {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState<Prompt | null>(null);
    // The prompt on screen, read by the listeners below without waiting for
    // a render, so a line closed a moment ago can't be backed out of again.
    const promptRef = useRef<Prompt | null>(null);
    const lastId = useRef(0);
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
        const note = (el: HTMLElement | null | undefined) => {
            if (!el) return;
            lastPress.el = el;
            lastPress.at = Date.now();
        };
        const onPointer = (e: Event) => {
            note(e.target instanceof Element ? e.target.closest<HTMLElement>(PRESS_TARGET) : null);
        };
        // A key that presses something: Enter or Space on a control, or Enter
        // in a field, which sends its form.
        const onKey = (e: KeyboardEvent) => {
            if ((e.key !== 'Enter' && e.key !== ' ') || !(e.target instanceof HTMLElement)) return;
            const control = e.target.closest<HTMLElement>(PRESS_TARGET);
            note(control ?? (e.key === 'Enter' && e.target.matches('input, select') ? e.target : null));
        };
        document.addEventListener('pointerdown', onPointer, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('pointerdown', onPointer, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, []);

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

    const showDialog = useCallback<ShowDialog>(
        (type, message, onConfirm, options) => {
            if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
                returnFocusRef.current = document.activeElement;
            } else if (lastPress.el?.isConnected) {
                returnFocusRef.current = lastPress.el;
            }
            ownStepPendingRef.current = isSteppingBack();
            // Asked as the page closes ("Password changed" as its form shuts):
            // in the banner over the page it closes to, not in the one leaving.
            const host = ownStepPendingRef.current ? null : findHost();
            const id = ++lastId.current;
            const next: Prompt = {
                id,
                type,
                message,
                onConfirm: onConfirm ?? null,
                options: options ?? {},
                host,
                view: host?.closest(PAGE_AREA) ?? null,
            };
            // One line at a time: a new one takes the old one's place, and a
            // question still open is backed out of, so whatever waits on it
            // hears no. After the swap, so a prompt raised by that cancel
            // takes this one's place in turn.
            const prev = promptRef.current;
            promptRef.current = next;
            setPrompt(next);
            prev?.host?.remove();
            if (prev?.type === 'confirm') prev.options.onCancel?.();
            return () => {
                if (promptRef.current?.id === id) dismiss(false);
            };
        },
        [dismiss],
    );

    // Stable reference so a prompt opening and closing doesn't re-render every
    // consumer of useDialog() across the app (showDialog itself never changes).
    const contextValue = useMemo(() => ({ showDialog }), [showDialog]);

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

    // The row it was put under went away. On a page still there (the paste
    // box an import folds up, the row a delete just took), the line moves up
    // to the top of that page and still waits for its answer. With the page
    // gone, it goes with it, as it would on Back. Checked at once as well,
    // in case the row went before the watch began.
    useLayoutEffect(() => {
        const host = prompt?.host;
        if (!host) return;
        const check = () => {
            const current = promptRef.current;
            if (host.isConnected || current?.host !== host) return;
            if (current.view?.isConnected) {
                const moved = { ...current, host: null };
                promptRef.current = moved;
                setPrompt(moved);
            } else dismiss(false);
        };
        check();
        const watch = new MutationObserver(check);
        watch.observe(document.body, { childList: true, subtree: true });
        return () => watch.disconnect();
    }, [prompt, dismiss]);

    const line = prompt && (
        <div
            key={prompt.id}
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
            {prompt && <PromptPlace host={prompt.host}>{line}</PromptPlace>}
        </DialogContext.Provider>
    );
};
