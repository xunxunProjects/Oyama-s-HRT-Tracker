import React, { useMemo, useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { useTranslation } from '../contexts/LanguageContext';
import Segmented from '../components/Segmented';
import ExplainMath from '../components/ExplainMath';
import AnimatedNumber from '../components/AnimatedNumber';

const MODELS = [
    { id: 'e2-oral', label: 'Estradiol oral' },
    { id: 't-gel', label: 'Testosterone gel' },
] as const;

type ModelId = (typeof MODELS)[number]['id'];

const MODEL_PARAMS: Record<ModelId, { F: number; ka: number; ke: number; Vd: number }> = {
    'e2-oral': { F: 0.05, ka: 1.2, ke: 0.15, Vd: 1200 },
    't-gel': { F: 0.1, ka: 0.8, ke: 0.05, Vd: 900 },
};

const LATEX =
    'C(t)=\\frac{F\\cdot D}{V_d}\\cdot\\frac{k_a}{k_a-k_e}\\left(e^{-k_e t}-e^{-k_a t}\\right)';

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
        return (F * D / Vd) * (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
    }, [params, dose]);

    return (
        <div className={PAGE_COLUMN}>
            <PageHeader title={t('pk_viz.title')} subtitle={t('pk_viz.subtitle')} onBack={onBack} />

            <section className="mt-6 space-y-4">
                <div>
                    <label className="field-label" htmlFor="pk-model">
                        {t('pk_viz.model')}
                    </label>
                    <Segmented
                        options={MODELS.map((m) => ({ id: m.id, label: m.label }))}
                        value={model}
                        onChange={(id) => setModel(id as ModelId)}
                        aria-label={t('pk_viz.model')}
                    />
                </div>

                <div>
                    <label className="field-label" htmlFor="pk-dose">
                        {t('pk_viz.dose')} ({dose} mg)
                    </label>
                    <input
                        id="pk-dose"
                        type="range"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={dose}
                        onChange={(e) => setDose(Number(e.target.value))}
                        className="w-full"
                        aria-label={t('pk_viz.dose')}
                    />
                </div>
            </section>

            <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <ExplainMath latex={LATEX} values={values} decimals={3} />
            </section>

            <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="field-label">{t('pk_viz.result')}</p>
                <p className="text-2xl font-semibold tabular-nums">
                    <AnimatedNumber value={concentration} decimals={4} /> mg/L
                </p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">{t('pk_viz.disclaimer')}</p>
            </section>
        </div>
    );
}
