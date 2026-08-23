/* Currency: Frankfurter (ECB reference rates) — free, no key.

   The snapshot rule (spec §4): when an expense is recorded, the rate is
   fetched once and stored alongside it. Totals are computed from the stored
   homeAmount and never move afterwards. Live conversion is only used for
   informational display of "roughly what things cost here". */

const Currency = {
  async rate(from, to, onISO) {
    if (!from || !to) return null;
    if (from === to) return { rate: 1, date: onISO || U.todayISO() };
    const day = (onISO || U.todayISO()).slice(0, 10);
    const url = 'https://api.frankfurter.app/' + day + '?from=' + encodeURIComponent(from) +
                '&to=' + encodeURIComponent(to);
    const res = await Net.get('fx.' + from + '.' + to + '.' + day, url, {
      pick: function (j) { return { rate: j.rates ? j.rates[to] : null, date: j.date || day }; }
    });
    return res.data && res.data.rate ? res.data : null;
  },

  /* Returns the fields to store on an expense. If the rate cannot be fetched
     (offline), homeAmount is left null and filled in next time we're online —
     still snapshotting the rate at that point, never left perpetually live. */
  async snapshot(amount, currency, homeCurrency) {
    const r = await Currency.rate(currency, homeCurrency);
    if (!r) return { homeAmount: null, homeCurrency: homeCurrency, rateSnapshotDate: null };
    return {
      homeAmount: Math.round(amount * r.rate * 100) / 100,
      homeCurrency: homeCurrency,
      rateSnapshotDate: r.date
    };
  },

  /* Backfill anything saved while offline. Called on boot and after import. */
  async backfill() {
    const pending = Trip.unconverted();
    if (!pending.length || !navigator.onLine) return 0;
    const home = Trip.t().homeCurrency;
    let filled = 0;
    for (const e of pending) {
      if (!e.currency || !e.amount) continue;
      const snap = await Currency.snapshot(e.amount, e.currency, home);
      if (snap.homeAmount !== null) {
        Store.mutate(function (s) {
          const rec = s.expenses.filter(function (x) { return x.id === e.id; })[0];
          if (rec) Object.assign(rec, snap);
        });
        filled++;
      }
    }
    return filled;
  }
};
