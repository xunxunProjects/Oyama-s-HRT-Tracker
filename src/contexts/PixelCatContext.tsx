import React, { createContext, useContext, useEffect, useState } from 'react';

export type CatStyle = 'flag' | 'blue' | 'pink';

const CAT_STYLES: CatStyle[] = ['flag', 'blue', 'pink'];

interface PixelCatContextValue {
    showCats: boolean;
    setShowCats: (v: boolean) => void;
    catStyle: CatStyle;
    setCatStyle: (v: CatStyle) => void;
}

const PixelCatContext = createContext<PixelCatContextValue | null>(null);

export const usePixelCats = (): PixelCatContextValue => {
    const ctx = useContext(PixelCatContext);
    if (!ctx) throw new Error('usePixelCats must be used within PixelCatProvider');
    return ctx;
};

const SHOW_KEY = 'app-pixel-cats';
const STYLE_KEY = 'app-pixel-cat-style';

export const PixelCatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // On by default — opting out is the deliberate act.
    const [showCats, setShowCats] = useState<boolean>(
        () => localStorage.getItem(SHOW_KEY) !== 'false',
    );

    const [catStyle, setCatStyle] = useState<CatStyle>(() => {
        const saved = localStorage.getItem(STYLE_KEY);
        return CAT_STYLES.includes(saved as CatStyle) ? (saved as CatStyle) : 'flag';
    });

    useEffect(() => {
        localStorage.setItem(SHOW_KEY, String(showCats));
    }, [showCats]);

    useEffect(() => {
        localStorage.setItem(STYLE_KEY, catStyle);
    }, [catStyle]);

    return (
        <PixelCatContext.Provider value={{ showCats, setShowCats, catStyle, setCatStyle }}>
            {children}
        </PixelCatContext.Provider>
    );
};
