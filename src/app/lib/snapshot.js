/* Read-only snapshot (spec §12.1): a companion should be able to open the trip
   and look at it — no setup, no login, no writes. Because the app is already
   one self-contained file, the snapshot is that same file with the current
   data baked in and editing switched off. */

export function buildSnapshot(state) {
  const dataEl = document.getElementById('jugni-data');
  if (!dataEl) return null;

  const clone = document.documentElement.cloneNode(true);
  const cloneData = clone.querySelector('#jugni-data');
  if (!cloneData) return null;

  cloneData.textContent = JSON.stringify(state);
  cloneData.setAttribute('data-mode', 'readonly');

  /* Strip whatever the running app rendered — the snapshot boots itself. */
  const root = clone.querySelector('#app');
  if (root) root.innerHTML = '';
  clone.querySelectorAll('dialog.sheet, .toasts').forEach((n) => n.remove());

  return `<!doctype html>\n${clone.outerHTML}`;
}
