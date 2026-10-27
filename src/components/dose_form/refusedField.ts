/**
 * Marks a dose field after Save was refused for it: it reads as invalid to
 * assistive tech and points at the message under the fields (DoseForm), which
 * also focuses it and draws its border in the danger colour (.dose-fields in
 * index.css). Only a field that is empty or not above zero is marked, so when
 * a pair of linked fields is shown it is the empty one, or both.
 */
export const refusedFieldProps = (value: string, invalid?: boolean, errorId?: string) =>
    invalid && !(parseFloat(value) > 0) ? { 'aria-invalid': true as const, 'aria-describedby': errorId } : {};
