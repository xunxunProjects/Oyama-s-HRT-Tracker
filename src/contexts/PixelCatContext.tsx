import React, { createContext, useContext, useEffect, useState } from 'react';

interface PixelCatContextValue {
    showCats: boolean;
    setShowCats: (v: boolean) => void;
}

const PixelCatContext = createContext<PixelCatContextValue | null>(null);

export const usePixelCats = (): PixelCatContextValue => {
    const ctx = useContext(PixelCatContext);
    if (!ctx) throw new Error('usePixelCats must be used within PixelCatProvider');
    return ctx;
};

const STORAGE_KEY = 'app-pixel-cats';

export const PixelCatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // On by default — opting out is the deliberate act.
    const [showCats, setShowCats] = useState<boolean>(
        () => localStorage.getItem(STORAGE_KEY) !== 'false',
    );

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, String(showCats));
    }, [showCats]);

    return (
        <PixelCatContext.Provider value={{ showCats, setShowCats }}>
            {children}
        </PixelCatContext.Provider>
    );
};
