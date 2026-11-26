import type { CSSProperties } from 'react';
import { ChevronRight } from './icons';
import { Molecule } from './Molecule';
import { rowBleed } from './SettingsListItem';
import type { DoodleName } from './Doodle';
import { describeMed, medName, usualText, type Med } from '../data/meds';
import { useTranslation } from '../contexts/LanguageContext';

/** One medicine as a row, the way Oyama Journal sets a substance: its drawing
 *  (the molecule, or its route's doodle when it has none), its name over what
 *  it is, the usual amount, and a chevron. */
export function MedRow({
    med,
    sub,
    active,
    id,
    onOpen,
}: {
    med: Med;
    /** Shown instead of what it is, e.g. the product a search matched. */
    sub?: string;
    active?: boolean;
    id?: string;
    onOpen: (med: Med) => void;
}) {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            id={id}
            onClick={() => onOpen(med)}
            className={`w-full min-h-14 flex items-center gap-3 py-2.5 text-start text-[var(--text)] ${rowBleed} ${active ? 'bg-[var(--surface-hover)]' : ''}`}
            style={{ '--divider-inset': '3.25rem' } as CSSProperties}
        >
            <Molecule id={med.id} fallback={med.routes[0] as DoodleName} />
            <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{medName(med.id, t)}</span>
                <span className="block text-xs text-[var(--text-muted)] mt-0.5 truncate">
                    {sub ?? describeMed(med, t)}
                </span>
            </span>
            <span className="shrink-0 text-xs text-[var(--text-muted)] tabular-nums">{usualText(med)}</span>
            <ChevronRight size={18} className="shrink-0 text-[var(--text-muted)] opacity-70 rtl:-scale-x-100" />
        </button>
    );
}

export default MedRow;
