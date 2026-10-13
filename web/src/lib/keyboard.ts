const FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=button]):not([type=submit]), textarea, select, [contenteditable="true"]';
const KEEP = `${FIELD}, label, .keep-keyboard`;
const INTERACTIVE = 'button, a, [role="button"], [role="radio"], [role="switch"], [role="option"], [role="spinbutton"]';

const focusedField = (): HTMLElement | null => {
  const a = document.activeElement;
  return a instanceof HTMLElement && a.matches(FIELD) ? a : null;
};

let installed = false;

export function installKeyboardHelpers() {
  if (installed) return;
  installed = true;
  let start: { x: number; y: number } | null = null;

  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    start = t ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    const f = focusedField(); const t = e.touches[0];
    if (!f || !start || !t || f.contains(e.target as Node)) return;
    if (Math.abs(t.clientY - start.y) > 28) f.blur();
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const f = focusedField(); const t = e.changedTouches[0];
    if (!f || !start || !t || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) return;
    const target = e.target as HTMLElement;
    if (!(target instanceof Element) || target.closest(KEEP) || target.closest(INTERACTIVE)) return;
    f.blur();
  }, { passive: true });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!(target instanceof Element) || target.closest(KEEP) || !target.closest(INTERACTIVE)) return;
    const f = focusedField();
    if (f) setTimeout(() => { if (document.activeElement === f) f.blur(); }, 0);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const t = e.target;
    if (t instanceof HTMLInputElement && t.matches(FIELD) && !t.closest('form')) t.blur();
  });
}
