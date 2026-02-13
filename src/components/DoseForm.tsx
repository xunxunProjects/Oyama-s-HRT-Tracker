import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import CustomSelect from './CustomSelect';
import DateTimePicker from './DateTimePicker';
import { getRouteIcon, formatDate, formatTime, getEsterIcon } from '../utils/helpers';
import { Route, Ester, ExtraKey, DoseEvent, SL_TIER_ORDER, SublingualTierParams, getBioavailabilityMultiplier, getToE2Factor } from '../../logic';
import { Plus, Minus, Calendar, Clock, Hash, Percent, Save, Trash2, Info, ChevronRight, Bookmark, X, ChevronDown, Check } from 'lucide-react';
import InjectionFields from './dose_form/InjectionFields';
import OralFields from './dose_form/OralFields';
import SublingualFields from './dose_form/SublingualFields';
import GelFields from './dose_form/GelFields';
import PatchFields from './dose_form/PatchFields';

export interface DoseTemplate {
    id: string;
    name: string;
    route: Route;
    ester: Ester;
    doseMG: number;
    extras: Partial<Record<ExtraKey, number>>;
    createdAt: number;
}

type DoseLevelKey = 'low' | 'medium' | 'high' | 'very_high' | 'above';

type DoseGuideConfig = {
    unitKey: 'mg_day' | 'ug_day' | 'mg_week';
    thresholds: [number, number, number, number];
    requiresRate?: boolean;
};

const DOSE_GUIDE_CONFIG: Partial<Record<Route, DoseGuideConfig>> = {
    [Route.oral]: { unitKey: 'mg_day', thresholds: [2, 4, 8, 12] },
    [Route.sublingual]: { unitKey: 'mg_day', thresholds: [1, 2, 4, 6] },
    [Route.patchApply]: { unitKey: 'ug_day', thresholds: [100, 200, 400, 600], requiresRate: true },
    [Route.gel]: { unitKey: 'mg_day', thresholds: [1.5, 3, 6, 9] },
    [Route.injection]: { unitKey: 'mg_week', thresholds: [1, 2, 4, 6] },
};

const LEVEL_BADGE_STYLES: Record<DoseLevelKey, string> = {
    low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
    medium: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200',
    high: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
    very_high: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
    above: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
};

const LEVEL_CONTAINER_STYLES: Record<DoseLevelKey | 'neutral', string> = {
    low: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30',
    medium: 'bg-sky-50 border-sky-100 dark:bg-sky-900/10 dark:border-sky-900/30',
    high: 'bg-amber-50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30',
    very_high: 'bg-rose-50 border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/30',
    above: 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30',
    neutral: 'bg-[var(--color-m3-surface-container)] border-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-surface-container-high)] dark:border-[var(--color-m3-dark-outline-variant)]'
};

const formatGuideNumber = (val: number) => {
    if (Number.isInteger(val)) return val.toString();
    const rounded = val < 1 ? val.toFixed(2) : val.toFixed(1);
    return rounded.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
};

const SL_POINTS = SL_TIER_ORDER
    .map((k, idx) => ({ idx, key: k, hold: SublingualTierParams[k].hold, theta: SublingualTierParams[k].theta }))
    .sort((a, b) => a.hold - b.hold);

const thetaFromHold = (holdMin: number): number => {
    if (holdMin <= 0) return 0;
    if (SL_POINTS.length === 0) return 0.11;
    const h = Math.max(1, holdMin);
    // Linear interpolation with endpoint extrapolation
    for (let i = 0; i < SL_POINTS.length - 1; i++) {
        const p1 = SL_POINTS[i];
        const p2 = SL_POINTS[i + 1];
        if (h >= p1.hold && h <= p2.hold) {
            const t = (h - p1.hold) / (p2.hold - p1.hold || 1);
            return Math.min(1, Math.max(0, p1.theta + (p2.theta - p1.theta) * t));
        }
    }
    // Extrapolate below first or above last segment
    if (h < SL_POINTS[0].hold) {
        const p1 = SL_POINTS[0];
        const p2 = SL_POINTS[1];
        const slope = (p2.theta - p1.theta) / (p2.hold - p1.hold || 1);
        return Math.min(1, Math.max(0, p1.theta + (h - p1.hold) * slope));
    }
    const pLast = SL_POINTS[SL_POINTS.length - 1];
    const pPrev = SL_POINTS[SL_POINTS.length - 2];
    const slope = (pLast.theta - pPrev.theta) / (pLast.hold - pPrev.hold || 1);
    return Math.min(1, Math.max(0, pLast.theta + (h - pLast.hold) * slope));
};

