import React, { createContext, useContext, useEffect, useState } from 'react';

export type CatStyle = 'flag' | 'blue' | 'pink';

const CAT_STYLES: CatStyle[] = ['flag', 'blue', 'pink'];

interface PixelCatContextValue {
    showCats: boolean;
    setShowCats: (v: boolean) => void;
    catStyle: CatStyle;
    setCatStyle: (v: CatStyle) => void;
    /** What the cats are up to right now — see CAT_SCHEDULE. */
    catState: CatState;
}

const PixelCatContext = createContext<PixelCatContextValue | null>(null);

export const usePixelCats = (): PixelCatContextValue => {
    const ctx = useContext(PixelCatContext);
    if (!ctx) throw new Error('usePixelCats must be used within PixelCatProvider');
    return ctx;
};

const SHOW_KEY = 'app-pixel-cats';
const STYLE_KEY = 'app-pixel-cat-style';

/**
 * A cat's day, by the device clock — not by the app theme, since someone
 * reading in dark mode at noon has not put their cats to bed.
 *
 * Each entry is the hour the state begins; it runs until the next one. The last
 * entry wraps past midnight back to the first, so the table always covers all
 * 24 hours and can never leave a gap.
 */
export type CatState =
    | 'waking'    // 06-08  still half under the covers
    | 'alert'     // 08-10  properly up, the liveliest stretch
    | 'playing'   // 10-12  batting at something
    | 'napping'   // 12-15  the long midday sleep
    | 'grooming'  // 15-17  washing up
    | 'waiting'   // 17-18  sat by an empty bowl, staring
    | 'eating'    // 18-20  dinner
    | 'winding'   // 20-21  fed, drowsy, not yet down
    | 'asleep';   // 21-06  out cold under the quilt

const CAT_SCHEDULE: readonly (readonly [number, CatState])[] = [
    [6, 'waking'],
    [8, 'alert'],
    [10, 'playing'],
    [12, 'napping'],
    [15, 'grooming'],
    [17, 'waiting'],
    [18, 'eating'],
    [20, 'winding'],
    [21, 'asleep'],
];

/**
 * The schedule as inclusive-start/exclusive-end windows, derived rather than
 * written out a second time — a hand-kept copy is how a viewer ends up labelling
 * a state with hours it no longer covers. The final window wraps past midnight,
 * so its `to` is the first entry's `from`.
 */
export const CAT_STATE_WINDOWS: readonly { state: CatState; from: number; to: number }[] =
    CAT_SCHEDULE.map(([from, state], i) => ({
        state,
        from,
        to: CAT_SCHEDULE[(i + 1) % CAT_SCHEDULE.length][0],
    }));

export const catStateForHour = (hour: number): CatState => {
    // Before the first entry is still the previous day's last state.
    let state: CatState = CAT_SCHEDULE[CAT_SCHEDULE.length - 1][1];
    for (const [from, s] of CAT_SCHEDULE) {
        if (hour >= from) state = s;
    }
    return state;
};

const catStateNow = (): CatState => catStateForHour(new Date().getHours());

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

    // Polled rather than scheduled on the boundary: a tab left open all day has
    // to notice too, and nobody minds the cats changing over a minute late.
    const [catState, setCatState] = useState(catStateNow);
    useEffect(() => {
        const id = setInterval(() => setCatState(catStateNow()), 60_000);
        return () => clearInterval(id);
    }, []);

    return (
        <PixelCatContext.Provider value={{ showCats, setShowCats, catStyle, setCatStyle, catState }}>
            {children}
        </PixelCatContext.Provider>
    );
};
