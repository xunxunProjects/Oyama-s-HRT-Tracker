import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { LabResult, isT_LabUnit } from '../../logic';
import { Check, Trash2, ChevronDown } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import DateTimePicker from './DateTimePicker';
import Segmented from './Segmented';
import { LOCALE_MAP } from '../utils/helpers';

interface LabResultFormProps {
    resultToEdit?: LabResult | null;
    onSave: (result: LabResult) => void;
    onCancel: () => void;
    onDelete?: (id: string) => void;
}

type LabUnit = 'pg/ml' | 'pmol/l' | 'ng/dl' | 'nmol/l';

const divider = "border-b border-[var(--border)]";

const E2_UNITS: LabUnit[] = ['pmol/l', 'pg/ml'];
const T_UNITS: LabUnit[] = ['ng/dl', 'nmol/l'];
const UNIT_LABELS: Record<LabUnit, string> = {
    'pmol/l': 'pmol/L',
    'pg/ml': 'pg/mL',
    'ng/dl': 'ng/dL',
    'nmol/l': 'nmol/L',
};

// One hormone's value + unit toggle. Reused for the estradiol row, the
// testosterone row, and (in edit mode) the single row matching whichever
// hormone the record being edited already belongs to.
const HormoneValueField: React.FC<{
    label: string;
    units: LabUnit[];
    unit: LabUnit;
    onUnitChange: (u: LabUnit) => void;
    value: string;
    onValueChange: (v: string) => void;
}> = ({ label, units, unit, onUnitChange, value, onValueChange }) => (
    <div>
        <div className="flex items-center justify-between mb-3">
            <span className="text-[0.9375rem] text-[var(--text)]">
                {label}
            </span>
            <Segmented options={units.map(u => ({ id: u, label: UNIT_LABELS[u] }))} value={unit} onChange={onUnitChange} />
        </div>
        <input
            type="number"
            inputMode="decimal"
            placeholder="0.0"
            value={value}
            onChange={e => onValueChange(e.target.value)}
            className="w-full bg-[var(--field)] border border-[var(--border)] rounded-md px-3 py-2 outline-none focus:border-[var(--accent-ink)] text-[var(--text)] placeholder:text-[var(--text-muted)] tabular-nums"
            style={{ fontSize: '16px' }}
        />
    </div>
);

