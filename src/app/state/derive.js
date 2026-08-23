/* Derived views over the trip. Nothing here is stored — it is all computed,
   so there is never a second copy to keep in sync. */
import { day, dayDiff, inRange, sortBy, todayISO, addDays, pct } from '../lib/util.js';

export const primaryTraveler = (s) =>
  s.travelers.find((t) => t.role === 'primary') || s.travelers[0] || null;

export const headcount = (s) => Math.max(1, s.travelers.length);

/* "Sameer's" — whose Jugni this is. Empty when no nickname is set, so the
   wordmark falls back to plain "Jugni" rather than reading "'s Jugni".

   This updates itself on a fork: the moment a companion imports the file and
   enters their own nickname, the app stops claiming to be someone else's. */
export function ownerPossessive(s) {
  const nick = primaryTraveler(s)?.nickname?.trim();
  if (!nick) return '';
  const shown = nick.charAt(0).toUpperCase() + nick.slice(1);
  /* Chris' rather than Chris's, for names already ending in s. */
  return /s$/i.test(shown) ? `${shown}'` : `${shown}'s`;
}

/* Date-aware default view (spec §12): before → Upcoming, during → Today,
   after → Recap. The single highest-value navigation decision. */
export function phase(s, iso = todayISO()) {
  const { startDate, endDate } = s.trip;
  if (!startDate) return 'planning';
  if (day(iso) < day(startDate)) return 'before';
  if (endDate && day(iso) > day(endDate)) return 'after';
  return 'during';
}

export const daysUntilStart = (s) => dayDiff(todayISO(), s.trip.startDate);
export const dayNumber = (s, iso = todayISO()) => {
  const d = dayDiff(s.trip.startDate, iso);
  return d === null ? null : d + 1;
};
export const totalDays = (s) => {
  const d = dayDiff(s.trip.startDate, s.trip.endDate);
  return d === null ? null : d + 1;
};

export const citiesInOrder = (s) =>
  sortBy(s.cities, (c) => c.arriveDate || c.departDate || '');
export const cityById = (s, id) => s.cities.find((c) => c.id === id) || null;
export const cityName = (s, id) => cityById(s, id)?.name || '';

export function cityOn(s, iso = todayISO()) {
  const d = day(iso);
  const hit = s.cities.find((c) => inRange(d, c.arriveDate, c.departDate || c.arriveDate));
  if (hit) return hit;
  /* On a travel day, or in a gap the raw data never covered, fall back to the
     most recent city already arrived in. */
  const past = citiesInOrder(s).filter((c) => c.arriveDate && day(c.arriveDate) <= d);
  return past.at(-1) || null;
}

export const transportInOrder = (s) => sortBy(s.transport, (t) => t.departDateTime || '');
export const nextLeg = (s, iso = todayISO()) =>
  transportInOrder(s).find((t) => day(t.departDateTime) >= day(iso)) || null;
export const legsOn = (s, iso = todayISO()) =>
  transportInOrder(s).filter((t) => day(t.departDateTime) === day(iso));

/* Legs touching a city. Matching on name alone misses the common case where a
   flight says "OSL" and the city says "Oslo", so dates lead. */
export function legsForCity(s, city) {
  if (!city) return [];
  const arrive = day(city.arriveDate), depart = day(city.departDate);
  const name = (city.name || '').toLowerCase().split(/[\s/]/)[0];
  return transportInOrder(s).filter((l) => {
    if (arrive && day(l.arriveDateTime) === arrive) return true;
    if (depart && day(l.departDateTime) === depart) return true;
    if (!name) return false;
    return (l.from || '').toLowerCase().includes(name) || (l.to || '').toLowerCase().includes(name);
  });
}

export const staysInCity = (s, cityId) =>
  sortBy(s.stays.filter((x) => x.cityId === cityId), (x) => x.checkIn || '');
export const stayOn = (s, iso = todayISO()) =>
  s.stays.find((x) => x.checkIn && inRange(day(iso), x.checkIn, x.checkOut || x.checkIn)) || null;

/* ---------- Checklist ---------- */

export function checklistStats(s) {
  const total = s.checklist.length;
  const done = s.checklist.filter((c) => c.done).length;
  return { total, done, open: total - done, pct: pct(done, total) };
}
export const overdue = (s, iso = todayISO()) =>
  s.checklist.filter((c) => !c.done && c.dueDate && day(c.dueDate) < day(iso));
export const dueOn = (s, iso = todayISO()) =>
  s.checklist.filter((c) => !c.done && c.dueDate && day(c.dueDate) === day(iso));