const holdFromTheta = (thetaVal: number): number => {
    if (SL_POINTS.length === 0) return 10;
    const th = thetaVal;
    for (let i = 0; i < SL_POINTS.length - 1; i++) {
        const p1 = SL_POINTS[i];
        const p2 = SL_POINTS[i + 1];
        const minTh = Math.min(p1.theta, p2.theta);
        const maxTh = Math.max(p1.theta, p2.theta);
        if (th >= minTh && th <= maxTh) {
            const t = (th - p1.theta) / (p2.theta - p1.theta || 1);
            return p1.hold + (p2.hold - p1.hold) * t;
        }
    }
    // Extrapolate
    if (th < SL_POINTS[0].theta) {
        const p1 = SL_POINTS[0];
        const p2 = SL_POINTS[1];
        const slope = (p2.hold - p1.hold) / (p2.theta - p1.theta || 1);
        return Math.max(1, p1.hold + (th - p1.theta) * slope);
    }
    const pLast = SL_POINTS[SL_POINTS.length - 1];
    const pPrev = SL_POINTS[SL_POINTS.length - 2];
    const slope = (pLast.hold - pPrev.hold) / (pLast.theta - pPrev.theta || 1);
    return Math.max(1, pLast.hold + (th - pLast.theta) * slope);
};

interface DoseFormProps {
    eventToEdit: DoseEvent | null;
    onSave: (event: DoseEvent) => void;
    onCancel: () => void;
    onDelete: (id: string) => void;
    templates: DoseTemplate[];
    onSaveTemplate: (template: DoseTemplate) => void;
    onDeleteTemplate: (id: string) => void;
    isInline?: boolean;
}

