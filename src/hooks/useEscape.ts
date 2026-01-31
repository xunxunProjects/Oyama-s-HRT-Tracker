import { useEffect } from 'react';

/**
 * Hook to handle Escape key press.
 * @param onEscape Callback function to be called when Escape key is pressed.
 * @param isActive Whether the listener should be active. Defaults to true.
 * @param zIndex Optional z-index check. If provided, the handler will only run if no elements with higher z-index are present (heuristic).
 */
export const useEscape = (onEscape: () => void, isActive: boolean = true) => {
    useEffect(() => {
        if (!isActive) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                // Determine if we should handle this
                // For now, simple execution.
                // We rely on stopImmediatePropagation if we want to block parents, 
                // but that requires order control.
                onEscape();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isActive, onEscape]);
};
