/* Currency: Frankfurter (ECB reference rates) — free, no key.

   The snapshot rule (spec §4): when an expense is recorded, the rate is
   fetched once and stored with it. Totals come from the stored homeAmount and
   never move afterwards. */
import { get } from './net.js';
import { todayISO, day } from '../lib/util.js';

export async function rate(from, to, onISO) {
  if (!from || !to) return null;
  if (from === to) return { rate: 1, date: onISO || todayISO() };
  const d = day(onISO || todayISO());
  const url = `https://api.frankfurter.app/${d}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await get(`fx.${from}.${to}.${d}`, url, {
    pick: (j) => ({ rate: j.rates?.[to] ?? null, date: j.date || d }),
  });
  return res.data?.rate ? res.data : null;
}

/* Fields to store on an expense. Offline, homeAmount stays null and is
   backfilled next time online — still snapshotting the rate at that point,
   never left perpetually live. */
export async function snapshot(amount, currency, homeCurrency, onISO) {
  const r = await rate(currency, homeCurrency, onISO);
  if (!r) return { homeAmount: null, homeCurrency, rateSnapshotDate: null };
  return {
    homeAmount: Math.round(amount * r.rate * 100) / 100,
    homeCurrency,
    rateSnapshotDate: r.date,
  };
}
