/* Shared presentation. Screens compose these rather than re-inventing markup,
   so one visual decision changes in one place. */
import { html } from '../lib/html.js';
import { Icon } from '../lib/icons.js';
import { moneyParts, pct as pctOf } from '../lib/util.js';
import { useRates, toHome } from '../data/rates.js';
import { useState, useEffect, useRef, useCallback, usePref, usePrefersReducedMotion } from './hooks.js';

/* ---------- Copy to clipboard ----------
   For the details a traveller actually has to retype somewhere else — a
   booking reference into an airline app, a confirmation number at a hotel
   desk, an address into a taxi app. The async Clipboard API needs a secure
   context, which file:// is not guaranteed to be (spec §8's normal case), so
   a hidden-textarea fallback covers where it is unavailable or refused. */
async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { /* permission denied or insecure context — fall through */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/* Icon-only by default so it drops beside existing text without disturbing
   layout; pass `children` for a labelled variant (address blocks). */
export function CopyButton({ value, label, children, class: cls = '' }) {
  const [state, setState] = useState('idle');   // idle | copied | failed

  const onClick = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();   // several call sites sit inside a linked card
    if (!value) return;
    const ok = await writeClipboard(String(value));
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 1600);
  }, [value]);

  if (!value) return null;

  return html`
    <button type="button" class=${`copybtn ${children ? 'copybtn--labelled' : ''} ${cls}`}
            onClick=${onClick} data-state=${state}
            aria-label=${children ? undefined : `Copy ${label || value}`}>
      <${Icon} name=${state === 'failed' ? 'x' : state === 'copied' ? 'check' : 'copy'} />
      ${children}
      <span class="visually-hidden" role="status">
        ${state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Could not copy' : ''}
      </span>
    </button>`;
}

/* ---------- Money: the code is always stated (F15) ---------- */
export function Money({ amount, currency, digits, class: cls = "" }) {
  const p = moneyParts(amount, currency, digits);
  return html`<span class=${`money ${cls}`}>
    ${p.code && html`<span class="money__code">${p.code}</span>`}
    <span class="money__amount">${p.amount}</span>
  </span>`;
}

/* Amounts read in the traveller's home currency everywhere, so figures on the
   same screen can be compared without doing arithmetic (feedback cycle 01).

   The original charge is not thrown away — it stays as secondary text, because
   at a check-in desk what matters is the number on the booking, and spec §4's
   currency-authority rule is about storing that faithfully. Primary figure:
   comparable. Secondary: what was actually charged. */
/* One figure, in the trip's own currency.

   A trip has one currency now (Trip data → Edit trip), so a row showing both
   the converted and the charged amount was two numbers where the reader wanted
   one — and a list of them could not be scanned or added up by eye. Anything
   that genuinely needs saying about what was handed over goes in the expense's
   comment, in words.

   `showOriginal` survives for the few places a booking's charged currency is
   the point rather than the noise, such as a stay's own detail card. */
export function HomeMoney({ amount, currency, home, snapshotHome, hints, class: cls = '', showOriginal = false }) {
  const rates = useRates();
  const isHome = !currency || currency === home;

  if (isHome) return html`<${Money} amount=${amount} currency=${home || currency} class=${cls} />`;

  /* A stored snapshot wins outright: a recorded expense carries the rate from
     when it was entered, and totals must not drift against their own rows. */
  const resolved = typeof snapshotHome === 'number'
    ? { value: snapshotHome, source: 'snapshot' }
    : toHome(amount, currency, rates, hints);
  const converted = resolved?.value;

  if (converted === null || converted === undefined) {
    /* Offline with no cached rate: show the real charge rather than a guess. */
    return html`<span class=${`money-group ${cls}`}>
      <${Money} amount=${amount} currency=${currency} />
      <span class="money-alt faint">not converted yet</span>
    </span>`;
  }

  return html`<span class=${`money-group ${cls}`}>
    <${Money} amount=${converted} currency=${home} />
    ${showOriginal && html`<span class="money-alt">
      <${Money} amount=${amount} currency=${currency} />
      ${resolved.source !== 'snapshot' && html`<span class="faint"> approx</span>`}
    </span>`}
  </span>`;
}