const DoseForm: React.FC<DoseFormProps> = ({ eventToEdit, onSave, onCancel, onDelete, templates = [], onSaveTemplate, onDeleteTemplate, isInline = false }) => {
    const { t, lang } = useTranslation();
    const { showDialog } = useDialog();
    const dateInputRef = useRef<HTMLInputElement>(null);
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const isInitializingRef = useRef(false);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);
    const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
    const [templateName, setTemplateName] = useState('');

    // Form State
    const [dateStr, setDateStr] = useState("");
    const [route, setRoute] = useState<Route>(Route.injection);
    const [ester, setEster] = useState<Ester>(Ester.EV);

    const [rawDose, setRawDose] = useState("");
    const [e2Dose, setE2Dose] = useState("");

    const [patchMode, setPatchMode] = useState<"dose" | "rate">("dose");
    const [patchRate, setPatchRate] = useState("");

    const [gelSite, setGelSite] = useState(0); // Index in GEL_SITE_ORDER

    const [slTier, setSlTier] = useState(2);
    const [useCustomTheta, setUseCustomTheta] = useState(false);
    const [customHoldInput, setCustomHoldInput] = useState<string>("10");
    const [customHoldValue, setCustomHoldValue] = useState<number>(10);
    const [lastEditedField, setLastEditedField] = useState<'raw' | 'bio'>('bio');

    const slExtras = useMemo(() => {
        if (route !== Route.sublingual) return null;
        if (useCustomTheta) {
            const theta = thetaFromHold(customHoldValue);
            return { [ExtraKey.sublingualTheta]: theta };
        }
        return { [ExtraKey.sublingualTier]: slTier };
    }, [route, useCustomTheta, customHoldValue, slTier]);

    const bioMultiplier = useMemo(() => {
        const extrasForCalc = slExtras ?? {};
        if (route === Route.gel) {
            extrasForCalc[ExtraKey.gelSite] = gelSite;
        }
        return getBioavailabilityMultiplier(route, ester, extrasForCalc);
    }, [route, ester, slExtras, gelSite]);

    useEffect(() => {
        isInitializingRef.current = true;
        if (eventToEdit) {
            const d = new Date(eventToEdit.timeH * 3600000);
            const iso = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setDateStr(iso);
            setRoute(eventToEdit.route);
            setEster(eventToEdit.ester);

            if (eventToEdit.route === Route.patchApply && eventToEdit.extras[ExtraKey.releaseRateUGPerDay]) {
                setPatchMode("rate");
                setPatchRate(eventToEdit.extras[ExtraKey.releaseRateUGPerDay].toString());
                setE2Dose("");
                setRawDose("");
            } else {
                setPatchMode("dose");
                const factor = getToE2Factor(eventToEdit.ester);
                const e2Val = eventToEdit.doseMG * factor;
                setE2Dose(e2Val.toFixed(3));

                if (eventToEdit.ester !== Ester.E2) {
                    setRawDose(eventToEdit.doseMG.toFixed(3));
                    setLastEditedField('raw');
                } else {
                    setRawDose(eventToEdit.doseMG.toFixed(3));
                    setLastEditedField('bio');
                }
            }

            if (eventToEdit.route === Route.sublingual) {
                if (eventToEdit.extras[ExtraKey.sublingualTier] !== undefined) {
                    setSlTier(eventToEdit.extras[ExtraKey.sublingualTier]);
                    setUseCustomTheta(false);
                    const tierKey = SL_TIER_ORDER[eventToEdit.extras[ExtraKey.sublingualTier]] || 'standard';
                    const hold = SublingualTierParams[tierKey]?.hold ?? 10;
                    setCustomHoldValue(hold);
                    setCustomHoldInput(hold.toString());
                } else if (eventToEdit.extras[ExtraKey.sublingualTheta] !== undefined) {
                    const thetaVal = eventToEdit.extras[ExtraKey.sublingualTheta];
                    setUseCustomTheta(true);
                    const safeTheta = (typeof thetaVal === 'number' && Number.isFinite(thetaVal)) ? thetaVal : 0.11;
                    const hold = Math.max(1, Math.min(60, holdFromTheta(safeTheta)));
                    setCustomHoldValue(hold);
                    setCustomHoldInput(hold.toString());
                } else {
                    setUseCustomTheta(false);
                    setCustomHoldValue(10);
                    setCustomHoldInput("10");
                }
            } else {
                setUseCustomTheta(false);
                setCustomHoldValue(10);
                setCustomHoldInput("10");
            }

            if (eventToEdit.route === Route.gel) {
                setGelSite(eventToEdit.extras[ExtraKey.gelSite] ?? 0);
            } else {
                setGelSite(0);
            }

        } else {
            const now = new Date();
            const iso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setDateStr(iso);
            setRoute(Route.injection);
            setEster(Ester.EV);
            setRawDose("");
            setE2Dose("");
            setPatchMode("dose");
            setPatchRate("");
            setSlTier(2);
            setGelSite(0);
            setUseCustomTheta(false);
            setCustomHoldValue(10);
            setCustomHoldInput("10");
            setLastEditedField('bio');
        }

        // Use timeout to allow state to settle
        const timer = setTimeout(() => {
            isInitializingRef.current = false;
        }, 0);
        return () => clearTimeout(timer);
    }, [eventToEdit]); // Removed isOpen dependency as component mounts only when needed

    const handleRawChange = (val: string) => {
        setRawDose(val);
        setLastEditedField('raw');
        const v = parseFloat(val);
        if (!isNaN(v)) {
            const factor = getToE2Factor(ester) || 1;
            const e2Equivalent = v * factor;
            setE2Dose(e2Equivalent.toFixed(3));
        } else {
            setE2Dose("");
        }
    };

    const handleE2Change = (val: string) => {
        setE2Dose(val);
        setLastEditedField('bio');
        const v = parseFloat(val);
        if (!isNaN(v)) {
            const factor = getToE2Factor(ester) || 1;
            if (ester === Ester.E2) {
                setRawDose(v.toFixed(3));
            } else {
                setRawDose((v / factor).toFixed(3));
            }
        } else {
            setRawDose("");
        }
    };

    useEffect(() => {
        if (isInitializingRef.current || lastEditedField !== 'raw' || !rawDose) return;
        handleRawChange(rawDose);
    }, [bioMultiplier, ester, route]);

    useEffect(() => {
        if (isInitializingRef.current || lastEditedField !== 'bio' || !e2Dose) return;
        handleE2Change(e2Dose);
    }, [bioMultiplier, ester, route]);

    const [isSaving, setIsSaving] = useState(false);

    const handleSaveAsTemplate = () => {
        if (!templateName.trim()) {
            showDialog('alert', t('template.name_required'));
            return;
        }

        const template: DoseTemplate = {
            id: uuidv4(),
            name: templateName.trim(),
            route,
            ester,
            doseMG: parseFloat(rawDose) || 0,
            extras: {},
            createdAt: Date.now()
        };

        if (route === Route.sublingual && slExtras) {
            Object.assign(template.extras, slExtras);
        }
        if (route === Route.gel) {
            template.extras[ExtraKey.gelSite] = gelSite;
        }
        if (route === Route.patchApply && patchMode === 'rate') {
            template.extras[ExtraKey.releaseRateUGPerDay] = parseFloat(patchRate) || 0;
        }

        onSaveTemplate(template);
        setShowSaveTemplateDialog(false);
        setTemplateName('');
        showDialog('alert', t('template.saved'));
    };

    const handleLoadTemplate = (template: DoseTemplate) => {
        setRoute(template.route);
        setEster(template.ester);
        setRawDose(template.doseMG.toFixed(3));

        const factor = getToE2Factor(template.ester) || 1;
        const e2Val = template.doseMG * factor;
        setE2Dose(e2Val.toFixed(3));

        if (template.route === Route.patchApply && template.extras[ExtraKey.releaseRateUGPerDay]) {
            setPatchMode('rate');
            setPatchRate(template.extras[ExtraKey.releaseRateUGPerDay].toString());
        }

        if (template.route === Route.sublingual) {
            if (template.extras[ExtraKey.sublingualTier] !== undefined) {
                setSlTier(template.extras[ExtraKey.sublingualTier]);
                setUseCustomTheta(false);
            } else if (template.extras[ExtraKey.sublingualTheta] !== undefined) {
                const theta = template.extras[ExtraKey.sublingualTheta];
                const hold = Math.max(1, Math.min(60, holdFromTheta(typeof theta === 'number' ? theta : 0.11)));
                setCustomHoldValue(hold);
                setCustomHoldInput(hold.toString());
                setUseCustomTheta(true);
            }
        }

        if (template.route === Route.gel && template.extras[ExtraKey.gelSite] !== undefined) {
            setGelSite(template.extras[ExtraKey.gelSite]);
        }

        setShowTemplateMenu(false);
        showDialog('alert', t('template.loaded'));
    };

    const handleSave = () => {
        if (isSaving) return;
        setIsSaving(true);
        let timeH = new Date(dateStr).getTime() / 3600000;
        if (isNaN(timeH)) {
            timeH = new Date().getTime() / 3600000;
        }

        let e2Equivalent = parseFloat(e2Dose);
        if (isNaN(e2Equivalent)) e2Equivalent = 0;

        if (ester === Ester.EV && (route === Route.injection || route === Route.sublingual || route === Route.oral)) {
            const rawVal = parseFloat(rawDose);
            if (Number.isFinite(rawVal)) {
                const factor = getToE2Factor(ester) || 1;
                e2Equivalent = rawVal * factor;
            }
        }
        let finalDose = 0;

        const extras: any = {};
        const nonPositiveMsg = t('error.nonPositive');

        if (route === Route.sublingual && useCustomTheta) {
            if (!Number.isFinite(customHoldValue) || customHoldValue < 1) {
                showDialog('alert', t('error.slHoldMinOne'));
                setIsSaving(false);
                return;
            }
        }

        if (route === Route.patchApply && patchMode === "rate") {
            const rateVal = parseFloat(patchRate);
            if (!Number.isFinite(rateVal) || rateVal <= 0) {
                showDialog('alert', nonPositiveMsg);
                setIsSaving(false);
                return;
            }
            finalDose = 0;
            extras[ExtraKey.releaseRateUGPerDay] = rateVal;
        } else if (route === Route.patchApply && patchMode === "dose") {
            const raw = parseFloat(rawDose);
            if (!rawDose || rawDose.trim() === '' || !Number.isFinite(raw) || raw <= 0) {
                showDialog('alert', nonPositiveMsg);
                setIsSaving(false);
                return;
            }
            finalDose = raw;
        } else if (route !== Route.patchRemove) {
            if (!e2Dose || e2Dose.trim() === '' || !Number.isFinite(e2Equivalent) || e2Equivalent <= 0) {
                showDialog('alert', nonPositiveMsg);
                setIsSaving(false);
                return;
            }
            const factor = getToE2Factor(ester) || 1;
            finalDose = (ester === Ester.E2) ? e2Equivalent : e2Equivalent / factor;
        }

        if (route === Route.sublingual && slExtras) {
            Object.assign(extras, slExtras);
        }

        if (route === Route.gel) {
            extras[ExtraKey.gelSite] = gelSite;
        }

        const newEvent: DoseEvent = {
            id: eventToEdit?.id || uuidv4(),
            route,
            ester: (route === Route.patchRemove || route === Route.patchApply || route === Route.gel) ? Ester.E2 : ester,
            timeH,
            doseMG: finalDose,
            extras
        };

        onSave(newEvent);
        setIsSaving(false);
    };

    const availableEsters = useMemo(() => {
        switch (route) {
            case Route.injection:
                return [Ester.EB, Ester.EV, Ester.EC, Ester.EN];
            case Route.oral:
                return [Ester.E2, Ester.EV, Ester.CPA];
            case Route.sublingual:
                return [Ester.E2, Ester.EV];
            default:
                return [Ester.E2];
        }
    }, [route]);

    useEffect(() => {
        if (!availableEsters.includes(ester)) {
            setEster(availableEsters[0]);
        }
    }, [availableEsters, ester]);

    const doseGuide = useMemo(() => {
        if (ester === Ester.CPA) return null;
        const cfg = DOSE_GUIDE_CONFIG[route];
        if (!cfg) return null;
        if (route === Route.patchApply && patchMode === "dose" && cfg.requiresRate) {
            return { config: cfg, level: null, value: null, showRateHint: true as const };
        }
        const rawVal = route === Route.patchApply ? parseFloat(patchRate) : parseFloat(e2Dose);
        const value = Number.isFinite(rawVal) && rawVal > 0 ? rawVal : null;
        let level: DoseLevelKey | null = null;
        if (value !== null) {
            const [low, medium, high, veryHigh] = cfg.thresholds;
            if (value <= low) level = 'low';
            else if (value <= medium) level = 'medium';
            else if (value <= high) level = 'high';
            else if (value <= veryHigh) level = 'very_high';
            else level = 'above';
        }
        return { config: cfg, level, value, showRateHint: false as const };
    }, [route, patchMode, patchRate, e2Dose, ester]);

    const tierKey = SL_TIER_ORDER[slTier] || "standard";
    const currentTheta = SublingualTierParams[tierKey]?.theta || 0.11;
    const customTheta = thetaFromHold(customHoldValue);
    const guideUnitLabel = doseGuide?.config ? t(`dose.guide.unit.${doseGuide.config.unitKey}`) : "";
    const guideRangeText = doseGuide?.config
        ? [
            `${t('dose.guide.level.low')} ≤ ${formatGuideNumber(doseGuide.config.thresholds[0])} ${guideUnitLabel}`,
            `${t('dose.guide.level.medium')} ≤ ${formatGuideNumber(doseGuide.config.thresholds[1])} ${guideUnitLabel}`,
            `${t('dose.guide.level.high')} ≤ ${formatGuideNumber(doseGuide.config.thresholds[2])} ${guideUnitLabel}`,
            `${t('dose.guide.level.very_high')} ≤ ${formatGuideNumber(doseGuide.config.thresholds[3])} ${guideUnitLabel}`,
        ].join(' · ')
        : "";
    const guideContainerClass = doseGuide
        ? (
            doseGuide.level
                ? LEVEL_CONTAINER_STYLES[doseGuide.level]
                : (doseGuide.showRateHint ? LEVEL_CONTAINER_STYLES.high : LEVEL_CONTAINER_STYLES.neutral)
        )
        : LEVEL_CONTAINER_STYLES.neutral;
    const guideBadgeClass = doseGuide?.level ? LEVEL_BADGE_STYLES[doseGuide.level] : "";

    return (
        <div className={`flex flex-col h-full bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] transition-colors duration-300 ${isInline ? 'rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-1)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]' : ''}`}>

            {/* Save Template Dialog Overlay */}
            {showSaveTemplateDialog && createPortal(
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] transition-all duration-300">
                    <div className="bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] p-6 w-full max-w-sm mx-4 border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] animate-m3-decelerate">
                        <h4 className="font-display text-lg font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] mb-4">{t('template.save_title')}</h4>
                        <input
                            type="text"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            placeholder={t('template.name_placeholder')}
                            className="w-full p-3 border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] rounded-[var(--radius-md)] focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] outline-none mb-4 placeholder-[var(--color-m3-outline)]"
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowSaveTemplateDialog(false); setTemplateName(''); }}
                                className="flex-1 px-4 py-2 bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] rounded-[var(--radius-full)] hover:bg-[var(--color-m3-surface-container-high)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] font-bold transition-colors"
                            >
                                {t('btn.cancel')}
                            </button>
                            <button
                                onClick={handleSaveAsTemplate}
                                className="flex-1 px-4 py-2 bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] rounded-[var(--radius-full)] font-bold shadow-[var(--shadow-m3-1)] transition-colors"
                            >
                                {t('btn.save')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Header */}
            {!isInline && (
                <div className="p-6 md:p-8 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] flex justify-between items-center bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] shrink-0 transition-colors duration-300">
                    <h3 className="font-display text-xl font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        {eventToEdit ? t('modal.dose.edit_title') : t('modal.dose.add_title')}
                    </h3>
                    <div className="flex gap-2">
                        {/* Templates Button */}
                        {!eventToEdit && templates.length > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                                    className="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-[var(--radius-full)] hover:bg-amber-100 dark:hover:bg-amber-900/40 transition border border-amber-100 dark:border-amber-900/30"
                                    title={t('template.load_title')}
                                >
                                    <Bookmark size={20} className="text-amber-600 dark:text-amber-500" />
                                </button>
                                {showTemplateMenu && (
                                    <div className="absolute right-0 top-12 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-lg)] shadow-[var(--shadow-m3-3)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] w-64 max-h-80 overflow-y-auto z-20">
                                        <div className="p-2">
                                            {templates.map((template: DoseTemplate) => (
                                                <div key={template.id} className="group flex items-center justify-between p-3 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-md)]">
                                                    <button
                                                        onClick={() => handleLoadTemplate(template)}
                                                        className="flex-1 text-left"
                                                    >
                                                        <div className="text-sm font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{template.name}</div>
                                                        <div className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-1">
                                                            {t(`route.${template.route}`)} · {t(`ester.${template.ester}`)} · {template.doseMG.toFixed(2)} mg
                                                        </div>
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            showDialog('confirm', t('template.delete_confirm'), () => {
                                                                onDeleteTemplate(template.id);
                                                            });
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-[var(--radius-sm)] transition"
                                                    >
                                                        <Trash2 size={14} className="text-red-500" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <button onClick={onCancel} className="p-2 bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-highest)] rounded-[var(--radius-full)] hover:bg-[var(--color-m3-surface-container-highest)] transition">
                            <X size={20} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]" />
                        </button>
                    </div>
                </div>
            )}

            {/* Inline Header (Simpler) */}
            {isInline && (
                <div className="p-4 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] flex justify-between items-center bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-t-[var(--radius-xl)]">
                    <h3 className="text-sm font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] px-2">
                        {t('timeline.add_title')}
                    </h3>
                    <div className="flex gap-2">
                        {!eventToEdit && templates.length > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                                    className="p-2.5 bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-full)] hover:bg-[var(--color-m3-surface-container-high)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] transition border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] text-[var(--color-m3-on-surface-variant)] hover:text-amber-500"
                                >
                                    <Bookmark size={20} />
                                </button>
                                {showTemplateMenu && (
                                    <div className="absolute right-0 top-12 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-lg)] shadow-[var(--shadow-m3-3)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] w-72 max-h-80 overflow-y-auto z-20 p-2">
                                        {templates.map((template: DoseTemplate) => (
                                            <div key={template.id} className="group flex items-center justify-between p-3 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-md)] transition-colors">
                                                <button
                                                    onClick={() => handleLoadTemplate(template)}
                                                    className="flex-1 text-left"
                                                >
                                                    <div className="text-sm font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{template.name}</div>
                                                    <div className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-0.5 font-medium">
                                                        {t(`route.${template.route}`)} · {template.doseMG.toFixed(2)} mg
                                                    </div>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        showDialog('confirm', t('template.delete_confirm'), () => {
                                                            onDeleteTemplate(template.id);
                                                        });
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-2 text-[var(--color-m3-on-surface-variant)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-[var(--radius-full)] transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            )}

            <div className={`space-y-4 flex-1 overflow-y-auto ${isInline ? 'p-4' : 'p-5'}`}>
                {/* Time */}
                <div className="space-y-3 relative">
                    <label className="block text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider pl-1">{t('field.time')}</label>
                    <div
                        className="relative bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] rounded-[var(--radius-md)] p-3 border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] hover:border-[var(--color-m3-primary)] dark:hover:border-teal-400 transition-all cursor-pointer group"
                        onClick={() => setIsDatePickerOpen(true)}
                    >
                        <div className="flex items-center justify-between pointer-events-none">
                            <span className="text-lg font-bold font-mono text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] group-hover:text-[var(--color-m3-primary)] dark:group-hover:text-teal-400 transition-colors">
                                {formatDate(new Date(dateStr), lang)} <span className="text-base text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] ml-2">{formatTime(new Date(dateStr))}</span>
                            </span>
                            <Calendar size={18} className="text-[var(--color-m3-on-surface-variant)] group-hover:text-[var(--color-m3-primary)] dark:group-hover:text-teal-400 transition-colors" />
                        </div>
                    </div>

                    <DateTimePicker
                        isOpen={isDatePickerOpen}
                        onClose={() => setIsDatePickerOpen(false)}
                        initialDate={new Date(dateStr)}
                        onConfirm={(d) => {
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            const hours = String(d.getHours()).padStart(2, '0');
                            const mins = String(d.getMinutes()).padStart(2, '0');
                            setDateStr(`${year}-${month}-${day}T${hours}:${mins}`);
                            setIsDatePickerOpen(false);
                        }}
                    />
                </div>

                {/* Route */}
                <CustomSelect
                    label={t('field.route')}
                    value={route}
                    onChange={(val) => setRoute(val as Route)}
                    options={Object.values(Route).map(r => ({
                        value: r,
                        label: t(`route.${r}`),
                        icon: getRouteIcon(r)
                    }))}
                />

                {route === Route.patchRemove && (
                    <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-3 rounded-[var(--radius-md)]">
                        {t('beta.patch_remove')}
                    </div>
                )}

                {route !== Route.patchRemove && (
                    <>
                        {/* Ester Selection */}
                        {availableEsters.length > 1 && (
                            <CustomSelect
                                label={t('field.ester')}
                                value={ester}
                                onChange={(val) => setEster(val as Ester)}
                                options={availableEsters.map(e => ({
                                    value: e,
                                    label: t(`ester.${e}`),
                                    icon: getEsterIcon(e)
                                }))}
                            />
                        )}

                        <div className="mt-2">
                            {route === Route.injection && (
                                <InjectionFields
                                    ester={ester}
                                    rawDose={rawDose}
                                    e2Dose={e2Dose}
                                    onRawChange={handleRawChange}
                                    onE2Change={handleE2Change}
                                    isInitializing={isInitializingRef.current}
                                    route={route}
                                    lastEditedField={lastEditedField}
                                />
                            )}

                            {route === Route.oral && (
                                <OralFields
                                    ester={ester}
                                    rawDose={rawDose}
                                    e2Dose={e2Dose}
                                    onRawChange={handleRawChange}
                                    onE2Change={handleE2Change}
                                    isInitializing={isInitializingRef.current}
                                    route={route}
                                    lastEditedField={lastEditedField}
                                />
                            )}

                            {route === Route.sublingual && (
                                <SublingualFields
                                    ester={ester}
                                    rawDose={rawDose}
                                    e2Dose={e2Dose}
                                    onRawChange={handleRawChange}
                                    onE2Change={handleE2Change}
                                    slTier={slTier}
                                    setSlTier={setSlTier}
                                    useCustomTheta={useCustomTheta}
                                    setUseCustomTheta={setUseCustomTheta}
                                    customHoldInput={customHoldInput}
                                    setCustomHoldInput={setCustomHoldInput}
                                    customHoldValue={customHoldValue}
                                    setCustomHoldValue={setCustomHoldValue}
                                    holdFromTheta={holdFromTheta}
                                    thetaFromHold={thetaFromHold}
                                    isInitializing={isInitializingRef.current}
                                    route={route}
                                    lastEditedField={lastEditedField}
                                />
                            )}

                            {route === Route.gel && (
                                <GelFields
                                    gelSite={gelSite}
                                    setGelSite={setGelSite}
                                    e2Dose={e2Dose}
                                    onE2Change={handleE2Change}
                                />
                            )}

                            {route === Route.patchApply && (
                                <PatchFields
                                    patchMode={patchMode}
                                    setPatchMode={setPatchMode}
                                    patchRate={patchRate}
                                    setPatchRate={setPatchRate}
                                    rawDose={rawDose}
                                    onRawChange={handleRawChange}
                                    route={route}
                                />
                            )}
                        </div>

                        {doseGuide && (
                            <div className={`mt-3 p-3 rounded-[var(--radius-lg)] border ${guideContainerClass} flex gap-3 transition-colors duration-300`}>
                                <Info className="w-5 h-5 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{t('dose.guide.title')}</span>
                                        {doseGuide.level && (
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-[var(--radius-full)] ${guideBadgeClass}`}>
                                                {t(`dose.guide.level.${doseGuide.level}`)}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                                        {t('dose.guide.current')}: {doseGuide.value !== null ? `${formatGuideNumber(doseGuide.value)} ${guideUnitLabel}` : t('dose.guide.current_blank')}
                                    </p>
                                    {guideRangeText && (
                                        <p className="text-[11px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] leading-relaxed">
                                            {t('dose.guide.reference')}: {guideRangeText}
                                        </p>
                                    )}
                                    {doseGuide.showRateHint && (
                                        <p className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed">
                                            {t('dose.guide.patch_rate_hint')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer Buttons */}
            <div className={`px-3 py-2.5 border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] flex justify-between items-center shrink-0 transition-colors duration-300 ${isInline ? 'rounded-b-[var(--radius-xl)]' : ''}`}>
                <button
                    onClick={() => setShowSaveTemplateDialog(true)}
                    className="p-2 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-[var(--color-m3-primary)] dark:hover:text-teal-400 hover:bg-[var(--color-m3-primary-container)]/40 dark:hover:bg-teal-900/20 rounded-[var(--radius-full)] transition-all flex items-center gap-1.5 text-xs font-bold"
                >
                    <Bookmark size={16} />
                </button>
                {eventToEdit && (
                    <button
                        onClick={() => {
                            onDelete(eventToEdit.id);
                            onCancel();
                        }}
                        className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-[var(--radius-full)] transition-all"
                    >
                        <Trash2 size={18} />
                    </button>
                )}

                <div className="flex gap-2 ml-auto">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-5 py-2.5 bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] rounded-[var(--radius-full)] font-bold text-sm transition-all disabled:opacity-70 flex items-center justify-center gap-1.5 shadow-[var(--shadow-m3-1)]"
                    >
                        {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save size={16} />
                                <span>{t('btn.save')}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DoseForm;
