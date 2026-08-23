/* Sheets and toasts live outside the screen tree so any component can raise
   one without threading callbacks through five layers. The Shell renders
   whatever is here. */
import { useSyncExternalStore } from 'preact/compat';
import { uid } from '../lib/util.js';

let sheet = null;
let toasts = [];
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

let snap = { sheet, toasts };
const getSnap = () => snap;
const commit = () => { snap = { sheet, toasts }; emit(); };

export const useOverlay = () => useSyncExternalStore(subscribe, getSnap, getSnap);

/* opts: { title, render(), confirmLabel, danger, onSubmit(values), size } */
export function openSheet(opts) { sheet = { ...opts, key: uid('sheet') }; commit(); }
export function closeSheet() { sheet = null; commit(); }

export function toast(message, action) {
  const t = { id: uid('toast'), message, action };
  toasts = [...toasts, t];
  commit();
  setTimeout(() => dismissToast(t.id), action ? 7000 : 3400);
  return t.id;
}
export function dismissToast(id) {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  commit();
}

/* A confirmation that names what is about to be destroyed. "Are you sure?"
   with no subject is how people delete the wrong thing (feedback F9). */
export function confirmDestructive({ title, what, detail, confirmLabel = 'Delete', onConfirm }) {
  openSheet({
    title,
    what,
    detail,
    confirmLabel,
    danger: true,
    onSubmit: onConfirm,
  });
}
