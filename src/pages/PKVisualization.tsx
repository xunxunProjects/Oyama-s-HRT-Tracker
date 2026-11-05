import React, { useMemo, useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { useTranslation } from '../contexts/LanguageContext';
import Segmented from '../components/Segmented';
import ExplainMath from '../components/ExplainMath';
import AnimatedNumber from '../components/AnimatedNumber';

const MODELS = [
    { id: 'e2-oral', labelKey: 'pk_viz.model.e2_oral' },
    { id: 't-gel', labelKey: 'pk_viz.model.t_gel' },
] as const;

type ModelId = (typeof MODELS)[number]['id'];

const MODEL_PARAMS: Record<ModelId, { F: number; ka: number; ke: number; Vd: number }> = {
    'e2-oral': { F: 0.05, ka: 1.2, ke: 0.15, Vd: 1200 },
    't-gel': { F: 0.1, ka: 0.8, ke: 0.05, Vd: 900 },
};

const LATEX = 'C(t)=\\frac{F\\cdot D}{V_d}\\cdot\\frac{k_a}{k_a-k_e}\\left(e^{-k_e t}-e^{-k_a t}\\right)';

export default function PKVisualization({ onBack }: { onBack: () => void }) {
    const { t } = useTranslation();
    const [model, setModel] = useState<ModelId>('e2-oral');
    const [dose, setDose] = useState(2);

    const params = MODEL_PARAMS[model];
    const tHour = 8;

    const values = useMemo(
        () => ({
            F: params.F,
            D: dose,
            V_d: params.Vd,
            k_a: params.ka,
            k_e: params.ke,
            t: tHour,
        }),
        [params, dose],
    );

    const concentration = useMemo(() => {
        const { F, ka, ke, Vd } = { F: params.F, ka: params.ka, ke: params.ke, Vd: params.Vd };
        const D = dose;
        const t = tHour;
        if (Math.abs(ka - ke) < 1e-9) return 0;
        return ((F * D) / Vd) * (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
    }, [params, dose]);

    return (
        <div className="md:pb-32">
            <PageHeader title={t('pk_viz.title')} onBack={onBack} />
            <div className={`${PAGE_COLUMN} mt-3`}>
                <p className="text-sm text-[var(--text-muted)]">{t('pk_viz.subtitle')}</p>

                <div className="mt-6">
                    <p className="field-label mb-2" id="pk-model-label">
                        {t('pk_viz.model')}
                    </p>
                    <Segmented
                        options={MODELS.map(m => ({ id: m.id, label: t(m.labelKey) }))}
                        value={model}
                        onChange={id => setModel(id as ModelId)}
                        aria-label={t('pk_viz.model')}
                    />
                </div>

                <div className="mt-6">
                    <label className="field-label flex justify-between" htmlFor="pk-dose">
                        <span>{t('pk_viz.dose')}</span>
                        <span className="tabular-nums text-[var(--text)]">{dose} mg</span>
                    </label>
                    <input
                        id="pk-dose"
                        type="range"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={dose}
                        onChange={e => setDose(Number(e.target.value))}
                        className="mt-3 h-1 w-full accent-[var(--accent)]"
                    />
                </div>

                <ExplainMath className="mt-8" latex={LATEX} values={values} decimals={3} />

                <div className="mt-8">
                    <p className="field-label">{t('pk_viz.result')}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--text)]">
                        {/* mg/L × 10⁶ is pg/mL, the unit every lab report and the rest of the app use. */}
                        <AnimatedNumber value={concentration * 1e6} decimals={0} /> pg/mL
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{t('pk_viz.disclaimer')}</p>
                </div>
            </div>
        </div>
    );
}
