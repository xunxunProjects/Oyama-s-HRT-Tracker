import React, { useState, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import CustomSelect from './CustomSelect';
import DateTimePicker from './DateTimePicker';
import {
    Route,
    Ester,
    ExtraKey,
    DoseEvent,
    SL_TIER_ORDER,
    SublingualTierParams,
    getBioavailabilityMultiplier,
    getToE2Factor,
    getDoseAdvisory,
    isEstradiolEster,
    isKnownEster,
    sublingualThetaFromHold as thetaFromHold,
    sublingualHoldFromTheta as holdFromTheta,
} from '../../logic';
import { Save, Trash, Info, Bookmark, BookmarkPlus, Close, ChevronDown, Check, Warning, External, Busy } from './icons';
import { DoseAdvisoryLine } from './DoseAdvisory';
import { LOCALE_MAP } from '../utils/helpers';
import { doseOf, drugLabel, productNames } from '../utils/regimenText';
import InjectionFields from './dose_form/InjectionFields';
import OralFields from './dose_form/OralFields';
import SublingualFields from './dose_form/SublingualFields';
import GelFields from './dose_form/GelFields';
import PatchFields from './dose_form/PatchFields';
import QuickDoseButtons, { QuickDose } from './dose_form/QuickDoseButtons';
import { useHRTMode } from '../contexts/HRTModeContext';

import { useEscapeLayer } from './CustomSelect';
import GuideFold from './dose_form/GuideFold';
import Tick from './Tick';
import { cleanDoseMG } from '../utils/cleanDose';

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
};

const LEVEL_BADGE_STYLES: Record<DoseLevelKey, string> = {
    low: 'text-[var(--status-positive)]',
    medium: 'text-[var(--status-info)]',
    high: 'text-[var(--warning)]',
    very_high: 'text-[var(--danger)]',
    above: 'text-[var(--danger)]',
};

const formatGuideNumber = (val: number) => {
    if (Number.isInteger(val)) return val.toString();
    const rounded = val < 1 ? val.toFixed(2) : val.toFixed(1);
    return rounded.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
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
    hideHeader?: boolean;
    quickDoses?: QuickDose[];
    onAddQuickDose?: (dose: QuickDose) => void;
    onDeleteQuickDose?: (id: string) => void;
    /** Existing doses: a new dose starts on the route and drug of the last
     *  one, and recent use shows whether it is already running high. */
    events?: DoseEvent[];
}

// A folded-away part leaves the tab order with it (as in Plan and Supplies).
const inertWhen = (hidden: boolean) => (hidden ? ({ inert: '' } as Record<string, unknown>) : {});

// A stored dose as it is put back into a field: "12.5", not "12.500". Still
// cut at three places, so a value an older version drifted (12.499934) comes
// back as 12.5 rather than all its digits, and parses to the same number the
// untrimmed string did.
const trimDose = (mg: number) => mg.toFixed(3).replace(/\.?0+$/, '');

// The route menu in a fixed order, the most used first. The Route enum's own
// order is what's stored and stays as it is. A route this list doesn't know
// yet still shows, at the end.
const ROUTE_MENU_ORDER = [
    Route.injection,
    Route.oral,
    Route.sublingual,
    Route.gel,
    Route.patchApply,
    Route.patchRemove,
];
const menuRoutes = (isTransmasc: boolean): Route[] => {
    const all = [...ROUTE_MENU_ORDER, ...Object.values(Route).filter(r => !ROUTE_MENU_ORDER.includes(r))];
    if (!isTransmasc) return all;
    // Transmasc: no oral/sublingual; no patches (T patches are uncommon and
    // not realistically modeled with the current µg/day scheme).
    return all.filter(
        r => r !== Route.oral && r !== Route.sublingual && r !== Route.patchApply && r !== Route.patchRemove,
    );
};