export function dueWithin(s, days, iso = todayISO()) {
  return sortBy(s.checklist.filter((c) => {
    if (c.done || !c.dueDate) return false;
    const d = dayDiff(iso, c.dueDate);
    return d !== null && d >= 0 && d <= days;
  }), (c) => c.dueDate);
}

/* ---------- Money ----------
   Totals use the snapshotted homeAmount (spec §4), never a live rate, so a
   total never drifts after the fact. */
export const spentHome = (s) =>
  s.expenses.reduce((sum, e) => sum + (typeof e.homeAmount === 'number' ? e.homeAmount : 0), 0);
export const unconverted = (s) =>
  s.expenses.filter((e) => typeof e.homeAmount !== 'number');

export function budgetState(s) {
  const budget = Number(s.trip.budget) || 0;
  const spent = spentHome(s);
  return { budget, spent, left: budget - spent, pct: pct(spent, budget), over: budget > 0 && spent > budget };
}

/* Mid-trip, dividing by the trip's full length understates the daily rate and
   makes the budget look safer than it is. */
export function spendDays(s) {
  const p = phase(s);
  if (p === 'during') return dayNumber(s);
  if (p === 'after') return totalDays(s);
  return null;
}
export function spendPerDay(s) {
  const days = spendDays(s);
  return days > 0 ? spentHome(s) / days : null;
}

export const spentInCity = (s, cityId) =>
  s.expenses.filter((e) => e.cityId === cityId)
    .reduce((sum, e) => sum + (e.homeAmount || 0), 0);

/* F8: what a city's accommodation actually cost, kept separate from personal
   spend because these bookings are usually group totals. */
export function stayCostInCity(s, cityId) {
  const stays = staysInCity(s, cityId).filter((x) => Number(x.cost) > 0);
  if (!stays.length) return null;
  const allSnapshotted = stays.every((x) => typeof x.homeAmount === 'number');
  return {
    total: stays.reduce((sum, x) => sum + Number(x.cost), 0),
    currency: stays[0].currency || '',
    /* Only offer a summed home figure when every stay carries its own, or the
       total would mix a converted number with an unconverted one. */
    homeAmount: allSnapshotted
      ? stays.reduce((sum, x) => sum + Number(x.homeAmount), 0) : undefined,
    mixedCurrency: new Set(stays.map((x) => x.currency)).size > 1,
    stays,
  };
}

/* A stay is "settled" once an expense references it — that is how the split
   action avoids being applied twice. */
export const stayIsSplit = (s, stayId) =>
  s.expenses.some((e) => e.relatedStayId === stayId);

/* Confirmed bookings with no fare recorded (feedback cycle 02, C5).

   These are real gaps, not noise: this trip's Turkish Airlines ticket never
   prints a fare and the Oslo stay was booked by a companion. The total is
   therefore lower than what was actually paid, and the traveller should know
   that rather than trusting a number that quietly omits five flights. */
export function bookingsMissingPrice(s, cityId) {
  const out = [];

  for (const t of s.transport) {
    if (Number(t.cost) > 0) continue;
    out.push({
      kind: 'transport', id: t.id, ref: t.bookingRef || '',
      label: `${t.from || '?'} → ${t.to || '?'}`,
      cityId: '',
      date: day(t.departDateTime),
    });
  }
  for (const x of s.stays) {
    if (Number(x.cost) > 0) continue;
    out.push({ kind: 'stay', id: x.id, ref: x.confirmationNumber || '', label: x.name, cityId: x.cityId });
  }

  if (!cityId) return sortBy(out, (o) => o.date || '');
  /* On a destination page, show only what belongs to that stop: its stay, and
     any leg that touches it. */
  const city = cityById(s, cityId);
  const legIds = new Set(legsForCity(s, city).map((l) => l.id));
  return out.filter((o) => (o.kind === 'stay' ? o.cityId === cityId : legIds.has(o.id)));
}

