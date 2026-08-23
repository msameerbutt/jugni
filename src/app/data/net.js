/* Live widgets call free, no-key APIs directly from the browser (spec §8).
   Every call caches its last success; a failed call shows the cached value
   with a "last updated" stamp instead of breaking — and if there has never
   been a successful call, an explicit "not yet available" state (spec §12). */

const PREFIX = 'jugni.cache.';
const TTL_MS = 3 * 60 * 60 * 1000;   /* travel wifi is patchy; don't refetch hard */

export function readCache(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCache(key, data) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ at: new Date().toISOString(), data })); }
  catch { /* storage full — the live value still renders this session */ }
}

/* Resolves to { data, at, state } where state is:
     'fresh'  — just fetched
     'cached' — showing stored data (cache warm, or the network failed)
     'never'  — offline and nothing was ever fetched                     */
export async function get(key, url, { pick, force } = {}) {
  const cached = readCache(key);
  const warm = cached && Date.now() - new Date(cached.at).getTime() < TTL_MS;
  if (warm && !force) return { data: cached.data, at: cached.at, state: 'cached' };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = pick ? pick(json) : json;
    writeCache(key, data);
    return { data, at: new Date().toISOString(), state: 'fresh' };
  } catch (err) {
    const message = String(err?.message || err);
    if (cached) return { data: cached.data, at: cached.at, state: 'cached', error: message };
    return { data: null, at: null, state: 'never', error: message };
  }
}
