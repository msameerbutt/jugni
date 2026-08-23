/* Trip Recap (spec §12): once endDate passes, give the trip an actual close
   rather than letting the file go stale. */

Screens.recap = {
  render() {
    const t = Trip.t();
    const phase = Trip.phase();
    const b = Trip.budgetState();
    const stats = Trip.checklistStats();
    const cities = Trip.citiesInOrder();
    const home = t.homeCurrency;
    const byCat = Trip.spendByCategory();
    const days = Trip.totalDays();
    const perDay = Trip.spendPerDay();
    const biggest = U.sortBy(Store.state.expenses, function (e) { return -(e.homeAmount || 0); })[0];

    if (phase === 'before' || phase === 'planning') {
      return Screens.head('Recap', 'After the trip') +
        UI.empty('Not yet',
          'Your recap — spend against budget, cities visited, checklist completion — ' +
          'appears here once the trip is over.');
    }

    return Screens.head(t.name || 'Trip recap', phase === 'after' ? 'Trip complete' : 'So far') +

      '<section class="card recap__hero">' +
        '<p class="eyebrow">' + U.esc(U.fmtRange(t.startDate, t.endDate)) + '</p>' +
        '<p class="recap__title">' + (days || '—') + ' days · ' + cities.length + ' ' +
          (cities.length === 1 ? 'city' : 'cities') + '</p>' +
        '<p class="muted">' + U.esc(cities.map(function (c) { return c.name; }).join(' → ')) + '</p>' +
      '</section>' +

      '<section class="section"><div class="recap__stats">' +
        '<div class="card">' + UI.stat(U.money(b.spent, home), 'total spent') +
          (b.budget ? '<div style="margin-top:var(--space-3)">' + UI.meter(b.pct, b.over) +
            '<p class="small muted" style="margin-top:var(--space-2)">' +
            (b.over ? U.money(b.spent - b.budget, home) + ' over budget'
                    : U.money(b.left, home) + ' under budget') + '</p></div>' : '') +
        '</div>' +
        '<div class="card">' + UI.stat(perDay ? U.money(perDay, home) : '—', 'per day') + '</div>' +
        '<div class="card">' + UI.stat(stats.pct + '%', 'checklist completed') +
          '<div style="margin-top:var(--space-3)">' + UI.meter(stats.pct) + '</div></div>' +
        '<div class="card">' + UI.stat(String(Store.state.transport.length), 'transit legs') + '</div>' +
      '</div></section>' +

      (byCat.length ? '<section class="section"><div class="section__head"><h2>Where the money went</h2></div>' +
        '<div class="card card--flat"><div class="rows">' + byCat.map(function (c) {
          const pct = b.spent ? Math.round(c.total / b.spent * 100) : 0;
          return '<div class="row"><div class="row__body">' +
            '<div class="row__title">' + U.esc(U.titleCase(c.category)) + '</div>' +
            '<div style="margin-top:var(--space-2)">' + UI.meter(pct) + '</div></div>' +
            '<div class="row__side"><span class="expense__amt">' +
            U.esc(U.money(c.total, home)) + '</span></div></div>';
        }).join('') + '</div></div></section>' : '') +

      (biggest && biggest.homeAmount ? '<section class="section"><div class="card">' +
        '<p class="eyebrow">Single biggest expense</p>' +
        '<p class="stat__value tkt">' + U.esc(U.money(biggest.homeAmount, home)) + '</p>' +
        '<p class="muted">' + U.esc(biggest.label || U.titleCase(biggest.category || '')) +
          (biggest.cityId ? ' · ' + U.esc(Trip.cityName(biggest.cityId)) : '') + '</p>' +
        '</div></section>' : '') +

      (Store.state.log.length ? '<section class="section">' +
        '<div class="section__head"><h2>Trip log</h2>' +
        '<span class="small muted tkt">' + Store.state.log.length + '</span></div>' +
        '<div class="card card--flat"><div class="rows">' +
          U.sortBy(Store.state.log, function (l) { return l.date; }).reverse().slice(0, 25)
            .map(function (l) {
              return '<div class="row"><div class="row__body">' +
                '<div class="row__title small">' + U.esc(l.text) + '</div></div>' +
                '<div class="row__side small muted tkt">' + U.esc(U.fmtDate(l.date)) + '</div></div>';
            }).join('') +
        '</div></div></section>' : '') +

      '<section class="section"><div class="card datarow">' +
        '<div><strong>Keep this trip</strong>' +
        '<p class="small muted">Export the file so the trip survives a cleared browser.</p></div>' +
        '<button class="btn btn--primary" data-act="export">' + U.icon('down', 15) + ' Export trip file</button>' +
      '</div></section>';
  }
};