export function spendByCategory(s) {
  const map = {};
  for (const e of s.expenses) {
    const k = e.category || 'other';
    map[k] = (map[k] || 0) + (typeof e.homeAmount === 'number' ? e.homeAmount : 0);
  }
  return Object.entries(map)
    .map(([category, total]) => ({ category, total }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
}

/* Every record that names the file it came from (feedback cycle 02, C4).
   Kept because spec §12 wants the pointer — at a check-in desk you need to
   know which file to open — but collected in one place instead of repeated
   under every booking. */
export function sourceDocuments(s) {
  const out = [];
  for (const t of s.transport) {
    if (t.sourceFile) out.push({ file: t.sourceFile, kind: 'transport', label: `${t.from} → ${t.to}`, id: t.id });
  }
  for (const x of s.stays) {
    if (x.sourceFile) out.push({ file: x.sourceFile, kind: 'stay', label: x.name, id: x.id });
  }
  const byFile = {};
  for (const row of out) (byFile[row.file] ||= []).push(row);
  return Object.entries(byFile)
    .map(([file, records]) => ({ file, records }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

/* ---------- Dated items, for the .ics export (spec §12) ---------- */

export function datedItems(s) {
  const out = [];
  for (const c of s.checklist) {
    if (c.dueDate && !c.done) out.push({ kind: 'checklist', id: c.id, title: c.task, date: c.dueDate, allDay: true });
  }
  for (const x of s.stays) {
    if (x.cancellationDeadline) {
      out.push({ kind: 'deadline', id: `${x.id}-cx`, title: `Free-cancellation deadline — ${x.name}`,
                 date: x.cancellationDeadline, allDay: !/T/.test(x.cancellationDeadline) });
    }
    if (x.checkIn) {
      out.push({ kind: 'stay', id: `${x.id}-in`, title: `Check in — ${x.name}`,
                 date: x.checkIn, allDay: !/T/.test(x.checkIn) });
    }
  }
  for (const t of s.transport) {
    if (t.departDateTime) {
      out.push({ kind: 'transport', id: t.id,
                 title: `${(t.mode || 'transport').replace(/^./, (m) => m.toUpperCase())} ${t.from || ''} → ${t.to || ''}`,
                 date: t.departDateTime, allDay: false, end: t.arriveDateTime, ref: t.bookingRef });
    }
  }
  return sortBy(out, (o) => o.date);
}

/* Extras that matter on a given date, so a note stops waiting to be looked
   for and turns up when it is relevant (feedback F13). */
export function extrasForDate(s, iso) {
  const city = cityOn(s, iso);
  if (!city) return [];
  return s.extras.filter((x) => x.cityId === city.id);
}

/* ---------- The trip, day by day ----------

   Grouped by stop, the route answers "how long are we in Berlin". Grouped by
   day it answers "what happens on the 18th" — which is the question the
   traveller's own planning spreadsheet was laid out to answer, a row per day
   from DAY0 to the flight home. Both are the same records read two ways;
   nothing here is stored, so the two lenses cannot disagree. */
export function tripDays(s, iso = todayISO()) {
  const total = totalDays(s);
  if (!s.trip.startDate || !total || total < 1) return [];
  const today = day(iso);

  const ordered = citiesInOrder(s);

  return Array.from({ length: total }, (_, i) => {
    const date = addDays(s.trip.startDate, i);
    /* Every stop the date touches, in route order. A stop's departDate is the
       next stop's arriveDate, so a moving day legitimately belongs to two —
       or to three on the Budapest → Bratislava → Vienna run. `cityOn` answers
       with the first match, which is the city being LEFT: fine for "you are
       in" on Today, wrong for a row that also names the bed you sleep in that
       night. Carry the whole chain and let the row show the movement. */
    const chain = ordered.filter((c) =>
      inRange(date, c.arriveDate, c.departDate || c.arriveDate));

    return {
      iso: date,
      n: i + 1,
      chain,
      /* Where the day ends up — the one that agrees with the night's stay. */
      city: chain.at(-1) || cityOn(s, date),
      legs: legsOn(s, date),
      /* Where you sleep THAT NIGHT: check-in day included, check-out day not.
         On a day you move between cities both stays touch the date, and the
         bed that matters is the one you are heading to. `stayOn` keeps the
         inclusive reading because on a check-out morning Today should still
         show the address you are standing in. */
      stay: s.stays.find((x) => x.checkIn && x.checkOut
        && day(x.checkIn) <= date && date < day(x.checkOut)) || null,
      /* The stays themselves, not flags. On a moving day two different
         properties are in play — checking out of Berlin, into Copenhagen —
         and a bare "check in · check out" pair next to one name reads as
         though both happen at that one hotel. */
      checkIn: s.stays.find((x) => day(x.checkIn) === date) || null,
      checkOut: s.stays.find((x) => day(x.checkOut) === date) || null,
      due: dueOn(s, date),
      spent: s.expenses.filter((e) => day(e.date) === date)
        .reduce((sum, e) => sum + (e.homeAmount || 0), 0),
      isToday: date === today,
      isPast: date < today,
    };
  });
}
