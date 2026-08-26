import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Cloud, Lock, Syringe } from 'lucide-react';
import PixelCat from '../components/PixelCat';
import LevelCurveIcon from '../components/LevelCurveIcon';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { Lang, TRANSLATIONS } from '../i18n/translations';

const ONBOARDING_KEY = 'app-onboarded';

/**
 * Anyone with records on this device has been using the app since before there
 * was an intro, and greeting them as a stranger — worse, offering to set the
 * language and HRT mode they already chose — is the one way this screen can do
 * harm. So an existing dose log counts as having been onboarded.
 *
 * The keys are the ones useAppData writes: `hrt-events` while signed out,
 * `hrt-masc-events` for transmasc, and `hrt-u<id>-` prefixed variants per
 * account. Matched by shape rather than listed, since the accounts on a device
 * aren't known here.
 */
const EVENTS_KEY = /^hrt-(u[^-]+-)?(masc-)?events$/;

export const shouldShowOnboarding = (): boolean => {
    if (localStorage.getItem(ONBOARDING_KEY) === 'true') return false;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !EVENTS_KEY.test(key)) continue;
        const value = localStorage.getItem(key);
        if (value && value !== '[]') return false;
    }
    return true;
};

export const markOnboardingSeen = (): void => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
};

const divider = 'border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]';

/** Every mark sits in the same 34px well, whether it's a glyph or a lettermark. */
const markProps = { size: 18, strokeWidth: 1.75, className: 'text-muted' };

/**
 * Softens the last rows of the language list while any are still below the
 * fold. The list's scrollbar is hidden like every other scroller in the app, so
 * without this a row can end flush against the footer and read as the end of
 * the languages — on a short screen that quietly hides two of them.
 */
const FADE_OUT = 'linear-gradient(to bottom, #000 calc(100% - 2rem), transparent)';

/** Read straight out of the packs to size the greeting — see the welcome step. */
const SUBTITLE_KEY = 'onboarding.welcome_subtitle';

interface PointProps {
    /** A lucide glyph or a short lettermark — see `hormoneMark`. */
    mark: React.ReactNode;
    title: string;
    desc: string;
}

const Point: React.FC<PointProps> = ({ mark, title, desc }) => (
    <div className={`flex items-start gap-3.5 py-4 ${divider} last:border-b-0`}>
        {/* Fixed 34px rather than padding around the content: an 18px glyph and
            two letters have different intrinsic sizes, and the wells have to
            line up down the column regardless. */}
        <div className="mt-0.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]">
            {mark}
        </div>
        <div>
            <p className="text-[0.9375rem] font-medium text-body">{title}</p>
            <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">{desc}</p>
        </div>
    </div>
);

interface OnboardingProps {
    /** Same list Settings uses, rather than a second copy that can drift. */
    languageOptions: { value: string; label: string }[];
    onDone: () => void;
}

/**
 * First run. Four screens, in the order a new user needs them: language before
 * anything else (the app defaults to Chinese, so every other word is unreadable
 * until it's set), then HRT mode, then what the app actually does, then what it
 * does with your data and what it can't do for you.
 *
 * Rendered instead of the app shell, not as a tab inside it — the nav would
 * invite tabbing away halfway through, leaving language and mode on defaults
 * that the flow exists to ask about.
 */
