/* Live widgets call free, no-key APIs directly from the browser (spec §8).
   Every call caches its last success; a failed call shows the cached value
   with a "last updated" stamp instead of breaking — and if there has never
   been a successful call, an explicit "not yet available" state (spec §12). */

const Net = {
  CACHE_PREFIX: 'jugni.cache.',
  TTL_MS: 3 * 60 * 60 * 1000,   /* 3h — travel wifi is patchy; don't refetch hard */

  readCache(key) {
    try {
      const raw = localStorage.getItem(Net.CACHE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  writeCache(key, data) {
    try {
      localStorage.setItem(Net.CACHE_PREFIX + key,
        JSON.stringify({ at: new Date().toISOString(), data: data }));
    } catch (e) { /* storage full or blocked — the live value still renders */ }
  },

  /* Resolves to { data, at, state } where state is:
       'fresh'  — just fetched
       'cached' — the network failed (or cache is still warm); showing stored data
       'never'  — offline and nothing was ever fetched                          */
  async get(key, url, opts) {
    const cached = Net.readCache(key);
    const fresh = cached && (Date.now() - new Date(cached.at).getTime() < Net.TTL_MS);

    if (fresh && !(opts && opts.force)) {
      return { data: cached.data, at: cached.at, state: 'cached' };
    }

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(function () { ctrl.abort(); }, 12000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const data = (opts && opts.pick) ? opts.pick(json) : json;
      Net.writeCache(key, data);
      return { data: data, at: new Date().toISOString(), state: 'fresh' };
    } catch (e) {
      if (cached) return { data: cached.data, at: cached.at, state: 'cached', error: String(e.message || e) };
      return { data: null, at: null, state: 'never', error: String(e.message || e) };
    }
  },

  /* The "last updated" badge, rendered the same way everywhere. */
  stamp(result) {
    if (!result || result.state === 'never') {
      return '<span class="stamp stamp--stale">' + U.icon('warn', 12) +
             ' not yet available — connect once to fetch</span>';
    }
    const at = new Date(result.at);
    const ageH = (Date.now() - at.getTime()) / 3600000;
    const label = ageH < 1 ? 'just now'
      : at.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const stale = result.state === 'cached' && result.error;
    return '<span class="stamp' + (stale ? ' stamp--stale' : '') + '">' +
      (stale ? U.icon('warn', 12) + ' offline — ' : '') + 'last updated ' + U.esc(label) + '</span>';
  }
};
