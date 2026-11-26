import { forwardRef, type KeyboardEvent } from 'react';
import { Close, Search } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface Props {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    label: string;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
    /** id of the list the arrow keys move through, for screen readers. */
    listId?: string;
    activeId?: string;
    autoFocus?: boolean;
}

/** The search field, drawn as every Oyama field is: a line, inked from the
 *  left while it has the cursor. */
export const SearchField = forwardRef<HTMLInputElement, Props>(function SearchField(
    { value, onChange, placeholder, label, onKeyDown, listId, activeId, autoFocus },
    ref,
) {
    const { t } = useTranslation();
    return (
        <div className="relative flex items-center">
            <Search size={20} className="absolute start-0 text-[var(--text-muted)] pointer-events-none" />
            <input
                ref={ref}
                type="search"
                className={`input-base ps-8 pe-9 ${value ? 'is-inked' : ''}`}
                value={value}
                placeholder={placeholder}
                aria-label={label}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
                autoFocus={autoFocus}
                role={listId ? 'combobox' : undefined}
                aria-controls={listId}
                aria-expanded={listId ? Boolean(value) : undefined}
                aria-activedescendant={activeId}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Escape' && value) {
                        e.preventDefault();
                        onChange('');
                    }
                    onKeyDown?.(e);
                }}
            />
            {value && (
                <button
                    type="button"
                    className="btn-ghost absolute end-0 -me-2 !size-8 !p-0"
                    aria-label={t('search.clear')}
                    onClick={() => {
                        onChange('');
                        (ref as React.RefObject<HTMLInputElement>)?.current?.focus();
                    }}
                >
                    <Close size={18} />
                </button>
            )}
        </div>
    );
});

/** Arrow keys move through a list of results, Enter takes the one marked. */
export function listKeys(
    e: KeyboardEvent<HTMLInputElement>,
    count: number,
    active: number,
    setActive: (n: number) => void,
    choose: (n: number) => void,
) {
    if (!count) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((active + 1) % count);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((active - 1 + count) % count);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        choose(active);
    }
}
