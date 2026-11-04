import React, { useMemo, useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { useTranslation } from '../contexts/LanguageContext';
import { PK_SANDBOX_MODELS, computePkSandbox } from '../../logic';

interface Props {
    onBack: () => void;
}

const num = (v: string): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const PKCalculationSandbox: React.FC<Props> = ({ onBack }) => {
    const { t } = useTranslation();
    const [modelId, setModelId] = useState<string>(PK_SANDBOX_MODELS[0].id);
    const model = PK_SANDBOX_MODELS.find(m => m.id === modelId)!;

    const [doseMG, setDoseMG] = useState<number>(model.defaultInputs.doseMG);
    const [bodyWeightKG, setBodyWeightKG] = useState<number>(model.defaultInputs.bodyWeightKG);
    const [birthYear, setBirthYear] = useState<number>(model.defaultInputs.birthYear ?? 1990);
    const [holdMin, setHoldMin] = useState<number>(model.defaultInputs.sublingualHoldMin ?? 10);
    const [gelSite, setGelSite] = useState<number>(model.defaultInputs.gelSite ?? 0);
    const [releaseRate, setReleaseRate] = useState<number>(model.defaultInputs.releaseRateUGPerDay ?? 0);
    const [wearH, setWearH] = useState<number>(model.defaultInputs.wearH ?? 84);

    // Reset inputs when the model changes.
    React.useEffect(() => {
        setDoseMG(model.defaultInputs.doseMG);
        setBodyWeightKG(model.defaultInputs.bodyWeightKG);
        setBirthYear(model.defaultInputs.birthYear ?? 1990);
        setHoldMin(model.defaultInputs.sublingualHoldMin ?? 10);
        setGelSite(model.defaultInputs.gelSite ?? 0);
        setReleaseRate(model.defaultInputs.releaseRateUGPerDay ?? 0);
        setWearH(model.defaultInputs.wearH ?? 84);
    }, [model.id]);

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

    const isSublingual = model.route === 'sublingual';
    const isGel = model.route === 'gel';
    const isPatchLike = model.route === 'patchApply' || model.route === 'pellet';

    return (
        <div className="min-h-screen">
            <PageHeader title={t('pk_calc.title')} onBack={onBack} />
            <div className={`${PAGE_COLUMN} mt-4 space-y-6`}>
                <p className="text-sm text-[var(--text-muted)]">{t('pk_calc.subtitle')}</p>

                {/* Model selector */}
                <section className="space-y-2">
                    <h2 className="group-heading">{t('pk_calc.model')}</h2>
                    <select
                        className="w-full rounded border border-[var(--border)] bg-[var(--bg)] p-2 text-sm"
                        value={modelId}
                        onChange={e => setModelId(e.target.value)}
                    >
                        {PK_SANDBOX_MODELS.map(m => (
                            <option key={m.id} value={m.id}>
                                {m.label}
                            </option>
                        ))}
                    </select>
                </section>

                {/* Basic parameters */}
                <section className="space-y-3">
                    <h2 className="group-heading">{t('pk_calc.basic')}</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-sm">
                            Dose (mg)
                            <input
                                type="number"
                                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] p-2"
                                value={doseMG}
                                onChange={e => setDoseMG(num(e.target.value))}
                            />
                        </label>
                        <label className="text-sm">
                            Body weight (kg)
                            <input
                                type="number"
                                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] p-2"
                                value={bodyWeightKG}
                                onChange={e => setBodyWeightKG(num(e.target.value))}
                            />
                        </label>
                        <label className="text-sm">
                            Birth year
                            <input
                                type="number"
                                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] p-2"
                                value={birthYear}
                                onChange={e => setBirthYear(num(e.target.value))}
                            />
                        </label>
                        {isSublingual && (
                            <label className="text-sm">
                                Hold (min)
                                <input
                                    type="number"
                                    className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] p-2"
                                    value={holdMin}
                                    onChange={e => setHoldMin(num(e.target.value))}
                                />
                            </label>
                        )}
                        {isGel && (
                            <label className="text-sm">
                                Gel site
                                <select
                                    className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] p-2"
                                    value={gelSite}
                                    onChange={e => setGelSite(num(e.target.value))}
                                >
                                    <option value={0}>arm</option>
                                    <option value={1}>thigh</option>
                                    <option value={2}>scrotal</option>
                                </select>
                            </label>
                        )}
                        {isPatchLike && (
                            <>
                                <label className="text-sm">
                                    Release rate (µg/day)
                                    <input
                                        type="number"
                                        className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] p-2"
                                        value={releaseRate}
                                        onChange={e => setReleaseRate(num(e.target.value))}
                                    />
                                </label>
                                <label className="text-sm">
                                    Wear (h)
                                    <input
                                        type="number"
                                        className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] p-2"
                                        value={wearH}
                                        onChange={e => setWearH(num(e.target.value))}
                                    />
                                </label>
                            </>
                        )}
                    </div>
                </section>

                {/* Formula derivation */}
                <section className="space-y-3">
                    <h2 className="group-heading">{t('pk_calc.derivation')}</h2>
                    <div className="space-y-2 rounded border border-[var(--border)] p-3">
                        {result.derivation.map((step, i) => (
                            <div key={i} className="text-sm">
                                <div className="font-medium">{step.title}</div>
                                <div className="font-mono text-xs text-[var(--text-muted)]">{step.formula}</div>
                                {step.result && <div className="text-xs">= {step.result}</div>}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Result table */}
                <section className="space-y-3">
                    <h2 className="group-heading">{t('pk_calc.results')}</h2>
                    <div className="overflow-x-auto rounded border border-[var(--border)]">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--border)]">
                                    <th className="p-2 text-start">Metric</th>
                                    <th className="p-2 text-start">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-[var(--border)]">
                                    <td className="p-2">Peak level</td>
                                    <td className="p-2">{result.peak.value.toFixed(2)} pg/mL</td>
                                </tr>
                                <tr className="border-b border-[var(--border)]">
                                    <td className="p-2">Time to peak</td>
                                    <td className="p-2">{result.peak.timeH.toFixed(2)} h</td>
                                </tr>
                                <tr className="border-b border-[var(--border)]">
                                    <td className="p-2">Time below 200 pg/mL</td>
                                    <td className="p-2">
                                        {result.timeBelow200H === null
                                            ? 'never'
                                            : result.timeBelow200H.toFixed(2) + ' h'}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="p-2">Time below 100 pg/mL</td>
                                    <td className="p-2">
                                        {result.timeBelow100H === null
                                            ? 'never'
                                            : result.timeBelow100H.toFixed(2) + ' h'}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <p className="text-xs text-[var(--text-muted)]">
                    教学演示用，简化模型，不作为给药依据。参数仅影响本页计算，不会写回全局 PK 参数。
                </p>

            </div>
        </div>
    );
};

export default PKCalculationSandbox;
