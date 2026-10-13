import { useEffect } from 'react';

/**
 * Hook to handle Escape key press.
 * @param onEscape Callback function to be called when Escape key is pressed.
 * @param isActive Whether the listener should be active. Defaults to true.
 */
export const useEscape = (onEscape: () => void, isActive: boolean = true) => {
    useEffect(() => {
        if (!isActive) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onEscape();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isActive, onEscape]);
};
