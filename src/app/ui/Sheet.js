import { html } from '../lib/html.js';
import { Icon } from '../lib/icons.js';
import { useOverlay, closeSheet, dismissToast } from './overlay.js';
import { useEffect, useRef } from './hooks.js';

/* One modal at a time, rendered by the Shell. Uses a native <dialog>, so
   focus trapping, Escape and the backdrop come from the platform rather than
   from code we would have to keep correct. */
export function SheetHost() {
  const { sheet } = useOverlay();
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal?.();
    const first = el.querySelector('[autofocus]') || el.querySelector('input,select,textarea,button');
    first?.focus?.();
  }, [sheet?.key]);

  if (!sheet) return null;

  const onSubmit = (event) => {
    event.preventDefault();
    const values = {};
    for (const el of event.target.querySelectorAll('[name]')) {
      values[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    closeSheet();
    sheet.onSubmit?.(values);
  };

  return html`
    <dialog class="sheet" ref=${ref} onClose=${closeSheet} onCancel=${closeSheet}>
      <form onSubmit=${onSubmit}>
        <div class="sheet__head">
          <h2 class="card__title">${sheet.title}</h2>
          <button type="button" class="btn btn--ghost btn--icon" onClick=${closeSheet} aria-label="Close">
            <${Icon} name="x" />
          </button>
        </div>

        <div class="sheet__body">
          ${sheet.what && html`<p class="confirm__what">${sheet.what}</p>`}
          ${sheet.detail && html`<p class="small muted">${sheet.detail}</p>`}
          ${sheet.render?.()}
        </div>

        <div class="sheet__foot">
          ${sheet.secondary && html`
            <button type="button" class="btn btn--danger" onClick=${() => { closeSheet(); sheet.secondary.onClick(); }}>
              ${sheet.secondary.icon && html`<${Icon} name=${sheet.secondary.icon} />`}
              ${sheet.secondary.label}
            </button>
            <span class="spacer"></span>`}
          <button type="button" class="btn" onClick=${closeSheet}>Cancel</button>
          <button type="submit" class=${`btn ${sheet.danger ? 'btn--solid-danger' : 'btn--primary'}`}>
            ${sheet.confirmLabel || 'Save'}
          </button>
        </div>
      </form>
    </dialog>`;
}

/* Toasts carry an Undo where an action destroyed something. The tap targets
   are small and mis-taps happen on a phone (feedback F2/F3/F9). */
export function ToastHost() {
  const { toasts } = useOverlay();
  if (!toasts.length) return null;
  return html`<div class="toasts" role="status" aria-live="polite">
    ${toasts.map((t) => html`
      <div class="toast" key=${t.id}>
        <span>${t.message}</span>
        ${t.action && html`
          <button class="toast__undo" onClick=${() => { dismissToast(t.id); t.action.onClick(); }}>
            ${t.action.label}
          </button>`}
      </div>`)}
  </div>`;
}
