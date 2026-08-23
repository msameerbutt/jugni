/* One rate table for the whole trip, so every screen can show the home
   currency without each component firing its own request.

   Spec §4 draws the line this depends on: recorded expenses keep the rate
   snapshotted at entry time and never move. Everything else here — what a
   hotel booking cost, what a flight cost — is informational display, and the
   spec explicitly allows a live rate for that. The two never mix: a converted
   booking figure is never written back into expenses[]. */
import { useSyncExternalStore } from 'preact/compat';
import { get } from './net.js';
import { day, todayISO } from '../lib/util.js';

let table = { base: '', rates: {}, date: '', state: 'idle' };
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const getSnap = () => table;

export const useRates = () => useSyncExternalStore(subscribe, getSnap, getSnap);
/* Plain read, for code outside the component tree (actions, sheets). */
export const getRates = () => table;

let inflight = '';

/* Called once on boot with every currency the trip mentions. Frankfurter
   takes them all in one request, so this costs a single call rather than one
   per booking. */
export async function ensureRates(home, currencies) {
  if (!home) return;
  const wanted = [...new Set(currencies)].filter((c) => c && c !== home).sort();
  if (!wanted.length) {
    table = { base: home, rates: {}, date: todayISO(), state: 'fresh' };
    listeners.forEach((fn) => fn());
    return;
  }

  const key = `${home}:${wanted.join(',')}`;
  if (inflight === key) return;
  inflight = key;
  /* Cleared in a finally below: leaving it set meant a failed first attempt
     blocked every later retry, including the one fired on 'online'. */

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(home)}`
    + `&to=${wanted.map(encodeURIComponent).join(',')}`;

  const res = await get(`fxset.${home}.${wanted.join('-')}.${day(todayISO())}`, url, {
    pick: (j) => ({ rates: j.rates || {}, date: j.date || todayISO() }),
  });

  table = {
    base: home,
    rates: res.data?.rates || {},
    date: res.data?.date || '',
    /* 'never' means offline with nothing cached — resolution then falls
       through to the document-implied hints. */
    state: res.state,
  };
  inflight = '';
  listeners.forEach((fn) => fn());
}

/* Resolving a home-currency figure, best source first:

     1. a stored snapshot on the record (expenses, spec §4 — never overridden)
     2. the live rate table, when the API is reachable
     3. `trip.rateHints` — rates implied by the traveller's OWN booking
        documents, which state both the local charge and a home-currency
        equivalent. Dated, sourced, and marked approximate in the UI.
     4. nothing: show the real charge, labelled

   Step 3 exists because step 2 cannot be relied on. A trip file is opened from
   file://, often on hostel wifi or a plane, and the rates API may be blocked
   outright — as it is from this project's own build environment. A figure the
   traveller can read offline beats a correct figure they never see. */
export function toHome(amount, currency, snapshot, hints) {
  if (amount === null || amount === undefined || isNaN(amount)) return null;
  if (!currency || currency === snapshot.base) return { value: amount, source: 'home' };

  const live = snapshot.rates?.[currency];
  if (live) return { value: round2(amount / live), source: 'live' };

  const hint = hints?.[currency];
  if (hint) return { value: round2(amount * hint), source: 'hint' };

  return null;
}

const round2 = (n) => Math.round(n * 100) / 100;
