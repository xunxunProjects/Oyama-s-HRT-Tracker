import React, { useMemo, useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import CustomSelect from '../components/CustomSelect';
import { useTranslation } from '../contexts/LanguageContext';
import { GEL_SITE_ORDER, PK_SANDBOX_MODELS, computePkSandbox } from '../../logic';
import { fill } from '../utils/regimenText';

interface Props {
    onBack: () => void;
}

const num = (v: string): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** Each medication once, in the order the models list them. */
const ESTERS = Array.from(new Set(PK_SANDBOX_MODELS.map(m => m.ester)));

/** Steps whose result says something the line above it doesn't. */
const STEPS_WITH_RESULT = new Set(['params', 'conversion']);

/** A number field drawn as the app's line, its name above it. */
const NumberField: React.FC<{
    id: string;
    label: string;
    value: number;
    onChange: (value: number) => void;
}> = ({ id, label, value, onChange }) => (
    <div>
        <label className="field-label" htmlFor={id}>
            {label}
        </label>
        <input
            id={id}
            type="number"
            inputMode="decimal"
            className="input-base tabular-nums"
            style={{ fontSize: '16px' }}
            value={value}
            onChange={e => onChange(num(e.target.value))}
        />
    </div>
);

const PKCalculationSandbox: React.FC<Props> = ({ onBack }) => {
    const { t } = useTranslation();
    const [modelId, setModelId] = useState<string>(PK_SANDBOX_MODELS[0].id);
    const model = PK_SANDBOX_MODELS.find(m => m.id === modelId)!;
    const routes = PK_SANDBOX_MODELS.filter(m => m.ester === model.ester);

    const [doseMG, setDoseMG] = useState<number>(model.defaultInputs.doseMG);
    const [bodyWeightKG, setBodyWeightKG] = useState<number>(model.defaultInputs.bodyWeightKG);
    const [birthYear, setBirthYear] = useState<number>(model.defaultInputs.birthYear ?? 1990);
    const [holdMin, setHoldMin] = useState<number>(model.defaultInputs.sublingualHoldMin ?? 10);
    const [gelSite, setGelSite] = useState<number>(model.defaultInputs.gelSite ?? 0);
    const [releaseRate, setReleaseRate] = useState<number>(model.defaultInputs.releaseRateUGPerDay ?? 0);
    const [wearH, setWearH] = useState<number>(model.defaultInputs.wearH ?? 84);

    // A new model starts from its own defaults.
    const pickModel = (id: string) => {
        const next = PK_SANDBOX_MODELS.find(m => m.id === id)!;
        setModelId(id);
        setDoseMG(next.defaultInputs.doseMG);
        setBodyWeightKG(next.defaultInputs.bodyWeightKG);
        setBirthYear(next.defaultInputs.birthYear ?? 1990);
        setHoldMin(next.defaultInputs.sublingualHoldMin ?? 10);
        setGelSite(next.defaultInputs.gelSite ?? 0);
        setReleaseRate(next.defaultInputs.releaseRateUGPerDay ?? 0);
        setWearH(next.defaultInputs.wearH ?? 84);
    };

    const result = useMemo(
        () =>
            computePkSandbox(model.id, {
                doseMG,
                bodyWeightKG,
                birthYear,
                sublingualHoldMin: holdMin,
                gelSite,
                releaseRateUGPerDay: releaseRate,
                wearH,
            }),
        [model.id, doseMG, bodyWeightKG, birthYear, holdMin, gelSite, releaseRate, wearH],
    );

    // Picking another medication keeps the route when that medication has it.
    const pickEster = (ester: string) => {
        const same = PK_SANDBOX_MODELS.find(m => m.ester === ester && m.route === model.route);
        const first = PK_SANDBOX_MODELS.find(m => m.ester === ester);
        pickModel((same ?? first)!.id);
    };

    const isSublingual = model.route === 'sublingual';
    const isGel = model.route === 'gel';
    const isPatchLike = model.route === 'patchApply' || model.route === 'pellet';

    const hours = (h: number | null) =>
        h === null ? t('pk_calc.never') : fill(t('pk_calc.hours'), { n: h.toFixed(1) });
    const results: [string, string][] = [
        [t('pk_calc.peak'), `${result.peak.value.toFixed(1)} pg/mL`],
        [t('pk_calc.peak_time'), hours(result.peak.timeH)],
        [t('pk_calc.below_200'), hours(result.timeBelow200H)],
        [t('pk_calc.below_100'), hours(result.timeBelow100H)],
    ];

    return (
        <div className="md:pb-32">
            <PageHeader title={t('pk_calc.title')} onBack={onBack} />
            <div className={`${PAGE_COLUMN} mt-3`}>
                <p className="text-sm text-[var(--text-muted)]">{t('pk_calc.subtitle')}</p>

                <div className="mt-6 space-y-5">
                    <CustomSelect
                        label={t('pk_calc.drug')}
                        value={model.ester}
                        onChange={pickEster}
                        options={ESTERS.map(ester => ({ value: ester, label: t(`ester.${ester}`) }))}
                    />
                    <CustomSelect
                        label={t('pk_calc.route')}
                        value={model.id}
                        onChange={pickModel}
                        options={routes.map(m => ({ value: m.id, label: t(`pk_calc.route.${m.route}`) }))}
                    />
                </div>

                <h2 className="group-heading mt-10">{t('pk_calc.basic')}</h2>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5">
                    <NumberField
                        id="pk-calc-dose"
                        label={t('pk_calc.field.dose')}
                        value={doseMG}
                        onChange={setDoseMG}
                    />
                    <NumberField
                        id="pk-calc-weight"
                        label={t('pk_calc.field.weight')}
                        value={bodyWeightKG}
                        onChange={setBodyWeightKG}
                    />
                    <NumberField
                        id="pk-calc-birth-year"
                        label={t('pk_calc.field.birth_year')}
                        value={birthYear}
                        onChange={setBirthYear}
                    />
                    {isSublingual && (
                        <NumberField
                            id="pk-calc-hold"
                            label={t('pk_calc.field.hold')}
                            value={holdMin}
                            onChange={setHoldMin}
                        />
                    )}
                    {isPatchLike && (
                        <>
                            <NumberField
                                id="pk-calc-rate"
                                label={t('pk_calc.field.release_rate')}
                                value={releaseRate}
                                onChange={setReleaseRate}
                            />
                            <NumberField
                                id="pk-calc-wear"
                                label={t('pk_calc.field.wear')}
                                value={wearH}
                                onChange={setWearH}
                            />
                        </>
                    )}
                </div>
                {isGel && (
                    <div className="mt-5">
                        <CustomSelect
                            label={t('pk_calc.field.gel_site')}
                            value={String(gelSite)}
                            onChange={v => setGelSite(num(v))}
                            options={GEL_SITE_ORDER.map((site, i) => ({
                                value: String(i),
                                label: t(`gel.site.${site}`),
                            }))}
                        />
                    </div>
                )}

                <h2 className="group-heading mt-10">{t('pk_calc.results')}</h2>
                <dl className="mt-1 settings-section">
                    {results.map(([label, value]) => (
                        <div key={label} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                            <dt className="text-[var(--text)]">{label}</dt>
                            <dd className="tabular-nums text-[var(--text-muted)]">{value}</dd>
                        </div>
                    ))}
                </dl>

                <h2 className="group-heading mt-10">{t('pk_calc.derivation')}</h2>
                <ol className="mt-3 space-y-4">
                    {result.derivation.map(step => (
                        <li key={step.key}>
                            <p className="text-sm text-[var(--text)]">{t(`pk_calc.step.${step.key}`)}</p>
                            <p className="mt-0.5 break-words text-xs tabular-nums text-[var(--text-muted)]">
                                {step.formula}
                            </p>
                            {step.result && STEPS_WITH_RESULT.has(step.key) && (
                                <p className="text-xs tabular-nums text-[var(--text-muted)]">{step.result}</p>
                            )}
                        </li>
                    ))}
                </ol>

                <p className="mt-10 text-xs text-[var(--text-muted)]">{t('pk_calc.disclaimer')}</p>
            </div>
        </div>
    );
};

export default PKCalculationSandbox;