const Onboarding: React.FC<OnboardingProps> = ({ languageOptions, onDone }) => {
    const { t, lang, setLang } = useTranslation();
    const { mode, setMode, isTransmasc } = useHRTMode();

    // The lettermark for the hormone this user actually tracks. Hard-coding E2
    // would be wrong for anyone who picked transmasc on the step before this
    // one — the mark names the thing they'll be getting measured.
    const hormoneMark = (
        <span className="text-[0.6875rem] font-semibold tracking-tight text-muted">
            {isTransmasc ? 'T' : 'E2'}
        </span>
    );

    const [step, setStep] = useState(0);
    // Only so the step change slides the way the app's view changes do.
    const [direction, setDirection] = useState<'forward' | 'backward'>('forward');

    const langListRef = useRef<HTMLDivElement>(null);
    const [langsBelow, setLangsBelow] = useState(false);
    const syncLangsBelow = () => {
        const el = langListRef.current;
        setLangsBelow(!!el && el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    };
    // Re-measured on step change, since the list only exists on step 0. The two
    // watchers cover different things and neither subsumes the other: `resize`
    // catches the rotation, while the observer catches the list's box moving
    // without the window doing anything — the address bar sliding away, or a
    // font landing late and retyping the rows.
    useEffect(() => {
        syncLangsBelow();
        window.addEventListener('resize', syncLangsBelow);
        const el = langListRef.current;
        const observer = new ResizeObserver(syncLangsBelow);
        if (el) {
            observer.observe(el);
            for (const row of Array.from(el.children)) observer.observe(row);
        }
        return () => {
            window.removeEventListener('resize', syncLangsBelow);
            observer.disconnect();
        };
    }, [step]);

    const modeOptions = [
        { value: 'transfem', labelKey: 'mode.transfem', descKey: 'onboarding.mode_transfem_desc' },
        { value: 'transmasc', labelKey: 'mode.transmasc', descKey: 'onboarding.mode_transmasc_desc' },
    ] as const;

    const steps = [
        // The cat is the welcome, so it gets the room. Whatever it happens to be
        // doing at this hour is the greeting — the schedule is the point, and a
        // pose reserved for first-timers would be the one cat in the app that
        // isn't living out its day. It obeys the "show pixel cats" preference
        // like every other cat: someone replaying the intro with them switched
        // off asked not to see one.
        <div key="welcome" className="flex h-full flex-col pt-6 text-center">
            {/* The greeting holds its place; only the list below it travels.
                Seven languages don't fit under the cat on a short screen, and
                scrolling the whole step would carry away the one sentence
                explaining what is being chosen. */}
            <div className="shrink-0">
                <div className="flex justify-center">
                    <PixelCat pose="donut" size={176} />
                </div>
                <h1 className="mt-6 text-2xl font-semibold text-body">{t('onboarding.welcome_title')}</h1>
                {/* Every translation of the sentence stacked into one grid cell,
                    the inactive ones hidden but still taking up their space, so
                    the box is as tall as the longest one at whatever width this
                    is. The list below therefore starts at the same y in every
                    language — otherwise picking Türkçe after 简体中文 grows the
                    sentence by a line and slides the list down under the finger
                    that just tapped it. A fixed height can't stand in for this:
                    the longest runs to four lines at 320px and three at 375px. */}
                <div className="mx-auto mt-3 grid max-w-sm">
                    {languageOptions.map(({ value }) => {
                        const current = value === lang;
                        const text = current
                            ? t(SUBTITLE_KEY)
                            : (TRANSLATIONS as Record<string, Record<string, string>>)[value]?.[SUBTITLE_KEY];
                        if (!text) return null;
                        return (
                            <p
                                key={value}
                                className={`col-start-1 row-start-1 text-sm leading-relaxed text-muted ${current ? '' : 'invisible'}`}
                            >
                                {text}
                            </p>
                        );
                    })}
                </div>
            </div>
            {/* Narrower than the step's max-w-md: the labels are one or two
                words, and across the full column the check would drift far
                enough from its language to stop reading as one row.

                min-h keeps the list usable rather than letting flex-1 squeeze
                it to nothing on a very short viewport — past that point the
                step outgrows its box and the outer scroller takes over, which
                is the graceful way to lose the pinned greeting. */}
            <div
                ref={langListRef}
                onScroll={syncLangsBelow}
                style={langsBelow ? { maskImage: FADE_OUT, WebkitMaskImage: FADE_OUT } : undefined}
                className="mx-auto mt-7 min-h-[7.5rem] w-full max-w-xs flex-1 overflow-y-auto scrollbar-hide text-start"
            >
                {languageOptions.map(({ value, label }) => (
                    <button
                        key={value}
                        onClick={() => setLang(value as Lang)}
                        aria-pressed={lang === value}
                        className={`flex w-full items-center justify-between gap-4 py-3.5 text-start ${divider} last:border-b-0`}
                    >
                        <span className={`text-[0.9375rem] text-body ${lang === value ? 'font-semibold' : ''}`}>
                            {label}
                        </span>
                        {lang === value && (
                            <Check size={16} className="shrink-0 text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]" />
                        )}
                    </button>
                ))}
            </div>
        </div>,

        <div key="mode" className="pt-8">
            <h1 className="text-2xl font-semibold text-body">{t('onboarding.mode_title')}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">{t('onboarding.mode_subtitle')}</p>
            <div className="mt-6">
                {modeOptions.map(({ value, labelKey, descKey }) => (
                    <button
                        key={value}
                        onClick={() => setMode(value)}
                        className={`flex w-full items-center justify-between gap-4 py-4 text-start ${divider} last:border-b-0`}
                    >
                        <span>
                            <span className={`block text-[0.9375rem] text-body ${mode === value ? 'font-semibold' : ''}`}>
                                {t(labelKey)}
                            </span>
                            <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-muted">
                                {t(descKey)}
                            </span>
                        </span>
                        {mode === value && (
                            <Check size={16} className="shrink-0 text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]" />
                        )}
                    </button>
                ))}
            </div>
        </div>,

        <div key="how" className="pt-8">
            <h1 className="text-2xl font-semibold text-body">{t('onboarding.how_title')}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">{t('onboarding.how_subtitle')}</p>
            <div className="mt-4">
                <Point mark={<Syringe {...markProps} />} title={t('onboarding.how_log')} desc={t('onboarding.how_log_desc')} />
                <Point mark={<LevelCurveIcon {...markProps} />} title={t('onboarding.how_chart')} desc={t('onboarding.how_chart_desc')} />
                <Point mark={hormoneMark} title={t('onboarding.how_calibrate')} desc={t('onboarding.how_calibrate_desc')} />
            </div>
            <p className="callout mt-5">{t('onboarding.how_note')}</p>
        </div>,

        <div key="privacy" className="pt-8">
            <h1 className="text-2xl font-semibold text-body">{t('onboarding.privacy_title')}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">{t('onboarding.privacy_subtitle')}</p>
            <div className="mt-4">
                <Point mark={<Lock {...markProps} />} title={t('onboarding.privacy_local')} desc={t('onboarding.privacy_local_desc')} />
                <Point mark={<Cloud {...markProps} />} title={t('onboarding.privacy_cloud')} desc={t('onboarding.privacy_cloud_desc')} />
                <Point mark={<AlertTriangle {...markProps} />} title={t('onboarding.privacy_medical')} desc={t('onboarding.privacy_medical_desc')} />
            </div>
        </div>,
    ];

    const isLast = step === steps.length - 1;

    const go = (next: number) => {
        setDirection(next > step ? 'forward' : 'backward');
        setStep(next);
    };

    return (
        <div className="flex h-[100dvh] w-full select-none flex-col bg-[var(--color-m3-surface-dim)] font-sans text-[var(--color-m3-on-surface)] dark:bg-[var(--color-m3-dark-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
            <div className="flex shrink-0 justify-end px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
                <button
                    onClick={onDone}
                    className={`rounded-lg px-2 py-1.5 text-[0.8125rem] text-muted hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] ${isLast ? 'invisible' : ''}`}
                    tabIndex={isLast ? -1 : 0}
                >
                    {t('onboarding.skip')}
                </button>
            </div>

            <div className="flex flex-1 items-start overflow-y-auto scrollbar-hide px-6">
                {/* The welcome step pins its greeting and scrolls its own list,
                    so it needs the scroller's height to divide up; the rest are
                    read top to bottom and just grow. */}
                <div
                    key={step}
                    className={`mx-auto w-full max-w-md ${step === 0 ? 'h-full pb-6' : 'pb-8'} ${direction === 'backward' ? 'view-enter-backward' : 'view-enter-forward'}`}
                >
                    {steps[step]}
                </div>
            </div>

            <div className={`shrink-0 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]`}>
                <div className="mx-auto grid w-full max-w-md grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <div className="justify-self-start">
                        {step > 0 && (
                            <button onClick={() => go(step - 1)} className="btn-secondary">
                                {t('onboarding.back')}
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5" aria-hidden="true">
                        {steps.map((_, i) => (
                            <span
                                key={i}
                                className={`h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${i === step
                                    ? 'w-4 bg-[var(--color-m3-primary)]'
                                    : 'w-1.5 bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]'
                                }`}
                            />
                        ))}
                    </div>

                    <div className="justify-self-end">
                        <button onClick={() => (isLast ? onDone() : go(step + 1))} className="btn-primary">
                            {t(isLast ? 'onboarding.start' : 'onboarding.next')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Onboarding;
