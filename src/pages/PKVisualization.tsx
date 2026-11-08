import React, { useMemo, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import Segmented from '../components/Segmented';
import ExplainMath from '../components/ExplainMath';
import AnimatedNumber from '../components/AnimatedNumber';
import { CorePK, DEFAULT_PK_PARAMS, OralPK, T_CorePK, T_GelPK } from '../../logic';

const MODELS = [
    { id: 'e2-oral', labelKey: 'pk_viz.model.e2_oral' },
    { id: 't-gel', labelKey: 'pk_viz.model.t_gel' },
] as const;

type ModelId = (typeof MODELS)[number]['id'];

/** A 70 kg body, the sandbox's default. */
const WEIGHT_KG = 70;

/**
 * The app's own default numbers for each model (issue #277: these were made up
 * and Vd was 1200 L for estradiol). Testosterone gel is exactly the app's
 * model. Oral estradiol leaves out the estrone pool the app routes most of an
 * oral dose through, so the real curve peaks later and falls slower; one
 * absorption step is what this simplified formula can show.
 * Vd is in litres, so mg/L × 10⁶ is pg/mL and × 10⁵ is ng/dL.
 */
const MODEL_PARAMS: Record<
    ModelId,
    {
        F: number;
        ka: number;
        ke: number;
        Vd: number;
        unit: string;
        scale: number;
        dose: [number, number, number, number];
    }
> = {
    'e2-oral': {
        F: DEFAULT_PK_PARAMS.e2_oral_bio,
        ka: OralPK.kAbsE2,
        ke: DEFAULT_PK_PARAMS.e2_kClear,
        Vd: CorePK.vdPerKG * WEIGHT_KG,
        unit: 'pg/mL',
        scale: 1e6,
        // min, max, step, default (mg of estradiol)
        dose: [0.5, 10, 0.5, 2],
    },
    't-gel': {
        F: DEFAULT_PK_PARAMS.t_gel_arm,
        ka: T_GelPK.k1,
        ke: DEFAULT_PK_PARAMS.t_kClear,
        Vd: T_CorePK.vdPerKG * WEIGHT_KG,
        unit: 'ng/dL',
        scale: 1e5,
        // mg of testosterone in the gel, as on the box
        dose: [10, 100, 5, 50],
    },
};

const LATEX = 'C(t)=\\frac{F\\cdot D}{V_d}\\cdot\\frac{k_a}{k_a-k_e}\\left(e^{-k_e t}-e^{-k_a t}\\right)';

/** The visualisation, as one tab of the model demos page. */
export default function PKVisualization() {
    const { t } = useTranslation();
    const [model, setModel] = useState<ModelId>('e2-oral');
    const [dose, setDose] = useState(MODEL_PARAMS['e2-oral'].dose[3]);

    const params = MODEL_PARAMS[model];
    const [doseMin, doseMax, doseStep] = params.dose;
    const pickModel = (id: ModelId) => {
        setModel(id);
        setDose(MODEL_PARAMS[id].dose[3]);
    };
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
        <div>
            <div>
                <p className="text-sm text-[var(--text-muted)]">{t('pk_viz.subtitle')}</p>

                <div className="mt-6">
                    <p className="field-label mb-2" id="pk-model-label">
                        {t('pk_viz.model')}
                    </p>
                    <Segmented
                        options={MODELS.map(m => ({ id: m.id, label: t(m.labelKey) }))}
                        value={model}
                        onChange={id => pickModel(id as ModelId)}
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
                        min={doseMin}
                        max={doseMax}
                        step={doseStep}
                        value={dose}
                        onChange={e => setDose(Number(e.target.value))}
                        className="mt-3 h-1 w-full accent-[var(--accent)]"
                    />
                </div>

                <ExplainMath className="mt-8" latex={LATEX} values={values} decimals={3} />

                <div className="mt-8">
                    <p className="field-label">{t('pk_viz.result')}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--text)]">
                        {/* Estradiol in pg/mL, testosterone in ng/dL, as lab reports give them. */}
                        <AnimatedNumber value={concentration * params.scale} decimals={0} /> {params.unit}
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{t('pk_viz.disclaimer')}</p>
                </div>
            </div>
        </div>
    );
}