const LabResultForm: React.FC<LabResultFormProps> = ({ resultToEdit, onSave, onCancel, onDelete }) => {
    const { t, lang } = useTranslation();
    const { showDialog } = useDialog();
    const [dateStr, setDateStr] = useState("");
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

    // Editing an existing record: single value tied to that record's hormone.
    const [editUnit, setEditUnit] = useState<LabUnit>('pmol/l');
    const [editValue, setEditValue] = useState("");

    // Adding new: estradiol and testosterone are independent fields, so one
    // blood draw covering both markers can be logged as a single entry at a
    // single timestamp instead of two separate saves.
    const [e2Unit, setE2Unit] = useState<LabUnit>('pmol/l');
    const [e2Value, setE2Value] = useState("");
    const [tUnit, setTUnit] = useState<LabUnit>('ng/dl');
    const [tValue, setTValue] = useState("");

    useEffect(() => {
        if (resultToEdit) {
            const d = new Date(resultToEdit.timeH * 3600000);
            const iso = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setDateStr(iso);
            setEditValue(resultToEdit.concValue.toString());
            setEditUnit(resultToEdit.unit);
        } else {
            const now = new Date();
            const iso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setDateStr(iso);
            setE2Value("");
            setTValue("");
            setE2Unit('pmol/l');
            setTUnit('ng/dl');
        }
    }, [resultToEdit]);

    const handleSave = () => {
        if (!dateStr) return;
        const timeH = new Date(dateStr).getTime() / 3600000;
        if (isNaN(timeH)) return;

        if (resultToEdit) {
            const numValue = parseFloat(editValue);
            if (!editValue || isNaN(numValue) || numValue < 0) return;
            onSave({ id: resultToEdit.id, timeH, concValue: numValue, unit: editUnit });
            return;
        }

        const e2Num = parseFloat(e2Value);
        const tNum = parseFloat(tValue);
        const hasE2 = e2Value.trim() !== '' && Number.isFinite(e2Num) && e2Num >= 0;
        const hasT = tValue.trim() !== '' && Number.isFinite(tNum) && tNum >= 0;
        if (!hasE2 && !hasT) return;
        if (hasE2) onSave({ id: uuidv4(), timeH, concValue: e2Num, unit: e2Unit });
        if (hasT) onSave({ id: uuidv4(), timeH, concValue: tNum, unit: tUnit });
    };

    const canSave = resultToEdit ? !!editValue : (!!e2Value || !!tValue);
    const editIsT = isT_LabUnit(editUnit);

    return (
        <div className="flex flex-col h-full">
            <div className="overflow-y-auto flex-1">
                {/* Date row */}
                <button
                    type="button"
                    onClick={() => setIsDatePickerOpen(v => !v)}
                    className={`w-full flex items-center justify-between py-[18px] ${divider} text-start`}
                >
                    <span className="text-[0.9375rem] text-[var(--text)]">
                        {t('lab.date')}
                    </span>
                    <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                        <span className="text-sm tabular-nums">
                            {dateStr ? new Date(dateStr).toLocaleString(LOCALE_MAP[lang] || 'en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                        <ChevronDown size={14} className={`chev ${isDatePickerOpen ? 'rotate-180' : ''}`} />
                    </div>
                </button>
                <DateTimePicker
                    isOpen={isDatePickerOpen}
                    inline
                    onClose={() => setIsDatePickerOpen(false)}
                    onConfirm={(date) => {
                        const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                        setDateStr(iso);
                    }}
                    initialDate={dateStr ? new Date(dateStr) : new Date()}
                    mode="datetime"
                    title={t('lab.date')}
                />

                {resultToEdit ? (
                    <div className={`py-[18px] ${divider}`}>
                        <HormoneValueField
                            label={editIsT ? t('lab.value_t') : t('lab.value')}
                            units={editIsT ? T_UNITS : E2_UNITS}
                            unit={editUnit}
                            onUnitChange={setEditUnit}
                            value={editValue}
                            onValueChange={setEditValue}
                        />
                    </div>
                ) : (
                    <>
                        <div className={`py-[18px] ${divider}`}>
                            <HormoneValueField
                                label={t('lab.value')}
                                units={E2_UNITS}
                                unit={e2Unit}
                                onUnitChange={setE2Unit}
                                value={e2Value}
                                onValueChange={setE2Value}
                            />
                        </div>
                        <div className={`py-[18px] ${divider}`}>
                            <HormoneValueField
                                label={t('lab.value_t')}
                                units={T_UNITS}
                                unit={tUnit}
                                onUnitChange={setTUnit}
                                value={tValue}
                                onValueChange={setTValue}
                            />
                        </div>
                        <p className="text-xs text-[var(--text-muted)] pt-2">
                            {t('lab.dual_hint')}
                        </p>
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="pt-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    {resultToEdit && onDelete && (
                        <button
                            onClick={() => showDialog('confirm', t('lab.delete_confirm'), () => {
                                onDelete(resultToEdit.id);
                                onCancel();
                            }, { danger: true })}
                            className="p-2 text-[var(--text-muted)] hover:text-[var(--danger)] rounded"
                            title={t('btn.delete')}
                            aria-label={t('btn.delete')}
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>

                <div className="flex gap-2 ml-auto">
                    <button
                        onClick={onCancel}
                        className="min-w-[88px] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-hover)] rounded-md flex items-center justify-center"
                    >
                        {t('btn.cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!canSave || !dateStr}
                        className="btn-primary min-w-[88px]"
                    >
                        <Check size={14} />
                        {t('btn.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LabResultForm;
