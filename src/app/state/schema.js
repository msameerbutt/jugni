/* The internal schema (spec §4) as the app sees it. Users never touch this;
   it exists so the app can normalise whatever input.json it is handed and
   detect drift instead of misreading it. */
import { uid } from '../lib/util.js';

export const SCHEMA_VERSION = '1.7';

export const COLLECTIONS = [
  'travelers', 'cities', 'transport', 'stays', 'checklist',
  'expenses', 'destinationNotes', 'log', 'extras',
];

export function emptyDoc() {
  return {
    trip: {
      schemaVersion: SCHEMA_VERSION, name: '', startDate: '', endDate: '',
      homeCurrency: '', budget: 0, notes: '', theme: 'light',
    },
    ...Object.fromEntries(COLLECTIONS.map((k) => [k, []])),
    /* Ids of catalogue defaults the traveller deleted. Without this, a
       deleted default reappears on the next load, which reads as a bug. */
    suppressed: [],
  };
}

export function normalize(raw) {
  const warnings = [];
  const doc = emptyDoc();
  if (!raw || typeof raw !== 'object') {
    return { doc, warnings: ['No data — starting empty.'] };
  }

  Object.assign(doc.trip, raw.trip || {});
  doc.trip.schemaVersion ||= SCHEMA_VERSION;
  if (doc.trip.schemaVersion !== SCHEMA_VERSION) {
    warnings.push(
      `This file was written against schema ${doc.trip.schemaVersion}; this app reads ${SCHEMA_VERSION}.`);
  }
  doc.trip.theme = doc.trip.theme === 'dark' ? 'dark' : 'light';

  for (const key of COLLECTIONS) {
    const list = Array.isArray(raw[key]) ? raw[key] : [];
    doc[key] = list.map((rec, i) => ({ ...rec, id: rec?.id || uid(`${key.slice(0, 4)}${i}`) }));
  }
  doc.suppressed = Array.isArray(raw.suppressed) ? [...raw.suppressed] : [];

  /* A dangling cityId is a data bug worth surfacing, not silently rendering
     as a blank label. */
  const cityIds = new Set(doc.cities.map((c) => c.id));
  for (const key of ['stays', 'checklist', 'expenses', 'destinationNotes', 'extras']) {
    for (const r of doc[key]) {
      if (r.cityId && !cityIds.has(r.cityId)) {
        warnings.push(
          `${key} record "${r.task || r.label || r.title || r.name || r.id}" points at unknown city ${r.cityId}.`);
        r.cityId = '';
      }
    }
  }

  return { doc, warnings };
}

/* ---------------------------------------------------------------------------
   default.json — the standard catalogue (feedback F4).

   It defines categories and a set of checklist items that most trips want, so
   "pack a shaver" is not remembered only when the agent happens to think of
   it. Each item declares when it applies, so an Arctic item does not turn up
   on a beach trip.

   input.json may ADD, and may suppress an instance, but cannot redefine a
   category or rewrite a default's text — that is what makes the catalogue
   authoritative while the traveller's list stays theirs.
   ------------------------------------------------------------------------- */

export function evaluateCondition(cond, doc) {
  if (!cond || cond === 'always') return true;

  const [kind, arg = ''] = String(cond).split(':');
  const cities = doc.cities || [];

  switch (kind) {
    case 'persona': {
      const primary = (doc.travelers || []).find((t) => t.role === 'primary');
      return !!primary?.personaProfiles?.includes(arg);
    }
    case 'country':
      return cities.some((c) =>
        String(c.countryCode || '').toLowerCase() === arg.toLowerCase() ||
        String(c.country || '').toLowerCase() === arg.toLowerCase());
    case 'lat': {
      /* "lat:>60" — a proxy for far-north trips, which is what actually
         drives thermal layers and daylight planning. */
      const m = /^([<>])(-?\d+(?:\.\d+)?)$/.exec(arg);
      if (!m) return false;
      const [, op, value] = m;
      return cities.some((c) => typeof c.lat === 'number' &&
        (op === '>' ? c.lat > +value : c.lat < +value));
    }
    case 'cities':
      return cities.length >= (parseInt(arg, 10) || 0);
    case 'nights': {
      const s = doc.trip?.startDate, e = doc.trip?.endDate;
      if (!s || !e) return false;
      return Math.round((new Date(e) - new Date(s)) / 86400000) >= (parseInt(arg, 10) || 0);
    }
    case 'currencies':
      return new Set(cities.map((c) => c.country).filter(Boolean)).size >= (parseInt(arg, 10) || 0);
    default:
      return false;
  }
}

/* Words that carry no identity, so two tasks are not judged similar merely
   for both containing "the". */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'before', 'by', 'for', 'from',
  'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with', 'your', 'you',
  'any', 'every', 'all', 'each',
]);

const signature = (text) => new Set(
  String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)));

/* The agent writing "Buy travel insurance covering Schengen and the Arctic
   leg" from the raw data has already covered the catalogue's "Buy travel
   insurance". Exact-text matching missed that and shipped both. Containment,
   not equality: if nearly all of a default's meaningful words already appear
   in some existing task, the default is redundant. */
function isCovered(defaultTask, existingSignatures) {
  const words = signature(defaultTask);
  if (!words.size) return false;
  for (const existing of existingSignatures) {
    let hits = 0;
    for (const w of words) if (existing.has(w)) hits += 1;
    if (hits / words.size >= 0.75) return true;
  }
  return false;
}

export function applyDefaults(doc, catalogue) {
  if (!catalogue?.checklistDefaults?.length) return doc;

  const suppressed = new Set(doc.suppressed || []);
  const existing = new Set(doc.checklist.map((c) => c.id));
  const existingSignatures = doc.checklist.map((c) => signature(c.task));

  for (const item of catalogue.checklistDefaults) {
    const id = `def_${item.id}`;
    if (suppressed.has(id) || existing.has(id)) continue;
    if (isCovered(item.task, existingSignatures)) continue;

    const conditions = Array.isArray(item.appliesTo) ? item.appliesTo : [item.appliesTo || 'always'];
    if (!conditions.some((c) => evaluateCondition(c, doc))) continue;

    doc.checklist.push({
      id,
      task: item.task,
      category: item.category || 'general',
      cityId: '',
      dueDate: relativeDue(item.dueOffset, doc.trip?.startDate),
      done: false,
      completedDate: null,
      source: 'default',
      note: item.note || '',
    });
  }
  return doc;
}

/* Catalogue items carry an offset in days before departure rather than a
   date, since the catalogue does not know when any given trip leaves.

   A trip generated close to departure would otherwise instantiate half its
   standard checklist already overdue — which is noise, not information. When
   the computed date has passed, the item is due today instead. */
function relativeDue(offset, startDate) {
  if (offset === undefined || offset === null || !startDate) return '';
  const d = new Date(startDate);
  if (isNaN(d)) return '';
  d.setDate(d.getDate() - Number(offset));

  const iso = (x) => [x.getFullYear(), String(x.getMonth() + 1).padStart(2, '0'),
                      String(x.getDate()).padStart(2, '0')].join('-');
  const today = iso(new Date());
  const computed = iso(d);
  return computed < today ? today : computed;
}
