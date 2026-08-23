/* All state lives in localStorage (spec §8). No server, no account.

   The store is a plain pub/sub. Components subscribe through `useTrip()`;
   Preact then re-renders only what changed, which is what makes exit
   animations and preserved scroll possible at all (feedback F2/F11/F12). */
import { useSyncExternalStore } from 'preact/compat';
import { emptyDoc, normalize, applyDefaults, SCHEMA_VERSION } from './schema.js';
import { uid, todayISO } from '../lib/util.js';

const KEY = 'jugni.trip.v1';

/* The trip is plain JSON, so a round-trip clone is equivalent to
   structuredClone and works everywhere — including older webviews and the
   jsdom context the smoke test runs in, where structuredClone is absent.
   Every write depends on this, so it must not rely on a recent global. */
const clone = (value) => (typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)));

let state = emptyDoc();
/* Kept so the trip baked into the file is always reachable. Clearing writes an
   empty state that then wins over the baked copy on every later load, which
   made "Clear everything" a one-way door even though the data never left the
   file. Recovery has to be an offer in the UI, not a reinstall. */
let bakedDoc = null;
let catalogue = { categories: [], checklistDefaults: [] };
let warnings = [];
let readonly = false;
let needsFork = false;
const listeners = new Set();

/* An immutable snapshot per commit: components compare by identity, and undo
   is just holding on to the previous one. */
let snapshot = state;

function emit() {
  snapshot = state;
  listeners.forEach((fn) => fn());
}

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getState = () => snapshot;

export function useTrip() {
  return useSyncExternalStore(subscribe, getState, getState);
}

export const getCatalogue = () => catalogue;
export const hasBaked = () => !!bakedDoc;
export const getWarnings = () => warnings;
export const isReadonly = () => readonly;
export const takeForkFlag = () => { const v = needsFork; needsFork = false; return v; };

/* ---------- Boot ---------- */

export function init(baked, defaults) {
  catalogue = defaults || catalogue;
  bakedDoc = baked?.trip ? baked : null;

  let source = null, origin = 'empty';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) { source = JSON.parse(saved); origin = 'local'; }
  } catch { /* private mode or corrupt entry — fall through to baked */ }

  /* What the traveller has been editing wins over what was baked in at build
     time; otherwise reopening the file would discard their trip. */
  if (!source && baked?.trip && !takeClearedFlag()) { source = baked; origin = 'baked'; }

  const res = normalize(source);
  state = applyDefaults(res.doc, catalogue);
  warnings = res.warnings;

  if (origin !== 'local') persist();
  applyTheme();
  emit();
  return origin;
}

export function setReadonly(on) {
  readonly = !!on;
  document.body.dataset.readonly = on ? 'true' : 'false';
}

function persist() {
  if (readonly) return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { /* storage full or blocked; the session still works in memory */ }
}

/* ---------- Writes ----------
   Every mutation goes through here: clone, apply, persist, notify. Cloning
   rather than mutating in place is what lets Preact tell old from new. */
export function mutate(fn) {
  if (readonly) return false;
  const next = clone(state);
  fn(next);
  state = next;
  persist();
  emit();
  return true;
}

/* A mutation that can be taken back. Returns an undo function, or null if the
   write was refused. Used by every destructive action (F2/F3/F9). */
export function mutateUndoable(fn) {
  if (readonly) return null;
  const previous = state;
  if (!mutate(fn)) return null;
  return () => { state = previous; persist(); emit(); };
}

export function logEvent(draft, type, relatedType, relatedId, text) {
  draft.log.push({
    id: uid('log'), date: todayISO(), relatedType, relatedId, type, text,
  });
}

/* ---------- Theme ---------- */

export function applyTheme() {
  document.documentElement.dataset.theme = state.trip.theme === 'dark' ? 'dark' : 'light';
}
export function setTheme(theme) {
  mutate((d) => { d.trip.theme = theme === 'dark' ? 'dark' : 'light'; });
  applyTheme();
}

/* ---------- Import / export (spec §8's role-based naming) ---------- */

export function exportName() {
  const primary = state.travelers.find((t) => t.role === 'primary') || state.travelers[0];
  const nick = (primary?.nickname || 'traveler')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `output-${nick || 'traveler'}.json`;
}

export const exportJSON = () => JSON.stringify(state, null, 2);

export function importJSON(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return { ok: false, error: 'That file is not valid JSON.' }; }
  if (!parsed?.trip) return { ok: false, error: 'That JSON has no "trip" — not a Jugni file.' };

  const res = normalize(parsed);
  state = applyDefaults(res.doc, catalogue);
  warnings = res.warnings;
  /* An imported file is somebody else's export, so whoever imported it is the
     primary traveller of their own fork now (spec §2's fork path). */
  needsFork = true;
  persist();
  applyTheme();
  emit();
  return { ok: true, warnings: res.warnings };
}

/* Drops local edits and reloads. Because the trip is baked into the file, the
   reload restores the built version — which is what "reset" means here. */
/* Reload the trip as it was built, from the copy embedded in this file. */
export function restoreBuilt() {
  if (!bakedDoc) return false;
  const res = normalize(clone(bakedDoc));
  state = applyDefaults(res.doc, catalogue);
  warnings = res.warnings;
  try { localStorage.removeItem('jugni.cleared'); } catch { /* ignore */ }
  persist();
  applyTheme();
  emit();
  return true;
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  location.reload();
}

/* Empties the app outright, ignoring whatever was baked in. */
export function clearAll() {
  try {
    localStorage.removeItem(KEY);
    localStorage.setItem('jugni.cleared', '1');
  } catch { /* nothing to clear */ }
  location.reload();
}

/* Set by clearAll so the boot does not immediately re-seed from baked data. */
export function takeClearedFlag() {
  try {
    const was = localStorage.getItem('jugni.cleared') === '1';
    if (was) localStorage.removeItem('jugni.cleared');
    return was;
  } catch { return false; }
}

export { SCHEMA_VERSION };
