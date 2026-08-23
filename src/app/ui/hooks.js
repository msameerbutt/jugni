import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

/* Runs an async loader and reports its lifecycle. Guards against setting
   state after unmount, which is how "offline" screens used to leak. */
export function useAsync(loader, deps = [], initial = null) {
  const [result, setResult] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.resolve(loader())
      .then((value) => { if (alive) { setResult(value); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [...deps, nonce]);

  return { result, loading, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

/* Per-viewer preferences that are not trip data: which sections are open,
   the last currency used. Never trip content — that belongs in the store. */
export function usePref(key, fallback) {
  const full = `jugni.pref.${key}`;
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(full);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  });
  const update = useCallback((next) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(full, JSON.stringify(resolved)); } catch { /* ignore */ }
      return resolved;
    });
  }, [full]);
  return [value, update];
}

/* Hash routing. Returns { name, param } and re-renders on change. */
export function useRoute(fallbackFor) {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);

  const raw = (hash || '').replace(/^#\/?/, '');
  const [name, param] = raw.split('/');
  return { name: name || fallbackFor(), param: param || null };
}

export const navigate = (route) => { location.hash = `#/${route}`; };

/* Reduced motion is a hard requirement (spec §8), so animations ask first. */
export function usePrefersReducedMotion() {
  /* `globalThis.matchMedia`, not a bare `matchMedia`: optional chaining does
     not rescue an identifier that was never declared, and non-browser hosts
     (the jsdom smoke test among them) do not define it at all. */
  const [reduced, setReduced] = useState(
    () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = globalThis.matchMedia?.(query);
    if (!mq) return undefined;
    const on = () => setMatches(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return matches;
}

export { useState, useEffect, useRef, useCallback };
