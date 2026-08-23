/* Derived views over the trip. Nothing here is stored — it is all computed
   from the schema, so there is never a second copy to keep in sync. */

const Trip = {
  t() { return Store.state.trip; },

  primaryTraveler() {
    const ts = Store.state.travelers;
    return ts.filter(function (t) { return t.role === 'primary'; })[0] || ts[0] || null;
  },

  /* Date-aware default view (spec §12): before → Upcoming, during → Today,
     after → Recap. The single highest-value navigation decision. */
  phase(todayISO) {
    const today = todayISO || U.todayISO();
    const t = Trip.t();
    if (!t.startDate) return 'planning';
    if (today < t.startDate.slice(0, 10)) return 'before';
    if (t.endDate && today > t.endDate.slice(0, 10)) return 'after';
    return 'during';
  },

  daysUntilStart() { return U.dayDiff(U.todayISO(), Trip.t().startDate); },
  dayNumber(todayISO) {
    const d = U.dayDiff(Trip.t().startDate, todayISO || U.todayISO());
    return d === null ? null : d + 1;
  },
  totalDays() {
    const d = U.dayDiff(Trip.t().startDate, Trip.t().endDate);
    return d === null ? null : d + 1;
  },

  citiesInOrder() {
    return U.sortBy(Store.state.cities, function (c) { return c.arriveDate || c.departDate || ''; });
  },
  cityById(id) {
    return Store.state.cities.filter(function (c) { return c.id === id; })[0] || null;
  },
  cityName(id) { const c = Trip.cityById(id); return c ? c.name : ''; },

  cityOn(iso) {
    const day = (iso || U.todayISO()).slice(0, 10);
    const hit = Store.state.cities.filter(function (c) {
      return U.inRange(day, c.arriveDate, c.departDate || c.arriveDate);
    });
    if (hit.length) return hit[0];
    /* Between two documented stops (a travel day, or a gap the raw data did
       not cover) — fall back to the most recent city already arrived in. */
    const past = Trip.citiesInOrder().filter(function (c) {
      return c.arriveDate && c.arriveDate.slice(0, 10) <= day;
    });
    return past.length ? past[past.length - 1] : null;
  },
  currentCity() { return Trip.cityOn(U.todayISO()); },

  transportInOrder() {
    return U.sortBy(Store.state.transport, function (x) { return x.departDateTime || ''; });
  },
  nextLeg(fromISO) {
    const from = (fromISO || U.todayISO()).slice(0, 10);
    return Trip.transportInOrder().filter(function (x) {
      return (x.departDateTime || '').slice(0, 10) >= from;
    })[0] || null;
  },
  legsOn(iso) {
    const day = (iso || U.todayISO()).slice(0, 10);
    return Trip.transportInOrder().filter(function (x) {
      return (x.departDateTime || '').slice(0, 10) === day;
    });
  },
  /* Legs that touch a city. Matching on name alone misses the common case:
     a flight leg says 'OSL', the city says 'Oslo'. Dates are the reliable
     signal, so use those first and treat the name as a fallback. */
  legsForCity(city) {
    if (!city) return [];
    const arrive = (city.arriveDate || '').slice(0, 10);
    const depart = (city.departDate || '').slice(0, 10);
    const name = (city.name || '').toLowerCase();

    return Trip.transportInOrder().filter(function (l) {
      const dep = (l.departDateTime || '').slice(0, 10);
      const arr = (l.arriveDateTime || '').slice(0, 10);
      if (arrive && arr === arrive) return true;       /* got you here */
      if (depart && dep === depart) return true;       /* takes you out */
      if (!name) return false;
      return (l.from || '').toLowerCase().indexOf(name) > -1 ||
             (l.to || '').toLowerCase().indexOf(name) > -1;
    });
  },

  staysInCity(cityId) {
    return U.sortBy(Store.state.stays.filter(function (s) { return s.cityId === cityId; }),
                    function (s) { return s.checkIn || ''; });
  },
  stayOn(iso) {
    const day = (iso || U.todayISO()).slice(0, 10);
    return Store.state.stays.filter(function (s) {
      return s.checkIn && U.inRange(day, s.checkIn, s.checkOut || s.checkIn);
    })[0] || null;
  },

  /* ---- Checklist ---- */
  checklistStats() {
    const all = Store.state.checklist;
    const done = all.filter(function (c) { return c.done; }).length;
    return { total: all.length, done: done, pct: all.length ? Math.round(done / all.length * 100) : 0 };
  },
  overdue(iso) {
    const day = (iso || U.todayISO()).slice(0, 10);
    return Store.state.checklist.filter(function (c) {
      return !c.done && c.dueDate && c.dueDate.slice(0, 10) < day;
    });
  },
  dueOn(iso) {
    const day = (iso || U.todayISO()).slice(0, 10);
    return Store.state.checklist.filter(function (c) {
      return !c.done && c.dueDate && c.dueDate.slice(0, 10) === day;
    });
  },
  dueWithin(days) {
    const today = U.todayISO();
    return U.sortBy(Store.state.checklist.filter(function (c) {
      if (c.done || !c.dueDate) return false;
      const d = U.dayDiff(today, c.dueDate);
      return d !== null && d >= 0 && d <= days;
    }), function (c) { return c.dueDate; });
  },

  /* ---- Money. Totals use the snapshotted homeAmount (spec §4), never a
     live rate, so a total never drifts after the fact. ---- */
  spentHome() {
    return Store.state.expenses.reduce(function (sum, e) {
      return sum + (typeof e.homeAmount === 'number' ? e.homeAmount : 0);
    }, 0);
  },
  unconverted() {
    return Store.state.expenses.filter(function (e) {
      return typeof e.homeAmount !== 'number' || e.homeAmount === null;
    });
  },
  budgetState() {
    const budget = Number(Trip.t().budget) || 0;
    const spent = Trip.spentHome();
    return {
      budget: budget, spent: spent, left: budget - spent,
      pct: budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0,
      over: budget > 0 && spent > budget
    };
  },
  /* Mid-trip, dividing by the trip's full length understates the daily rate
     and makes the budget look safer than it is. Divide by days actually
     elapsed while travelling; by total days once the trip is over. */
  spendDays() {
    const phase = Trip.phase();
    if (phase === 'during') return Trip.dayNumber();
    if (phase === 'after') return Trip.totalDays();
    return null;
  },
  spendPerDay() {
    const days = Trip.spendDays();
    return days && days > 0 ? Trip.spentHome() / days : null;
  },
  spendByCategory() {
    const map = {};
    Store.state.expenses.forEach(function (e) {
      const k = e.category || 'other';
      map[k] = (map[k] || 0) + (typeof e.homeAmount === 'number' ? e.homeAmount : 0);
    });
    return Object.keys(map).map(function (k) { return { category: k, total: map[k] }; })
      .sort(function (a, b) { return b.total - a.total; });
  },

  /* ---- Dated items, for the .ics export (spec §12) ---- */
  datedItems() {
    const out = [];
    Store.state.checklist.forEach(function (c) {
      if (c.dueDate && !c.done) out.push({ kind: 'checklist', id: c.id, title: c.task, date: c.dueDate, allDay: true });
    });
    Store.state.stays.forEach(function (s) {
      if (s.cancellationDeadline) {
        out.push({ kind: 'deadline', id: s.id, title: 'Free-cancellation deadline — ' + s.name,
                   date: s.cancellationDeadline, allDay: !/T/.test(s.cancellationDeadline) });
      }
      if (s.checkIn) out.push({ kind: 'stay', id: s.id + '-in', title: 'Check in — ' + s.name, date: s.checkIn, allDay: !/T/.test(s.checkIn) });
    });
    Store.state.transport.forEach(function (x) {
      if (x.departDateTime) {
        out.push({ kind: 'transport', id: x.id,
                   title: U.titleCase(x.mode || 'transport') + ' ' + (x.from || '') + ' → ' + (x.to || ''),
                   date: x.departDateTime, allDay: false,
                   end: x.arriveDateTime, ref: x.bookingRef });
      }
    });
    return U.sortBy(out, function (o) { return o.date; });
  }
};
