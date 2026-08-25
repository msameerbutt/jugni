/* Shared helpers. No imports — everything else may depend on this. */

export const uid = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

/* ---------- Dates ----------
   Trip dates are calendar dates. Parse them as LOCAL, never UTC, or a date
   slides a day depending on where the reader happens to be. */
export function toDate(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) { const d = new Date(iso); return isNaN(d) ? null : d; }
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function todayISO(d = new Date()) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0')].join('-');
}

export const day = (iso) => (iso || '').slice(0, 10);

export function dayDiff(aISO, bISO) {
  const a = toDate(aISO), b = toDate(bISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export function addDays(iso, n) {
  const d = toDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

export const inRange = (iso, startISO, endISO) =>
  !!(iso && startISO && endISO && day(iso) >= day(startISO) && day(iso) <= day(endISO));

export const fmtDate = (iso, opts) => {
  const d = toDate(iso);
  return d ? d.toLocaleDateString(undefined, opts || { day: '2-digit', month: 'short' }) : '';
};
export const fmtDateLong = (iso) =>
  fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateMed = (iso) =>
  fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });

export function fmtRange(aISO, bISO) {
  if (!aISO) return '';
  if (!bISO || day(aISO) === day(bISO)) return fmtDate(aISO);
  return `${fmtDate(aISO)} – ${fmtDate(bISO)}`;
}

/* Datetimes carry an explicit offset (spec §4). Render the time as written —
   the local time at that place — never re-zoned to the reader's clock. */
export function fmtLocalTime(dt) {
  const m = /T(\d{2}):(\d{2})/.exec(dt || '');
  return m ? `${m[1]}:${m[2]}` : '';
}
export function fmtLocalDateTime(dt) {
  if (!dt) return '';
  const t = fmtLocalTime(dt);
  return fmtDate(day(dt)) + (t ? ` · ${t}` : '');
}
export function tzLabel(dt) {
  const m = /([+-]\d{2}:\d{2})$/.exec(dt || '');
  return m ? `UTC${m[1].replace(':00', '')}` : '';
}
export function duration(fromDt, toDt) {
  if (!fromDt || !toDt) return '';
  const a = new Date(fromDt), b = new Date(toDt);
  if (isNaN(a) || isNaN(b)) return '';
  const mins = Math.round((b - a) / 60000);
  if (mins <= 0 || mins > 60 * 48) return '';
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

/* ---------- Money ----------
   F15: never Intl's narrow symbol. "A$1,234" does not say which dollar; the
   code does. Returns parts so the code can be styled down. */
export function moneyParts(amount, currency, forceDigits) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return { code: currency || "", amount: "—" };
  }
  const abs = Math.abs(amount);
  /* Big figures lose their cents by default: a headline stat reads better as
     "AUD 1,909" than "AUD 1,909.12". A column that has to add up is the
     exception — drop the cents there and the rows visibly do not sum to the
     total under them, which is how a table stops being believed. Callers that
     need every figure in one column formatted alike pass `forceDigits`. */
  const digits = forceDigits !== undefined ? forceDigits : (abs >= 1000 ? 0 : 2);
  let text;
  try {
    text = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: digits, maximumFractionDigits: digits
    }).format(amount);
  } catch { text = Number(amount).toFixed(digits); }
  return { code: currency || '', amount: text };
}
export function moneyText(amount, currency, forceDigits) {
  const p = moneyParts(amount, currency, forceDigits);
  return p.code ? `${p.code} ${p.amount}` : p.amount;
}

export const titleCase = (s) =>
  String(s || '').replace(/(^|[\s-])([a-z])/g, (_, p, c) => p + c.toUpperCase());

export function sortBy(arr, keyFn) {
  return [...arr].sort((a, b) => {
    const ka = keyFn(a), kb = keyFn(b);
    if (ka === kb) return 0;
    if (ka === null || ka === undefined || ka === '') return 1;
    if (kb === null || kb === undefined || kb === '') return -1;
    return ka < kb ? -1 : 1;
  });
}

export const groupBy = (arr, keyFn) => arr.reduce((acc, item) => {
  const k = keyFn(item);
  (acc[k] ||= []).push(item);
  return acc;
}, {});

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const pct = (part, whole) => (whole > 0 ? clamp(Math.round((part / whole) * 100), 0, 100) : 0);
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

/* ISO 3166-1 alpha-2 for the countries Jugni has actually seen, so a flag can
   be looked up from `cities[].country`. `countryCode` on the record wins when
   the Convert Skill supplied one. */
const COUNTRY_CODES = {
  australia: 'au', austria: 'at', belgium: 'be', croatia: 'hr', czechia: 'cz',
  'czech republic': 'cz', denmark: 'dk', estonia: 'ee', finland: 'fi', france: 'fr',
  germany: 'de', greece: 'gr', hungary: 'hu', iceland: 'is', ireland: 'ie',
  italy: 'it', japan: 'jp', latvia: 'lv', lithuania: 'lt', luxembourg: 'lu',
  malaysia: 'my', netherlands: 'nl', 'new zealand': 'nz', norway: 'no', poland: 'pl',
  portugal: 'pt', romania: 'ro', serbia: 'rs', singapore: 'sg', slovakia: 'sk',
  slovenia: 'si', spain: 'es', sweden: 'se', switzerland: 'ch', thailand: 'th',
  turkey: 'tr', türkiye: 'tr', turkiye: 'tr', 'united kingdom': 'gb',
  'united states': 'us', usa: 'us', uk: 'gb', vietnam: 'vn', india: 'in',
  indonesia: 'id', 'united arab emirates': 'ae', canada: 'ca', mexico: 'mx',
};
export function countryCode(city) {
  if (!city) return '';
  if (city.countryCode) return String(city.countryCode).toLowerCase();
  return COUNTRY_CODES[String(city.country || '').trim().toLowerCase()] || '';
}
