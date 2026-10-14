/**
 * Copy text to the clipboard. `navigator.clipboard` is missing on a plain-http
 * self-host (it needs a secure context), so fall back to the older
 * select-and-copy route there. Rejects when neither works.
 */
export async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            /* refused; try the older route below */
        }
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    try {
        area.select();
        if (!document.execCommand('copy')) throw new Error('COPY_FAILED');
    } finally {
        area.remove();
    }
}
