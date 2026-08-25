/* Derived views over the trip. Nothing here is stored — it is all computed,
   so there is never a second copy to keep in sync. */
import { day, dayDiff, inRange, sortBy, todayISO, addDays, pct } from '../lib/util.js';

export const primaryTraveler = (s) =>
  s.travelers.find((t) => t.role === 'primary') || s.travelers[0] || null;

export const headcount = (s) => Math.max(1, s.travelers.length);

/* How many people a bill divides between (schema 1.4).

   A trip is not one party size. Five share the city apartments and three go
   north to Abisko, so dividing every booking by the traveller count quietly
   understates a share on the ones that were never for the whole group. The
   booking's own `guests` is the answer whenever the document stated it;
   headcount is only the fallback for a record that predates the field. */
export const partySize = (s, stay) =>
  Math.max(1, Number(stay?.guests) > 0 ? Number(stay.guests) : headcount(s));

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
/* Is a fare actually recorded? Zero is an answer, not a blank.

   One ticket covering four flights has one fare, and the traveller's way of
   saying so is to put the total on one leg and zero on the rest. Treating 0 as
   "not filled in" made that impossible: the leg kept asking for a price it had
   already been told. Only an absent value is unknown. */
export const isPriced = (rec) => {
  const v = rec?.cost;
  return v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
};

/* A leg with no fare of its own, but a sibling on the same booking reference
   that carries one. Its price is not missing — it is over there. */
export const coveredByBooking = (s, rec) => {
  const ref = String(rec?.bookingRef || '').trim().toLowerCase();
  if (!ref) return false;
  return s.transport.some((t) => t.id !== rec.id && isPriced(t) && Number(t.cost) > 0
    && String(t.bookingRef || '').trim().toLowerCase() === ref);
};

/* Every booked thing, grouped by the reference it was booked under.

   One ticket covering four flights is one purchase and four legs, and the
   traveller needs both readings: what the booking cost, and which legs it
   covers. Hiding the three unpriced legs once the fourth carries the fare —
   which is what "covered by a sibling" used to do — answered the first
   question by removing the second, so there was no longer anywhere to record
   that a leg cost nothing on its own. Show them all; label them honestly. */
export function bookingGroups(s) {
  const rows = [
    ...s.transport.map((t) => ({
      kind: 'transport', id: t.id, ref: (t.bookingRef || '').trim(),
      label: `${t.from || '?'} → ${t.to || '?'}`,
      date: day(t.departDateTime), cost: t.cost, currency: t.currency,
      homeAmount: t.homeAmount, priced: isPriced(t),
    })),
    ...s.stays.map((x) => ({
      kind: 'stay', id: x.id, ref: (x.confirmationNumber || '').trim(),
      label: x.name, date: day(x.checkIn), cost: x.cost, currency: x.currency,
      homeAmount: x.homeAmount, priced: isPriced(x),
    })),
  ];

  const groups = [];
  const byRef = new Map();
  for (const r of rows) {
    /* No reference means it stands alone — two unrelated bookings must never
       be merged just because neither carries a number. */
    const key = r.ref ? `${r.kind}:${r.ref.toLowerCase()}` : `solo:${r.id}`;
    if (!byRef.has(key)) {
      const g = { ref: r.ref, kind: r.kind, items: [], total: 0, currency: '', paid: false };
      byRef.set(key, g);
      groups.push(g);
    }
    const g = byRef.get(key);
    g.items.push(r);
    if (Number(r.cost) > 0) {
      g.total += Number(r.cost);
      g.currency = g.currency || r.currency || '';
      g.paid = true;
    }
  }
  for (const g of groups) {
    g.items = sortBy(g.items, (r) => r.date || '');
    /* Answered means every leg has been given a figure, zero included. A
       group where one leg carries the fare and the rest are still blank is
       priced but not finished — the traveller has more to say about it. */
    g.answered = g.items.every((r) => r.priced);
  }
  return sortBy(groups, (g) => g.items[0]?.date || '');
}

export function bookingsMissingPrice(s, cityId) {
  const out = [];

  /* One ticket routinely covers several legs — Melbourne to Lahore is four
     flights on one reference, and the receipt prices the journey, not the
     hops. Once any leg of a booking carries the fare, its siblings are paid
     for, and listing them as "no price recorded" states the opposite of what
     the screen above it says. A leg with no reference at all is judged on its
     own, which is what keeps a genuinely unpriced ticket visible. */
  for (const t of s.transport) {
    if (isPriced(t)) continue;
    /* Its sibling carries the fare, so nothing is missing from the total.
       It still appears under Bookings, where it can be answered. */
    if (coveredByBooking(s, t)) continue;
    out.push({
      kind: 'transport', id: t.id, ref: t.bookingRef || '',
      label: `${t.from || '?'} → ${t.to || '?'}`,
      cityId: '',
      date: day(t.departDateTime),
    });
  }
  for (const x of s.stays) {
    if (isPriced(x)) continue;
    /* Neither a fare nor a confirmation number means this was never a booking:
       it is a spare room at a relative's, recorded so the address is in the
       app at midnight in an arrivals hall. Chasing it for a missing price
       invents a debt. A stay WITH a reference and no fare is the real case
       this panel is for — a room a companion booked and paid for. */
    if (!x.confirmationNumber) continue;
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

/* ---------- Destination content (schema 1.5) ----------

   What a phone gets opened for on a street corner: where to eat, what is free,
   what is on tonight. These are `extras` carrying a `kind`, so the destination
   page can show them as their own panels instead of one undifferentiated pile
   under "Worth knowing". */
export const extrasOfKind = (s, cityId, kind) =>
  s.extras.filter((x) => x.cityId === cityId && (x.kind || 'note') === kind);

/* Events, narrowed to the stay and ordered by when they start.

   An event with no dates is a standing fixture — a weekly market, a nightly
   view — and always shows. A dated one only shows if it actually overlaps the
   nights the traveller is there, because "what's on in Berlin" is useless
   noise on a page for a trip that has already left. */
export function eventsForCity(s, city, iso = todayISO()) {
  if (!city) return [];
  const from = day(city.arriveDate);
  const to = day(city.departDate || city.arriveDate);
  const today = day(iso);
  const weekEnd = addDays(today, 7);

  return sortBy(extrasOfKind(s, city.id, 'event').filter((x) => {
    if (!x.startDate && !x.endDate) return true;
    const a = day(x.startDate || x.endDate);
    const b = day(x.endDate || x.startDate);
    return !(b < from || a > to);            // any overlap with the stay
  }), (x) => x.startDate || '').map((x) => {
    const a = day(x.startDate || '');
    const b = day(x.endDate || x.startDate || '');
    return {
      ...x,
      /* "This week" is measured from the real today, so the badge means what
         it says whichever day the file is opened. */
      thisWeek: !!(a && a <= day(weekEnd) && (b || a) >= today),
      onNow: !!(a && a <= today && (b || a) >= today),
    };
  });
}

/* Short facts belong in a strip, not in cards.

   A 25-character note about plug sockets rendered as a full card in a carousel
   wastes most of a phone screen to say "Type C, 230V". Anything this short is
   a label and a value; anything longer is prose and keeps its card. */
export const SHORT_NOTE_CHARS = 90;
export function splitNotes(s, cityId) {
  const all = s.destinationNotes.filter((n) => n.cityId === cityId);
  return {
    facts: all.filter((n) => (n.body || '').length <= SHORT_NOTE_CHARS),
    longer: all.filter((n) => (n.body || '').length > SHORT_NOTE_CHARS),
  };
}