const DoseForm: React.FC<DoseFormProps> = ({
    eventToEdit,
    onSave,
    onCancel,
    onDelete,
    templates = [],
    onSaveTemplate,
    onDeleteTemplate,
    isInline = false,
    hideHeader = false,
    quickDoses,
    onAddQuickDose,
    onDeleteQuickDose,
    events = [],
}) => {
    const { t, lang } = useTranslation();
    const { showDialog } = useDialog();
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    // The Time row and the picker under it. Escape folds the picker away,
    // and focus on one of its fields would go down with it, dropped on the
    // page (in the Edit Dose modal, the next Tab started behind the modal),
    // so it is handed back to the Time row.
    const timeRowRef = useRef<HTMLDivElement>(null);
    const timeButtonRef = useRef<HTMLButtonElement>(null);
    const closeDatePicker = () => {
        if (timeRowRef.current?.contains(document.activeElement)) timeButtonRef.current?.focus();
        setIsDatePickerOpen(false);
    };
    const isInitializingRef = useRef(false);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);
    const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
    const [templateName, setTemplateName] = useState('');
    // Likewise for the template menu: closing it, by Escape, by choosing a
    // row or by deleting one (the dialog hands focus back to the row's delete
    // button first), takes focus from the row to the Load Template button.
    const templateMenuRef = useRef<HTMLDivElement>(null);
    const loadTemplateButtonRef = useRef<HTMLButtonElement>(null);
    const closeTemplateMenu = () => {
        if (templateMenuRef.current?.contains(document.activeElement)) loadTemplateButtonRef.current?.focus();
        setShowTemplateMenu(false);
    };
    useEscapeLayer(closeTemplateMenu, showTemplateMenu);
    // The name field and the bookmark button take turns in one spot, and the
    // hidden one is inert, so focus moves across with each swap instead of
    // being dropped on the page.
    const templateInputRef = useRef<HTMLInputElement>(null);
    const templateButtonRef = useRef<HTMLButtonElement>(null);
    const templateInputWasOpenRef = useRef(false);
    useEffect(() => {
        if (showSaveTemplateInput) templateInputRef.current?.focus();
        else if (templateInputWasOpenRef.current) templateButtonRef.current?.focus();
        templateInputWasOpenRef.current = showSaveTemplateInput;
    }, [showSaveTemplateInput]);

    // Form State
    const [dateStr, setDateStr] = useState('');
    const { isTransmasc } = useHRTMode();
    const [route, setRoute] = useState<Route>(Route.injection);
    const [ester, setEster] = useState<Ester>(isTransmasc ? Ester.TC : Ester.EV);
    // A drug code a newer version logged and this one doesn't know, from the
    // dose being edited or a template being loaded. It is offered on its own
    // route next to the known drugs, so changing the time or amount keeps it
    // rather than swapping in the route's first drug on save.
    const [foreignDrug, setForeignDrug] = useState<{ route: Route; ester: Ester } | null>(null);

    const [rawDose, setRawDose] = useState('');
    const [e2Dose, setE2Dose] = useState('');

    const [patchMode, setPatchMode] = useState<'dose' | 'rate'>('rate');
    const [patchRate, setPatchRate] = useState('');
    const [patchWearDays, setPatchWearDays] = useState('');

    const [gelSite, setGelSite] = useState(0); // Index in GEL_SITE_ORDER

    const [slTier, setSlTier] = useState(2);
    const [useCustomTheta, setUseCustomTheta] = useState(false);
    const [customHoldInput, setCustomHoldInput] = useState<string>('10');
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
        const extrasForCalc: Record<string, unknown> = slExtras ?? {};
        if (route === Route.gel) {
            extrasForCalc[ExtraKey.gelSite] = gelSite;
        }
        return getBioavailabilityMultiplier(route, ester, extrasForCalc);
    }, [route, ester, slExtras, gelSite]);

    // Puts a saved dose back into the form: a template, or for a new dose the
    // last one taken. withAmount: false keeps the route, drug and how it was
    // taken (hold time, gel site, wear time) but leaves the amount empty.
    const fillFrom = (preset: Pick<DoseTemplate, 'route' | 'ester' | 'doseMG' | 'extras'>, withAmount: boolean) => {
        setRoute(preset.route);
        setEster(preset.ester);
        if (!isKnownEster(preset.ester)) setForeignDrug({ route: preset.route, ester: preset.ester });

        if (withAmount) {
            setRawDose(trimDose(preset.doseMG));
            // Saved doses are in raw-ester mg, so mark the raw field as the
            // source of truth — otherwise handleSave would re-derive the dose from
            // the rounded E2-equivalent string and drift it (12.5 → 12.499934).
            setLastEditedField(preset.ester === Ester.E2 ? 'bio' : 'raw');

            const factor = getToE2Factor(preset.ester) || 1;
            const e2Val = preset.doseMG * factor;
            setE2Dose(trimDose(e2Val));

            // A patch saved by its total dose has no rate: open it in that mode,
            // or the dose would sit behind the empty rate field.
            if (preset.route === Route.patchApply) {
                const rate = preset.extras[ExtraKey.releaseRateUGPerDay];
                setPatchMode(rate ? 'rate' : 'dose');
                if (rate) setPatchRate(rate.toString());
            }
        }
        if (preset.route === Route.patchApply) {
            const wearH = preset.extras[ExtraKey.patchWearH];
            setPatchWearDays(
                typeof wearH === 'number' && Number.isFinite(wearH) && wearH > 0 ? (wearH / 24).toString() : '',
            );
        }

        if (preset.route === Route.sublingual) {
            if (preset.extras[ExtraKey.sublingualTier] !== undefined) {
                setSlTier(preset.extras[ExtraKey.sublingualTier]);
                setUseCustomTheta(false);
            } else if (preset.extras[ExtraKey.sublingualTheta] !== undefined) {
                const theta = preset.extras[ExtraKey.sublingualTheta];
                const hold = Math.max(1, Math.min(60, holdFromTheta(typeof theta === 'number' ? theta : 0.11)));
                setCustomHoldValue(hold);
                setCustomHoldInput(hold.toString());
                setUseCustomTheta(true);
            }
        }

        if (preset.route === Route.gel && preset.extras[ExtraKey.gelSite] !== undefined) {
            setGelSite(preset.extras[ExtraKey.gelSite]);
        }
    };

    useEffect(() => {
        isInitializingRef.current = true;
        if (eventToEdit) {
            const d = new Date(eventToEdit.timeH * 3600000);
            const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            setDateStr(iso);
            setRoute(eventToEdit.route);
            setEster(eventToEdit.ester);
            setForeignDrug(
                isKnownEster(eventToEdit.ester) ? null : { route: eventToEdit.route, ester: eventToEdit.ester },
            );

            if (eventToEdit.route === Route.patchApply && eventToEdit.extras[ExtraKey.releaseRateUGPerDay]) {
                setPatchMode('rate');
                setPatchRate(eventToEdit.extras[ExtraKey.releaseRateUGPerDay].toString());
                setE2Dose('');
                setRawDose('');
            } else {
                setPatchMode('dose');
                const factor = getToE2Factor(eventToEdit.ester);
                const e2Val = eventToEdit.doseMG * factor;
                setE2Dose(trimDose(e2Val));

                if (eventToEdit.ester !== Ester.E2) {
                    setRawDose(trimDose(eventToEdit.doseMG));
                    setLastEditedField('raw');
                } else {
                    setRawDose(trimDose(eventToEdit.doseMG));
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
                    const safeTheta = typeof thetaVal === 'number' && Number.isFinite(thetaVal) ? thetaVal : 0.11;
                    const hold = Math.max(1, Math.min(60, holdFromTheta(safeTheta)));
                    setCustomHoldValue(hold);
                    setCustomHoldInput(hold.toString());
                } else {
                    setUseCustomTheta(false);
                    setCustomHoldValue(10);
                    setCustomHoldInput('10');
                }
            } else {
                setUseCustomTheta(false);
                setCustomHoldValue(10);
                setCustomHoldInput('10');
            }

            if (eventToEdit.route === Route.gel) {
                setGelSite(eventToEdit.extras[ExtraKey.gelSite] ?? 0);
            } else {
                setGelSite(0);
            }

            const wearH = eventToEdit.extras[ExtraKey.patchWearH];
            if (
                eventToEdit.route === Route.patchApply &&
                typeof wearH === 'number' &&
                Number.isFinite(wearH) &&
                wearH > 0
            ) {
                setPatchWearDays((wearH / 24).toString());
            } else {
                setPatchWearDays('');
            }
        } else {
            const now = new Date();
            const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            setDateStr(iso);
            setRoute(isTransmasc ? Route.injection : Route.sublingual);
            setEster(isTransmasc ? Ester.TC : Ester.EV);
            setForeignDrug(null);
            setRawDose('');
            setE2Dose('');
            setPatchMode('rate');
            setPatchRate('');
            setPatchWearDays('');
            setSlTier(2);
            setGelSite(0);
            setUseCustomTheta(false);
            setCustomHoldValue(10);
            setCustomHoldInput('10');
            setLastEditedField('bio');

            // Most people log the same thing again, so a new dose starts on the
            // route and drug of the last one taken rather than on one fixed
            // pair. Not its amount: that stays a deliberate entry, which a tap
            // on a quick dose fills. A patch removal names no drug, and a
            // route this mode doesn't offer can't be chosen, so both are
            // passed over.
            const nowH = Date.now() / 3600000;
            const routes = menuRoutes(isTransmasc);
            const last = events.reduce<DoseEvent | null>(
                (best, ev) =>
                    ev.timeH <= nowH &&
                    ev.route !== Route.patchRemove &&
                    routes.includes(ev.route) &&
                    (!best || ev.timeH > best.timeH)
                        ? ev
                        : best,
                null,
            );
            if (last) fillFrom(last, false);
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
            // Mirrored in the same short form as the prefill (trimDose): the
            // number parses the same, and the field reads 3.82, not 3.820.
            setE2Dose(trimDose(e2Equivalent));
        } else {
            setE2Dose('');
        }
    };

    const handleE2Change = (val: string) => {
        setE2Dose(val);
        setLastEditedField('bio');
        const v = parseFloat(val);
        if (!isNaN(v)) {
            const factor = getToE2Factor(ester) || 1;
            if (ester === Ester.E2) {
                setRawDose(trimDose(v));
            } else {
                setRawDose(trimDose(v / factor));
            }
        } else {
            setRawDose('');
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
    const isSavingRef = useRef(false);

    // Why the last Save was refused, said under the dose fields instead of in
    // a dialog that hid them. It stands until any of the values it was about
    // changes, so it goes as soon as the field is fixed.
    const valuesKey = [route, ester, patchMode, rawDose, e2Dose, patchRate, useCustomTheta, customHoldValue].join('|');
    const [doseError, setDoseError] = useState<{ message: string; key: string } | null>(null);
    const shownDoseError = doseError && doseError.key === valuesKey ? doseError.message : null;
    const doseErrorId = React.useId();
    const fieldsRef = useRef<HTMLDivElement>(null);
    // Put the cursor in the field to fix: the first one marked, or for the
    // hold time (not a dose) the first field there is.
    useEffect(() => {
        if (!doseError) return;
        const box = fieldsRef.current;
        const field =
            box?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? box?.querySelector<HTMLElement>('input');
        field?.focus();
    }, [doseError]);

    // A template saved or loaded is confirmed by the drawn tick taking the
    // bookmark's place for a moment, instead of a dialog to dismiss.
    const [templateTick, setTemplateTick] = useState<'saved' | 'loaded' | null>(null);
    useEffect(() => {
        if (!templateTick) return;
        const timer = window.setTimeout(() => setTemplateTick(null), 1200);
        return () => window.clearTimeout(timer);
    }, [templateTick]);

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
            createdAt: Date.now(),
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
        if (route === Route.patchApply) {
            const wearDays = parseFloat(patchWearDays);
            if (Number.isFinite(wearDays) && wearDays > 0) {
                template.extras[ExtraKey.patchWearH] = wearDays * 24;
            }
        }

        onSaveTemplate(template);
        setShowSaveTemplateInput(false);
        setTemplateName('');
        setTemplateTick('saved');
    };

    const handleLoadTemplate = (template: DoseTemplate) => {
        fillFrom(template, true);
        setShowTemplateMenu(false);
        setTemplateTick('loaded');
    };

    const handleSave = () => {
        // Ref latch, not state: setIsSaving(true/false) within one synchronous
        // handler nets out to no visible change, so the disabled prop never
        // engaged and a double-click/double-tap could add the dose twice
        // (each click mints a fresh uuid in add mode).
        if (isSavingRef.current) return;
        isSavingRef.current = true;
        setIsSaving(true);
        const failSave = (msg: string) => {
            setDoseError({ message: msg, key: valuesKey });
            isSavingRef.current = false;
            setIsSaving(false);
        };
        let timeH = new Date(dateStr).getTime() / 3600000;
        if (isNaN(timeH)) {
            timeH = new Date().getTime() / 3600000;
        }

        let e2Equivalent = parseFloat(e2Dose);
        if (isNaN(e2Equivalent)) e2Equivalent = 0;
        let finalDose = 0;

        const extras: any = {};
        // An empty field asks for a dose; "greater than zero" is for a 0 typed.
        const doseMsg = (typed: string) =>
            typed.trim() === '' ? t('modal.dose.dose_required') : t('error.nonPositive');

        if (route === Route.sublingual && useCustomTheta) {
            if (!Number.isFinite(customHoldValue) || customHoldValue < 1) {
                failSave(t('error.slHoldMinOne'));
                return;
            }
        }

        if (route === Route.patchApply && patchMode === 'rate') {
            const rateVal = parseFloat(patchRate);
            if (!Number.isFinite(rateVal) || rateVal <= 0) {
                failSave(doseMsg(patchRate));
                return;
            }
            finalDose = 0;
            extras[ExtraKey.releaseRateUGPerDay] = rateVal;
        } else if (route === Route.patchApply && patchMode === 'dose') {
            const raw = parseFloat(rawDose);
            if (!rawDose || rawDose.trim() === '' || !Number.isFinite(raw) || raw <= 0) {
                failSave(doseMsg(rawDose));
                return;
            }
            finalDose = raw;
        } else if (route !== Route.patchRemove) {
            const rawVal = parseFloat(rawDose);
            if (ester !== Ester.E2 && lastEditedField === 'raw') {
                // doseMG is stored in raw-ester mg, and the raw field is what the
                // user typed (or a template/quick-dose filled). Use it directly:
                // round-tripping through the E2-equivalent string loses precision
                // to its toFixed(3) — e.g. 12.5 mg CPA saved as 12.499934.
                if (!rawDose || rawDose.trim() === '' || !Number.isFinite(rawVal) || rawVal <= 0) {
                    failSave(doseMsg(rawDose));
                    return;
                }
                finalDose = rawVal;
            } else {
                if (!e2Dose || e2Dose.trim() === '' || !Number.isFinite(e2Equivalent) || e2Equivalent <= 0) {
                    failSave(doseMsg(e2Dose));
                    return;
                }
                const factor = getToE2Factor(ester) || 1;
                finalDose = ester === Ester.E2 ? e2Equivalent : e2Equivalent / factor;
            }
        }

        if (route === Route.sublingual && slExtras) {
            Object.assign(extras, slExtras);
        }

        if (route === Route.gel) {
            extras[ExtraKey.gelSite] = gelSite;
        }

        if (route === Route.patchApply) {
            const wearDays = parseFloat(patchWearDays);
            if (Number.isFinite(wearDays) && wearDays > 0) {
                extras[ExtraKey.patchWearH] = wearDays * 24;
            }
        }

        const newEvent: DoseEvent = {
            id: eventToEdit?.id || uuidv4(),
            route,
            ester:
                route === Route.patchRemove || route === Route.patchApply || route === Route.gel
                    ? isTransmasc
                        ? Ester.T
                        : Ester.E2
                    : ester,
            timeH,
            doseMG: cleanDoseMG(finalDose),
            extras,
        };

        onSave(newEvent);
        // Every current mount point unmounts this form after a successful save;
        // the delayed re-arm is a safety net for any future persistent mount,
        // while still swallowing the double-click window.
        window.setTimeout(() => {
            isSavingRef.current = false;
            setIsSaving(false);
        }, 800);
    };

    const knownEsters = useMemo(() => {
        if (isTransmasc) {
            switch (route) {
                case Route.injection:
                    return [Ester.TC, Ester.TE, Ester.TU];
                case Route.gel:
                    return [Ester.T];
                default:
                    return [Ester.T];
            }
        }
        switch (route) {
            case Route.injection:
                return [Ester.EB, Ester.EV, Ester.EC, Ester.EN, Ester.EU, Ester.LEUP, Ester.TRIP];
            case Route.oral:
                return [Ester.E2, Ester.EV, Ester.CPA, Ester.SPIRO, Ester.BICA, Ester.MPA, Ester.RLX];
            case Route.sublingual:
                return [Ester.E2, Ester.EV];
            default:
                return [Ester.E2];
        }
    }, [route, isTransmasc]);
    const availableEsters = useMemo(
        () => (foreignDrug && foreignDrug.route === route ? [...knownEsters, foreignDrug.ester] : knownEsters),
        [knownEsters, foreignDrug, route],
    );

    const availableRoutes = useMemo(() => menuRoutes(isTransmasc), [isTransmasc]);

    useEffect(() => {
        if (!availableRoutes.includes(route)) {
            setRoute(availableRoutes[0]);
        }
    }, [availableRoutes, route]);

    // A route whose list doesn't hold the current drug starts on the drug last
    // logged by that route, then on the list's first. A new dose opens on the
    // last one taken, often a daily antiandrogen, and switching that to
    // Injection would otherwise land on whatever comes first (EB) rather than
    // the EV the person always injects.
    useEffect(() => {
        if (!availableEsters.includes(ester)) {
            let last: DoseEvent | null = null;
            for (const e of events) {
                if (e.route === route && availableEsters.includes(e.ester) && (!last || e.timeH > last.timeH)) last = e;
            }
            setEster(last?.ester ?? availableEsters[0]);
        }
    }, [availableEsters, ester, events, route]);

    const doseGuide = useMemo(() => {
        // The thresholds are estradiol's; they say nothing about anything else.
        if (!isEstradiolEster(ester)) return null;
        // The built-in dose thresholds (DOSE_GUIDE_CONFIG) are calibrated for
        // feminizing HRT (E2). They would be misleading for testosterone dosing,
        // so skip the guide entirely in transmasc mode.
        if (isTransmasc) return null;
        const cfg = DOSE_GUIDE_CONFIG[route];
        if (!cfg) return null;
        if (route === Route.patchApply && patchMode === 'dose' && cfg.requiresRate) {
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
    }, [route, patchMode, patchRate, e2Dose, ester, isTransmasc]);

    // Recent-use heads-up, based on doses already logged (not the still-unsaved
    // value being typed here). Covers CPA and injections too, which the static
    // per-dose guide above doesn't — see getDoseAdvisory in logic.ts.
    const doseAdvisory = useMemo(() => getDoseAdvisory(events), [events]);

    const guideUnitLabel = doseGuide?.config ? t(`dose.guide.unit.${doseGuide.config.unitKey}`) : '';
    const guideRangeText = doseGuide?.config
        ? `${doseGuide.config.thresholds.map(threshold => `≤ ${formatGuideNumber(threshold)}`).join(', ')} ${guideUnitLabel}`
        : '';
    const guideBadgeClass = doseGuide?.level ? LEVEL_BADGE_STYLES[doseGuide.level] : '';
    // The record a delete confirm is about, as its row reads: what, how much,
    // and how and when it was taken. With a dozen identical CPA rows the
    // time is what tells them apart.
    const describeDose = (ev: DoseEvent) => {
        const rate = ev.extras[ExtraKey.releaseRateUGPerDay];
        const what =
            ev.route === Route.patchRemove
                ? t('route.patchRemove')
                : doseOf(rate ? `${rate} µg/d` : `${trimDose(ev.doseMG)} mg`, drugLabel(ev.ester, t), t);
        const when = new Date(ev.timeH * 3600000).toLocaleString(LOCALE_MAP[lang] || 'en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
        return ev.route === Route.patchRemove
            ? `${what}\n${when}`
            : `${what}\n${t('dose.line_when')
                  .replace('{route}', t(`route.${ev.route}`))
                  .replace('{when}', when)}`;
    };

    const confirmAndOpenExternal = (url: string) => {
        const host = (() => {
            try {
                return new URL(url).hostname.replace(/^www\./, '');
            } catch {
                return url;
            }
        })();
        const confirmText = t('drawer.model_confirm').replace('mahiro.uk', host);
        showDialog('confirm', confirmText, () => {
            window.open(url, '_blank', 'noopener,noreferrer');
        });
    };
    const renderLoadTemplateControl = () => {
        // Hidden rather than greyed out while there is nothing to load: a dead
        // button gave no hint why. It appears once the bookmark button in the
        // footer has saved a first template.
        if (eventToEdit || templates.length === 0) return null;

        return (
            <div className="relative">
                <button
                    ref={loadTemplateButtonRef}
                    type="button"
                    onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                    aria-expanded={showTemplateMenu}
                    className="px-2 py-1 text-xs font-medium rounded flex items-center gap-1 text-[var(--accent-ink)] hover:bg-[var(--accent-subtle)] dark:hover:bg-[var(--accent-subtle)]/20"
                    title={t('template.load_title')}
                >
                    {/* The bookmark gives way to the tick for a moment once a
                        template is loaded, the swap CopyTick makes for Copy. */}
                    <span className="inline-grid shrink-0 place-items-center" aria-hidden="true">
                        <Bookmark
                            size={14}
                            data-hidden={templateTick === 'loaded'}
                            className="copy-glyph col-start-1 row-start-1"
                        />
                        <Tick
                            on={templateTick === 'loaded'}
                            size={14}
                            tone="current"
                            className="col-start-1 row-start-1"
                        />
                    </span>
                    <span>{t('template.load_title')}</span>
                </button>
                {showTemplateMenu && (
                    <div
                        ref={templateMenuRef}
                        className="absolute right-0 top-full mt-1 bg-[var(--field)] rounded-xl border border-[var(--border)] w-64 max-h-64 overflow-y-auto z-50"
                    >
                        <div className="py-1">
                            {templates.map((template: DoseTemplate) => (
                                <div
                                    key={template.id}
                                    className="group flex items-center justify-between px-3 py-2.5 hover:bg-[var(--surface-hover)] border-b border-[var(--border)] last:border-b-0"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            handleLoadTemplate(template);
                                            closeTemplateMenu();
                                        }}
                                        className="flex-1 text-left"
                                    >
                                        <div className="whitespace-pre-line text-sm font-medium text-[var(--text)]">
                                            {template.name.replaceAll(' · ', '\n')}
                                        </div>
                                        <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                                            <span className="block">{t(`route.${template.route}`)}</span>
                                            <span className="block">
                                                {template.extras[ExtraKey.releaseRateUGPerDay]
                                                    ? `${template.extras[ExtraKey.releaseRateUGPerDay]} µg/d`
                                                    : `${trimDose(template.doseMG)} mg`}
                                            </span>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={e => {
                                            e.stopPropagation();
                                            showDialog(
                                                'confirm',
                                                template.name,
                                                () => {
                                                    closeTemplateMenu();
                                                    onDeleteTemplate(template.id);
                                                },
                                                {
                                                    danger: true,
                                                    title: t('template.delete_confirm'),
                                                    confirmLabel: t('btn.delete'),
                                                },
                                            );
                                        }}
                                        // Shown on hover where there is one; at rest, muted, on a
                                        // touch screen, where it used to take taps unseen.
                                        className="tap-target opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)] rounded shrink-0"
                                        title={t('btn.delete')}
                                        aria-label={`${t('btn.delete')} ${template.name}`}
                                    >
                                        <Trash size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // A real form, so Enter in a field (or Go on a phone keyboard) saves.
    // noValidate: the browser's own bubbles would block a save over a step
    // mismatch the dose fields don't care about; handleSave checks the values.
    return (
        <form
            className="flex flex-col h-full"
            noValidate
            onSubmit={e => {
                e.preventDefault();
                handleSave();
            }}
        >
            {/* Save Template Dialog Overlay */}
            {/* Save Template Dialog Overlay (Removed) */}

            {/* Header */}
            {!isInline && !hideHeader && (
                <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center shrink-0">
                    <h3 className="text-base font-semibold text-[var(--text)]">
                        {eventToEdit ? t('modal.dose.edit_title') : t('modal.dose.add_title')}
                    </h3>
                    <div className="flex gap-2 items-center">
                        {renderLoadTemplateControl()}
                        <button
                            type="button"
                            onClick={onCancel}
                            className="p-1.5 hover:bg-[var(--surface-hover)] rounded-lg"
                            aria-label={t('btn.cancel')}
                        >
                            <Close size={18} className="text-[var(--text-muted)]" />
                        </button>
                    </div>
                </div>
            )}

            {/* Inline Header (Simpler) */}
            {isInline && !hideHeader && (
                <div className="pb-4 border-b border-[var(--border)] flex justify-between items-center">
                    <span className="text-[0.8125rem] font-semibold text-[var(--text-muted)]">
                        {t('timeline.add_title')}
                    </span>
                    {renderLoadTemplateControl()}
                </div>
            )}

            <div
                className={`space-y-4 flex-1 overflow-y-auto ${!isInline ? 'px-6 pb-4' : hideHeader ? 'pb-2' : 'pb-4'}`}
            >
                {/* Time */}
                <div ref={timeRowRef}>
                    <button
                        ref={timeButtonRef}
                        type="button"
                        onClick={() => setIsDatePickerOpen(v => !v)}
                        className="w-full flex items-center justify-between py-[18px] border-b border-[var(--border)] text-start"
                    >
                        <span className="text-[0.9375rem] text-[var(--text)]">{t('field.time')}</span>
                        <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                            <span className="text-sm tabular-nums">
                                {dateStr
                                    ? new Date(dateStr).toLocaleString(LOCALE_MAP[lang] || 'en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          hour12: false,
                                      })
                                    : '—'}
                            </span>
                            <ChevronDown size={14} className={`chev ${isDatePickerOpen ? 'rotate-180' : ''}`} />
                        </div>
                    </button>
                    <DateTimePicker
                        isOpen={isDatePickerOpen}
                        inline
                        onClose={closeDatePicker}
                        onConfirm={date => {
                            const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
                                .toISOString()
                                .slice(0, 16);
                            setDateStr(iso);
                        }}
                        initialDate={dateStr ? new Date(dateStr) : new Date()}
                        mode="datetime"
                        title={t('field.time')}
                    />
                </div>

                {/* Route */}
                <CustomSelect
                    label={t('field.route')}
                    value={route}
                    onChange={val => setRoute(val as Route)}
                    options={availableRoutes.map(r => ({
                        value: r,
                        label: t(`route.${r}`),
                    }))}
                />

                {route === Route.patchRemove && (
                    <div className="text-xs text-[var(--text-muted)] bg-[var(--surface-hover)] p-3 rounded-[var(--radius-md)]">
                        {t('patch.remove_hint')}
                    </div>
                )}

                {route !== Route.patchRemove && (
                    <>
                        {/* Ester Selection */}
                        {availableEsters.length > 1 && (
                            <CustomSelect
                                label={t('field.ester')}
                                value={ester}
                                onChange={val => setEster(val as Ester)}
                                options={availableEsters.map(e => ({
                                    value: e,
                                    label: drugLabel(e, t),
                                    description: productNames(route, e, t) || undefined,
                                }))}
                            />
                        )}

                        {quickDoses && onAddQuickDose && onDeleteQuickDose && (
                            <div className="mt-2">
                                <QuickDoseButtons
                                    route={route}
                                    ester={ester}
                                    quickDoses={quickDoses}
                                    currentDose={rawDose}
                                    onSelectDose={val => handleRawChange(val.toString())}
                                    onAddQuickDose={onAddQuickDose}
                                    onDeleteQuickDose={onDeleteQuickDose}
                                />
                            </div>
                        )}

                        <div ref={fieldsRef} className="dose-fields mt-2">
                            {route === Route.injection && (
                                <InjectionFields
                                    ester={ester}
                                    rawDose={rawDose}
                                    e2Dose={e2Dose}
                                    onRawChange={handleRawChange}
                                    onE2Change={handleE2Change}
                                    route={route}
                                    invalid={!!shownDoseError}
                                    errorId={doseErrorId}
                                />
                            )}

                            {route === Route.oral && (
                                <OralFields
                                    ester={ester}
                                    rawDose={rawDose}
                                    e2Dose={e2Dose}
                                    onRawChange={handleRawChange}
                                    onE2Change={handleE2Change}
                                    route={route}
                                    invalid={!!shownDoseError}
                                    errorId={doseErrorId}
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
                                    thetaFromHold={thetaFromHold}
                                    route={route}
                                    invalid={!!shownDoseError}
                                    errorId={doseErrorId}
                                />
                            )}

                            {route === Route.gel && (
                                <GelFields
                                    gelSite={gelSite}
                                    setGelSite={setGelSite}
                                    e2Dose={e2Dose}
                                    onE2Change={handleE2Change}
                                    bioMultiplier={bioMultiplier}
                                    invalid={!!shownDoseError}
                                    errorId={doseErrorId}
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
                                    patchWearDays={patchWearDays}
                                    setPatchWearDays={setPatchWearDays}
                                    invalid={!!shownDoseError}
                                    errorId={doseErrorId}
                                />
                            )}
                        </div>
                        {shownDoseError && (
                            <p id={doseErrorId} role="alert" className="mt-2 ps-1 text-xs text-[var(--danger)]">
                                {shownDoseError}
                            </p>
                        )}

                        {/* Injection-specific guide from mtf.wiki */}
                        {route === Route.injection && !isTransmasc && isEstradiolEster(ester) && (
                            <div className="mt-3 border-t border-[var(--border)] pt-3">
                                {/* The safety warning stays in view; the rest folds. */}
                                <GuideFold
                                    icon={
                                        <span className="icon-line text-sm">
                                            <Warning className="w-4 h-4 text-[var(--warning)]" />
                                        </span>
                                    }
                                    heading={
                                        <span className="text-sm font-semibold text-[var(--text)]">
                                            {t('inj.guide.title')}
                                        </span>
                                    }
                                    lead={
                                        <span className="block text-sm text-[var(--warning)] mt-0.5">
                                            {t('inj.guide.safety')}
                                        </span>
                                    }
                                >
                                    <div className="pt-3 space-y-3">
                                        {/* Usage & Dosage */}
                                        <div className="space-y-1.5 pl-6">
                                            <p className="text-sm text-[var(--text-muted)]">
                                                {t('inj.guide.route_methods')}
                                            </p>
                                            <p className="text-xs font-medium text-[var(--danger)]">
                                                {t('inj.guide.route_warn')}
                                            </p>
                                            <p className="text-sm font-semibold text-[var(--text)] mt-1">
                                                {t('inj.guide.dosage_title')}
                                            </p>
                                            <ul className="text-sm text-[var(--text-muted)] space-y-0.5 list-disc list-inside">
                                                <li>{t('inj.guide.dosage_ev')}</li>
                                                <li>{t('inj.guide.dosage_ec')}</li>
                                            </ul>
                                            <a
                                                href="https://transfemscience.org/misc/injectable-e2-simulator/"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={e => {
                                                    e.preventDefault();
                                                    confirmAndOpenExternal(
                                                        'https://transfemscience.org/misc/injectable-e2-simulator/',
                                                    );
                                                }}
                                                className="inline-flex items-center gap-1 text-sm text-[var(--accent-ink)] hover:underline mt-0.5"
                                            >
                                                {t('inj.guide.sim_link')}
                                                <External size={13} />
                                            </a>
                                        </div>

                                        {/* Precautions */}
                                        <div className="pl-6 space-y-1">
                                            <p className="text-sm font-semibold text-[var(--text)]">
                                                {t('inj.guide.notes_title')}
                                            </p>
                                            <ul className="text-xs text-[var(--text-muted)] space-y-1.5 list-disc list-inside leading-relaxed">
                                                <li>{t('inj.guide.note_1')}</li>
                                                <li>{t('inj.guide.note_2')}</li>
                                                <li className="font-semibold text-[var(--danger)]">
                                                    {t('inj.guide.note_3')}
                                                </li>
                                                <li>
                                                    <span className="font-semibold text-[var(--warning)]">
                                                        {t('inj.guide.note_4')}
                                                    </span>
                                                </li>
                                                <li>{t('inj.guide.note_5')}</li>
                                                <li>{t('inj.guide.note_6')}</li>
                                                <li>{t('inj.guide.note_7')}</li>
                                                <li>{t('inj.guide.note_8')}</li>
                                                <li>{t('inj.guide.note_9')}</li>
                                            </ul>
                                        </div>

                                        {/* Source */}
                                        <a
                                            href="https://mtf.wiki/zh-cn/docs/medicine/estrogen/injection"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={e => {
                                                e.preventDefault();
                                                confirmAndOpenExternal(
                                                    'https://mtf.wiki/zh-cn/docs/medicine/estrogen/injection',
                                                );
                                            }}
                                            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent-ink)]"
                                        >
                                            {t('inj.guide.source')}
                                            <External size={12} />
                                        </a>
                                    </div>
                                </GuideFold>
                            </div>
                        )}

                        {/* CPA dosage hint: the recommended dose stays in view, the two other regimens fold. */}
                        {ester === Ester.CPA && (
                            <div className="mt-3 p-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)]">
                                <GuideFold
                                    icon={
                                        <span className="icon-line text-sm me-1">
                                            <Info className="w-5 h-5 text-[var(--text-muted)]" />
                                        </span>
                                    }
                                    heading={
                                        <span className="text-sm font-bold text-[var(--text)]">
                                            {t('dose.guide.title')}
                                        </span>
                                    }
                                    lead={
                                        <span className="mt-2.5 flex items-start gap-1.5 text-xs text-[var(--text-muted)] leading-relaxed">
                                            <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--text-muted)] shrink-0" />
                                            {t('dose.guide.cpa_hint.rec')}
                                        </span>
                                    }
                                >
                                    {/* Hangs under the heading, clear of the icon (20px + 12px). */}
                                    <ul className="ps-8 pt-1 space-y-1">
                                        {(['combo', 'ultralow'] as const).map(key => (
                                            <li
                                                key={key}
                                                className="flex items-start gap-1.5 text-xs text-[var(--text-muted)] leading-relaxed"
                                            >
                                                <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--text-muted)] shrink-0" />
                                                {t(`dose.guide.cpa_hint.${key}`)}
                                            </li>
                                        ))}
                                    </ul>
                                </GuideFold>
                            </div>
                        )}

                        {/* Dose guide for non-injection routes. Only once there is a
                            dose to place: before that it was three lines of
                            "enter a dose" and bare thresholds on every new form. */}
                        {doseGuide &&
                            (doseGuide.value !== null || (doseGuide.showRateHint && parseFloat(rawDose) > 0)) && (
                                <div className="mt-2 pt-2 border-t border-[var(--border)] flex gap-2">
                                    <span className="icon-line text-xs">
                                        <Info className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                    </span>
                                    <div className="space-y-0.5 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-[var(--text)]">
                                                {t('dose.guide.title')}
                                            </span>
                                            {doseGuide.level && (
                                                <span className={`text-xs font-medium ${guideBadgeClass}`}>
                                                    {t(`dose.guide.level.${doseGuide.level}`)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            {t('dose.guide.current')}:{' '}
                                            {doseGuide.value !== null
                                                ? `${formatGuideNumber(doseGuide.value)} ${guideUnitLabel}`
                                                : t('dose.guide.current_blank')}
                                        </p>
                                        {guideRangeText && (
                                            <p className="text-[0.6875rem] text-[var(--text-muted)] leading-snug">
                                                {t('dose.guide.reference')}: {guideRangeText}
                                            </p>
                                        )}
                                        {doseGuide.showRateHint && (
                                            <p className="text-[0.6875rem] text-[var(--warning)] leading-snug">
                                                {t('dose.guide.patch_rate_hint')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                        {/* Recent-use heads-up — logged doses already running high */}
                        {doseAdvisory && (
                            <div className="mt-2 pt-2 border-t border-[var(--border)]">
                                <DoseAdvisoryLine advisory={doseAdvisory} t={t} />
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer Buttons. On a phone the template controls and Save
                share one row, Save taking the rest of it; on rows of their own
                they put Save under the floating nav for an injection at
                390x844. Save keeps a 12rem basis and doesn't shrink, so when
                the template name field opens it drops to a full row below.
                Cancel and Save (the edit form in the list) keep a row of their
                own, where neither label has to wrap. */}
            <div
                className={`flex flex-wrap gap-x-2 gap-y-2 justify-between items-center shrink-0 border-t border-[var(--border)] ${!isInline ? 'px-6 py-3' : hideHeader ? 'py-2' : 'py-3'}`}
            >
                {/* Says what the tick shows, for anyone who can't see it. */}
                <span role="status" className="sr-only">
                    {templateTick === 'saved'
                        ? t('template.saved')
                        : templateTick === 'loaded'
                          ? t('template.loaded')
                          : ''}
                </span>
                <div className="flex gap-2 items-center flex-wrap min-h-10">
                    {/* Template Save Section. Both halves clip, to collapse to
                        nothing in turn, so their buttons draw the focus ring
                        inside their own box, where it isn't cut off. */}
                    <div className="flex items-center">
                        <div
                            className={`overflow-hidden flex items-center ${
                                showSaveTemplateInput ? 'w-[14rem] sm:w-[13.5rem] opacity-100' : 'w-0 opacity-0'
                            }`}
                            {...inertWhen(!showSaveTemplateInput)}
                        >
                            <input
                                ref={templateInputRef}
                                type="text"
                                value={templateName}
                                onChange={e => setTemplateName(e.target.value)}
                                onKeyDown={e => {
                                    // Enter here names the template; it must not save the dose.
                                    // Except the Enter that commits an IME conversion (kana to
                                    // kanji, pinyin to hanzi): that one only finishes the word.
                                    // Safari sends its keydown after compositionend, with
                                    // isComposing false, so keyCode 229 is what gives it away.
                                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                                        e.preventDefault();
                                        handleSaveAsTemplate();
                                    }
                                }}
                                placeholder={t('template.name_placeholder')}
                                className="input-base flex-1 min-w-0 text-sm text-[var(--text)]"
                                style={{ fontSize: '16px' }}
                            />
                            <button
                                type="button"
                                onClick={handleSaveAsTemplate}
                                className="p-1.5 ml-1 text-[var(--accent-ink)] hover:bg-[var(--accent-subtle)] dark:hover:bg-[var(--accent-subtle)]/20 rounded shrink-0 focus-inset"
                                aria-label={t('template.save_title')}
                            >
                                <Check size={18} />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowSaveTemplateInput(false);
                                    setTemplateName('');
                                }}
                                className="p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] rounded shrink-0 focus-inset"
                                aria-label={t('btn.cancel')}
                            >
                                <Close size={18} />
                            </button>
                        </div>

                        <div
                            className={`overflow-hidden ${
                                showSaveTemplateInput ? 'w-0 opacity-0' : 'w-[2.35rem] opacity-100'
                            }`}
                            {...inertWhen(showSaveTemplateInput)}
                        >
                            <button
                                ref={templateButtonRef}
                                type="button"
                                onClick={() => {
                                    setShowSaveTemplateInput(true);
                                    setShowTemplateMenu(false);
                                }}
                                className="p-2 text-[var(--text-muted)] hover:text-[var(--accent-ink)] rounded flex items-center justify-center focus-inset"
                                title={t('template.save_title')}
                                aria-label={t('template.save_title')}
                            >
                                <span className="inline-grid shrink-0 place-items-center" aria-hidden="true">
                                    <BookmarkPlus
                                        size={18}
                                        data-hidden={templateTick === 'saved'}
                                        className="copy-glyph col-start-1 row-start-1"
                                    />
                                    <Tick on={templateTick === 'saved'} size={18} className="col-start-1 row-start-1" />
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Delete Event (only when editing) */}
                    {eventToEdit && (
                        <button
                            type="button"
                            onClick={() => {
                                setShowSaveTemplateInput(false);
                                setShowTemplateMenu(false);
                                showDialog(
                                    'confirm',
                                    describeDose(eventToEdit),
                                    () => {
                                        onDelete(eventToEdit.id);
                                        onCancel();
                                    },
                                    {
                                        danger: true,
                                        title: t('modal.dose.delete_confirm'),
                                        confirmLabel: t('btn.delete'),
                                    },
                                );
                            }}
                            className="p-2 text-[var(--text-muted)] hover:text-[var(--danger)] rounded flex items-center justify-center"
                            title={t('btn.delete')}
                            aria-label={t('btn.delete')}
                        >
                            <Trash size={18} />
                        </button>
                    )}
                </div>

                <div
                    className={`flex gap-2 ml-auto shrink-0 grow ${hideHeader ? 'basis-full' : 'basis-48'} sm:grow-0 sm:basis-auto justify-end`}
                >
                    {hideHeader && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 sm:flex-none sm:min-w-[88px] flex items-center justify-center px-4 py-2 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] rounded-md text-sm"
                        >
                            {t('btn.cancel')}
                        </button>
                    )}
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="btn-primary flex-1 sm:flex-none sm:min-w-[88px]"
                    >
                        {isSaving ? (
                            <Busy size={16} className="animate-spin" />
                        ) : (
                            <>
                                <Save size={16} />
                                <span>{t('btn.save')}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </form>
    );
};

export default DoseForm;
