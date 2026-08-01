import React from 'react';
import { ArrowLeft } from 'lucide-react';
import PixelCat, { CatPose } from '../components/PixelCat';
import { useTranslation } from '../contexts/LanguageContext';
import { CAT_STATE_WINDOWS, usePixelCats, CatState } from '../contexts/PixelCatContext';

interface CatStatesProps {
    onBack: () => void;
}

const POSES: CatPose[] = ['donut', 'loaf'];

const pad = (h: number) => String(h).padStart(2, '0');

/**
 * Developer-mode gallery of every cat state at once.
 *
 * The windows come from CAT_STATE_WINDOWS rather than a list written out again
 * here, so a label can never claim hours the schedule no longer covers. The
 * cats render with `force` so the gallery still works with pixel cats switched
 * off — you opened it to look at the art, not to check the setting.
 */
const CatStates: React.FC<CatStatesProps> = ({ onBack }) => {
    const { t } = useTranslation();
    const { catState } = usePixelCats();

    return (
        <div className="relative pb-32">
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-8 pt-8 pb-3 flex items-center">
                <button
                    onClick={onBack}
                    className="flex items-center gap-3 -ml-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                >
                    <ArrowLeft size={18} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0" />
                    <span className="text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        {t('settings.cat_states')}
                    </span>
                </button>
            </div>

            <div className="px-6 md:px-8 max-w-2xl">
                <p className="mb-6 text-xs text-muted leading-relaxed">
                    {t('settings.cat_states_desc')}
                </p>

                {POSES.map(pose => (
                    <div key={pose} className="mb-8">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                            {t(`cat.pose.${pose}`)}
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                            {CAT_STATE_WINDOWS.map(({ state, from, to }) => {
                                const isNow = state === catState;
                                return (
                                    <div
                                        key={state}
                                        className={`rounded-md px-2 py-2 ${isNow
                                            ? 'bg-[var(--color-m3-primary-container)] dark:bg-[var(--color-m3-dark-primary-container)]'
                                            : ''}`}
                                    >
                                        <PixelCat pose={pose} state={state} size={128} force />
                                        <p className="mt-1 text-xs text-body">{t(`cat.state.${state}`)}</p>
                                        <p className="text-[11px] tabular-nums text-muted">
                                            {pad(from)}:00 – {pad(to)}:00
                                        </p>
                                        {isNow && (
                                            <p className="text-[11px] text-[var(--color-m3-primary)]">
                                                {t('settings.cat_states_now')}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CatStates;
