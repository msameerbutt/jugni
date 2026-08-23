/* Overview — the manifest thread (spec §11). Not a card grid: one connected
   route line, stop after stop, with the real transit legs between them. */

Screens.overview = {
  render() {
    const cities = Trip.citiesInOrder();
    const t = Trip.t();

    if (!cities.length) {
      return Screens.head(t.name || 'Route', 'Overview') +
        UI.empty('No cities yet', 'Cities appear here once your trip data is loaded.',
          '<p style="margin-top:1rem"><a class="btn" href="#/data">Import a trip file</a></p>');
    }

    const today = U.todayISO();
    const legs = Trip.transportInOrder();
    const used = {};

    const stops = cities.map(function (city, i) {
      const isNow = U.inRange(today, city.arriveDate, city.departDate || city.arriveDate);
      const isDone = city.departDate && city.departDate.slice(0, 10) < today;
      const stays = Trip.staysInCity(city.id);
      const spend = Store.state.expenses
        .filter(function (e) { return e.cityId === city.id; })
        .reduce(function (s, e) { return s + (e.homeAmount || 0); }, 0);
      const open = Store.state.checklist
        .filter(function (c) { return c.cityId === city.id && !c.done; }).length;
      const nights = U.dayDiff(city.arriveDate, city.departDate);

      /* The leg that gets you *out* of this city, drawn under the stub. */
      const outLeg = legs.filter(function (l) {
        if (used[l.id]) return false;
        const d = (l.departDateTime || '').slice(0, 10);
        return city.departDate && d === city.departDate.slice(0, 10);
      })[0];
      if (outLeg) used[outLeg.id] = true;

      return '<div class="thread__stop' +
          (isNow ? ' thread__stop--now' : (isDone ? ' thread__stop--done' : '')) + '">' +
          '<span class="thread__node"></span>' +
          '<a class="stub' + (isNow ? ' stub--now' : '') + '" href="#/cities/' + U.esc(city.id) + '" ' +
             'style="display:block;text-decoration:none;color:inherit">' +
            '<div class="stop__head">' +
              '<span class="stop__city">' + U.esc(city.name) +
                (city.country ? ' <span class="muted" style="font-size:var(--step--1)">' +
                  U.esc(city.country) + '</span>' : '') + '</span>' +
              '<span class="stop__dates">' + U.esc(U.fmtRange(city.arriveDate, city.departDate)) +
                (isNow ? ' ' + UI.badge('you are here', 'now') : '') + '</span>' +
            '</div>' +
            '<div class="stop__facts">' +
              (nights ? '<span class="fact"><span class="fact__k">Nights</span>' +
                 '<span class="fact__v">' + nights + '</span></span>' : '') +
              (stays.length ? '<span class="fact"><span class="fact__k">Stay</span>' +
                 '<span class="fact__v">' + U.esc(stays[0].name) + '</span></span>' : '') +
              (spend ? '<span class="fact"><span class="fact__k">Spent</span>' +
                 '<span class="fact__v">' + U.esc(U.money(spend, Trip.t().homeCurrency)) + '</span></span>' : '') +
              (open ? '<span class="fact"><span class="fact__k">Open tasks</span>' +
                 '<span class="fact__v">' + open + '</span></span>' : '') +
            '</div>' +
          '</a>' +
        '</div>' +
        (outLeg ? Screens.overview.legLine(outLeg) : '');
    }).join('');

    /* Legs that did not line up with a city departure still belong on the
       thread — the raw data does not always document every hop (spec §4). */
    const orphans = legs.filter(function (l) { return !used[l.id]; });

    return Screens.head(t.name || 'Route', 'Overview',
        '<button class="btn" data-act="export-ics">' + U.icon('down', 15) + ' Add to calendar</button>') +
      Screens.overview.summary() +
      '<section class="section"><div class="thread">' + stops + '</div></section>' +
      (orphans.length
        ? '<section class="section"><div class="section__head"><h2>Other legs</h2></div>' +
          '<p class="small muted" style="margin-bottom:var(--space-3)">Booked transport that ' +
          'doesn\'t line up with a documented departure date.</p>' +
          orphans.map(function (l) { return Screens.overview.legLine(l, true); }).join('') +
          '</section>'
        : '');
  },

  legLine(leg, boxed) {
    const inner =
      '<span class="leg__mode">' + UI.modeIcon(leg.mode) + ' ' + U.esc(U.titleCase(leg.mode || 'travel')) + '</span>' +
      '<span class="leg__time">' + U.esc(leg.from || '?') + ' → ' + U.esc(leg.to || '?') + '</span>' +
      '<span class="leg__time muted">' + U.esc(U.fmtLocalDateTime(leg.departDateTime)) +
        (leg.arriveDateTime ? ' – ' + U.esc(U.fmtLocalTime(leg.arriveDateTime)) : '') + '</span>' +
      (leg.bookingRef ? UI.badge('ref ' + leg.bookingRef) : '') +
      (leg.cost ? '<span class="leg__time">' + U.esc(U.money(leg.cost, leg.currency)) + '</span>' : '');
    return boxed ? '<div class="card card--flat" style="margin-bottom:var(--space-2)"><div class="leg" style="margin:0">' +
        inner + '</div></div>'
      : '<div class="leg">' + inner + '</div>';
  },

  summary() {
    const b = Trip.budgetState();
    const stats = Trip.checklistStats();
    const cities = Store.state.cities.length;
    const legs = Store.state.transport.length;
    return '<section class="card"><div class="grid grid--3">' +
      UI.stat(cities + (legs ? ' · ' + legs : ''), cities === 1 ? 'city · legs' : 'cities · legs') +
      UI.stat(U.money(b.spent, Trip.t().homeCurrency) + (b.budget ? ' / ' + U.money(b.budget, Trip.t().homeCurrency) : ''), 'spent of budget') +
      UI.stat(stats.done + '/' + stats.total, 'checklist done') +
    '</div>' +
    (b.budget ? '<div style="margin-top:var(--space-4)">' + UI.meter(b.pct, b.over) + '</div>' : '') +
    '</section>';
  }
};
