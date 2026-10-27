/**
 * The app's language as a locale tag, for text shaped outside React's reach:
 * the case regimenText gives a word follows it, not the browser's language
 * (Turkish raises i to İ and lowers I to ı). LanguageProvider sets it as it
 * renders, so it is right from the first render, which the page's lang
 * attribute, set after, isn't.
 */
let current: string | undefined;

export const setAppLocale = (locale: string) => {
    current = locale;
};

export const appLocale = () => current;