export function Stat({ label, value, note, modifier = '', children }) {
  return html`<div class=${`stat ${modifier}`}>
    <span class="stat__label">${label}</span>
    <span class="stat__value">${value}</span>
    ${note && html`<span class="stat__note">${note}</span>`}
    ${children}
  </div>`;
}

export function Meter({ value, max, over, large }) {
  const width = max > 0 ? pctOf(value, max) : 0;
  return html`<div class=${`meter ${large ? 'meter--lg' : ''}`} role="presentation">
    <div class=${`meter__fill ${over ? 'meter__fill--over' : ''}`} style=${`width:${width}%`}></div>
  </div>`;
}

export const Badge = ({ kind, children }) =>
  html`<span class=${`badge ${kind ? `badge--${kind}` : ''}`}>${children}</span>`;

export function Empty({ icon = 'sparkles', title, body, children }) {
  return html`<div class="empty">
    <${Icon} name=${icon} class="icon" />
    <p class="empty__title">${title}</p>
    ${body && html`<p class="small">${body}</p>`}
    ${children && html`<div style="margin-top:var(--space-4)">${children}</div>`}
  </div>`;
}

/* The "last updated" badge, rendered identically everywhere (spec §8/§12). */
export function Stamp({ result }) {
  if (!result || result.state === 'never') {
    return html`<span class="stamp stamp--stale">
      <${Icon} name="wifi-off" /> not yet available — connect once to fetch
    </span>`;
  }
  const at = new Date(result.at);
  const ageH = (Date.now() - at.getTime()) / 3600000;
  const label = ageH < 1
    ? 'just now'
    : at.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const stale = result.state === 'cached' && result.error;
  return html`<span class=${`stamp ${stale ? 'stamp--stale' : ''}`}>
    ${stale && html`<${Icon} name="wifi-off" />`}
    ${stale ? 'offline — ' : ''}last updated ${label}
  </span>`;
}

export function Section({ title, icon, actions, children, count }) {
  return html`<section class="section">
    ${(title || actions) && html`<div class="section__head">
      ${title && html`<h2 class="section__title">
        ${icon && html`<${Icon} name=${icon} />`}${title}
        ${count !== undefined && html`<span class="small muted tkt">${count}</span>`}
      </h2>`}
      ${actions && html`<div class="row-actions">${actions}</div>`}
    </div>`}
    ${children}
  </section>`;
}

export function PageHead({ eyebrow, title, actions, children }) {
  return html`<header class="page-head">
    <div class="page-head__text">
      ${eyebrow && html`<span class="eyebrow eyebrow--accent">${eyebrow}</span>`}
      <h1>${title}</h1>
      ${children}
    </div>
    ${actions && html`<div class="page-head__actions hide-readonly">${actions}</div>`}
  </header>`;
}

/* ---------- Collapsible section (F12) ----------
   Open state is remembered per section per city; a section holding an alert
   refuses to collapse, because hiding the one urgent thing is worse than a
   long page. */
export function Fold({ id, title, icon, count, defaultOpen = false, alert = false, children }) {
  const [openMap, setOpenMap] = usePref('folds', {});
  const stored = openMap[id];
  const open = alert ? true : (stored === undefined ? defaultOpen : stored);

  const toggle = () => {
    if (alert) return;
    setOpenMap((prev) => ({ ...prev, [id]: !open }));
  };

  return html`<section class=${`fold ${alert ? 'fold--alert' : ''}`}>
    <button class="fold__head" aria-expanded=${String(open)} aria-controls=${`fold-${id}`}
            onClick=${toggle} disabled=${alert}>
      ${icon && html`<${Icon} name=${icon} />`}
      <span>${title}</span>
      ${count !== undefined && count !== null && html`<span class="fold__count">${count}</span>`}
      ${!alert && html`<${Icon} name="chevron-down" class="fold__chev" />`}
    </button>
    ${open && html`<div class="fold__body fold__body--in" id=${`fold-${id}`}>${children}</div>`}
  </section>`;
}

