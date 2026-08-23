/* Boot. */
import { render } from 'preact';
import { html } from './lib/html.js';
import { App } from './ui/Shell.js';
import * as Store from './state/store.js';
import * as D from './state/derive.js';
import { toast } from './ui/overlay.js';
import { snapshot as fxSnapshot } from './data/currency.js';
import { ensureRates, getRates } from './data/rates.js';
import { bindRates } from './actions.js';
import { plural } from './lib/util.js';

function readEmbedded(id) {
  const el = document.getElementById(id);
  if (!el?.textContent?.trim()) return null;
  try { return JSON.parse(el.textContent); } catch { return null; }
}

/* Anything saved while offline gets its rate snapshotted now (spec §4). */
async function backfillRates() {
  const pending = D.unconverted(Store.getState());
  if (!pending.length || !navigator.onLine) return 0;
  const home = Store.getState().trip.homeCurrency;
  let filled = 0;

  for (const e of pending) {
    if (!e.currency || !e.amount) continue;
    const snap = await fxSnapshot(e.amount, e.currency, home, e.date);
    if (snap.homeAmount === null) continue;
    Store.mutate((d) => {
      const rec = d.expenses.find((x) => x.id === e.id);
      if (rec) Object.assign(rec, snap);
    });
    filled += 1;
  }
  return filled;
}

function start() {
  const dataEl = document.getElementById('jugni-data');
  Store.init(readEmbedded('jugni-data'), readEmbedded('jugni-defaults'),
             dataEl?.getAttribute('data-build') || '');
  Store.setReadonly(dataEl?.getAttribute('data-mode') === 'readonly');

  if (Store.isReadonly()) {
    const state = Store.getState();
    const safe = (v) => String(v || '').replace(/[<>&"]/g, '');
    const owner = D.ownerPossessive(state);
    document.body.insertAdjacentHTML('afterbegin',
      `<p class="readonly-banner">Read-only snapshot of ${
        owner ? `${safe(owner)} Jugni — ` : ''}${safe(state.trip.name || 'this trip')}</p>`);
  }

  bindRates(getRates);
  render(html`<${App} />`, document.getElementById('app'));

  /* One request covers every currency on the trip, so each screen can show
     home-currency figures without firing its own conversion. */
  const s0 = Store.getState();
  ensureRates(s0.trip.homeCurrency, [
    ...s0.expenses.map((e) => e.currency),
    ...s0.stays.map((x) => x.currency),
    ...s0.transport.map((t) => t.currency),
  ]);
  addEventListener('online', () => {
    const s1 = Store.getState();
    ensureRates(s1.trip.homeCurrency, [
      ...s1.expenses.map((e) => e.currency),
      ...s1.stays.map((x) => x.currency),
      ...s1.transport.map((t) => t.currency),
    ]);
  });

  backfillRates().then((n) => {
    if (n) toast(`${plural(n, 'offline expense')} converted`);
  });
  addEventListener('online', () => { backfillRates(); });

  const warnings = Store.getWarnings();
  if (warnings.length) {
    toast(`${plural(warnings.length, 'data warning')} — see Trip data`);
  }
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
else start();