/* Expand-all / collapse-all for a set of Folds. */
export function FoldControls({ ids }) {
  const [openMap, setOpenMap] = usePref('folds', {});
  const anyClosed = ids.some((id) => openMap[id] === false || openMap[id] === undefined);
  const setAll = (value) =>
    setOpenMap((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, value])) }));

  return html`<button class="btn btn--ghost" onClick=${() => setAll(anyClosed)}>
    <${Icon} name="chevrons-down-up" />
    ${anyClosed ? 'Expand all' : 'Collapse all'}
  </button>`;
}

/* ---------- Carousel (F11) ----------
   Real horizontal scrolling with snap points, so touch, trackpad, keyboard
   and the buttons all drive the same thing. Touch-only widgets strand
   desktop users. */
export function Carousel({ label, children }) {
  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const items = Array.isArray(children) ? children : [children];
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const step = el.scrollWidth / Math.max(1, items.length);
      setIndex(Math.round(el.scrollLeft / step));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [items.length]);

  const go = (delta) => {
    const el = track.current;
    if (!el) return;
    const step = el.clientWidth * 0.85;
    el.scrollBy({ left: delta * step, behavior: reduced ? 'auto' : 'smooth' });
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };

  return html`<div class="carousel">
    <div class="carousel__track" ref=${track} tabindex="0" role="group"
         aria-label=${`${label} — scroll or use arrow keys`} onKeyDown=${onKeyDown}>
      ${items}
    </div>
    ${items.length > 1 && html`<div class="carousel__nav">
      <button class="btn btn--ghost btn--icon" onClick=${() => go(-1)} aria-label="Previous">
        <${Icon} name="chevron-left" />
      </button>
      <div class="carousel__dots" aria-hidden="true">
        ${items.map((_, i) => html`
          <span class="carousel__dot" aria-current=${String(i === index)}></span>`)}
      </div>
      <button class="btn btn--ghost btn--icon" onClick=${() => go(1)} aria-label="Next">
        <${Icon} name="chevron-right" />
      </button>
      <span class="spacer"></span>
      <span class="small muted tkt">${index + 1} / ${items.length}</span>
    </div>`}
  </div>`;
}

/* ---------- Form fields ---------- */

export function Field({ label, name, type = 'text', value, options, hint, rows, ...rest }) {
  const id = `f_${name}`;
  let control;

  if (type === 'static') {
    /* A field the form states but does not ask about — the trip's currency,
       which is set once in Trip data and is the same on every expense. Shown
       as a field rather than omitted so the form still says what unit the
       amount beside it is in. */
    control = html`<output class="input input--static" id=${id} name=${name}>${value}</output>`;
  } else if (type === 'select') {
    control = html`<select class="select" id=${id} name=${name}>
      ${(options || []).map((o) => {
        const val = o?.value !== undefined ? o.value : o;
        const lbl = o?.label !== undefined ? o.label : o;
        return html`<option value=${val} selected=${String(val) === String(value ?? '')}>${lbl}</option>`;
      })}
    </select>`;
  } else if (type === 'textarea') {
    control = html`<textarea class="textarea" id=${id} name=${name} rows=${rows || 4}>${value || ''}</textarea>`;
  } else {
    control = html`<input class=${`input ${type === 'number' ? 'input--num' : ''} ${rest.big ? 'input--amount' : ''}`}
      id=${id} name=${name} type=${type} value=${value ?? ''} ...${{
        step: rest.step, min: rest.min, placeholder: rest.placeholder,
        autofocus: rest.autofocus, inputmode: rest.inputmode,
      }} />`;
  }

  return html`<div class="field">
    <label for=${id}>${label}</label>
    ${control}
    ${hint && html`<span class="field__hint">${hint}</span>`}
  </div>`;
}
