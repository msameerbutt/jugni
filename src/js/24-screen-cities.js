Screens.cities = {
  render(cityId) {
    return cityId ? Screens.cities.detail(cityId) : Screens.cities.list();
  },

  list() {
    const cities = Trip.citiesInOrder();
    if (!cities.length) {
      return Screens.head('Cities', 'Where you go') +
        UI.empty('No cities yet', 'Cities come from your trip data.');
    }
    const today = U.todayISO();

    return Screens.head('Cities', cities.length + ' stops') +
      '<div class="grid grid--2">' + cities.map(function (c) {
        const now = U.inRange(today, c.arriveDate, c.departDate || c.arriveDate);
        const stays = Trip.staysInCity(c.id);
        const nights = U.dayDiff(c.arriveDate, c.departDate);
        return '<a class="card" href="#/cities/' + U.esc(c.id) + '" ' +
          'style="text-decoration:none;color:inherit' + (now ? ';border-color:var(--transit-blue)' : '') + '">' +
          '<div class="stop__head"><span class="stop__city">' + U.esc(c.name) + '</span>' +
            (now ? UI.badge('now', 'now') : '') + '</div>' +
          '<p class="small muted">' + U.esc(c.country || '') + '</p>' +
          '<p class="stop__dates" style="margin-top:var(--space-2)">' +
            U.esc(U.fmtRange(c.arriveDate, c.departDate)) +
            (nights ? ' · ' + nights + (nights === 1 ? ' night' : ' nights') : '') + '</p>' +
          (stays.length ? '<p class="small muted" style="margin-top:var(--space-2)">' +
            U.icon('bed', 13) + ' ' + U.esc(stays[0].name) + '</p>' : '') +
          '</a>';
      }).join('') + '</div>';
  },

  detail(cityId) {
    const city = Trip.cityById(cityId);
    if (!city) return Screens.head('Unknown city', 'Cities') +
      UI.empty('That city is not in this trip', '', '<p style="margin-top:1rem"><a class="btn" href="#/cities">Back to cities</a></p>');

    const stays = Trip.staysInCity(city.id);
    const legs = Trip.legsForCity(city);
    const tasks = Store.state.checklist.filter(function (c) { return c.cityId === city.id; });
    const spend = Store.state.expenses.filter(function (e) { return e.cityId === city.id; });
    const spendTotal = spend.reduce(function (s, e) { return s + (e.homeAmount || 0); }, 0);
    const notes = Store.state.destinationNotes.filter(function (n) { return n.cityId === city.id; });
    const extras = Store.state.extras.filter(function (x) { return x.cityId === city.id; });

    return Screens.head(city.name, city.country || 'City',
        '<a class="btn btn--ghost" href="#/cities">← All cities</a>') +

      '<section class="card"><div class="grid grid--3">' +
        UI.stat(U.fmtRange(city.arriveDate, city.departDate) || '—', 'dates') +
        UI.stat(String(U.dayDiff(city.arriveDate, city.departDate) || '—'), 'nights') +
        UI.stat(U.money(spendTotal, Trip.t().homeCurrency), 'spent here') +
      '</div>' +
      (city.notes ? '<p class="small muted" style="margin-top:var(--space-4)">' + U.esc(city.notes) + '</p>' : '') +
      '<div class="widget" data-wx-city="' + U.esc(city.id) + '" style="margin-top:var(--space-4)" aria-live="polite"></div>' +
      '</section>' +

      (stays.length ? '<section class="section"><div class="section__head"><h2>Stay</h2></div>' +
        stays.map(function (s) {
          const deadline = s.cancellationDeadline;
          const late = deadline && deadline.slice(0, 10) < U.todayISO();
          return '<div class="stub" style="margin-bottom:var(--space-3)">' +
            '<div class="stop__head"><span class="stop__city">' + U.esc(s.name) + '</span>' +
              '<span class="stop__dates">' + U.esc(U.fmtRange(s.checkIn, s.checkOut)) + '</span></div>' +
            (s.address ? '<p class="small muted">' + U.esc(s.address) + '</p>' : '') +
            '<div class="stop__facts">' +
              (s.confirmationNumber ? '<span class="fact"><span class="fact__k">Confirmation</span>' +
                '<span class="fact__v">' + U.esc(s.confirmationNumber) + '</span></span>' : '') +
              (s.cost ? '<span class="fact"><span class="fact__k">Cost</span><span class="fact__v">' +
                U.esc(U.money(s.cost, s.currency)) + '</span></span>' : '') +
              (deadline ? '<span class="fact"><span class="fact__k">Free cancellation until</span>' +
                '<span class="fact__v" style="color:' + (late ? 'var(--ink-soft)' : 'var(--rust)') + '">' +
                U.esc(U.fmtLocalDateTime(deadline)) + (late ? ' (passed)' : '') + '</span></span>' : '') +
            '</div>' +
            (s.notes ? '<p class="small muted" style="margin-top:var(--space-3)">' + U.esc(s.notes) + '</p>' : '') +
            '</div>';
        }).join('') + '</section>' : '') +

      (legs.length ? '<section class="section"><div class="section__head"><h2>Getting in and out</h2></div>' +
        legs.map(function (l) { return Screens.overview.legLine(l, true); }).join('') + '</section>' : '') +

      (tasks.length ? '<section class="section"><div class="section__head"><h2>Tasks here</h2></div>' +
        '<div class="card card--flat"><div class="rows">' + tasks.map(Screens.checkRow).join('') +
        '</div></div></section>' : '') +

      (notes.length ? '<section class="section"><div class="section__head"><h2>Good to know</h2>' +
        '<a class="btn btn--ghost" href="#/destination/' + U.esc(city.id) + '">Full guide →</a></div>' +
        '<div class="grid grid--2">' + notes.slice(0, 4).map(function (n) {
          return '<article class="card notecard"><h3 class="card__title">' + U.esc(n.title) + '</h3>' +
            '<p class="note-body small">' + U.esc(n.body) + '</p></article>';
        }).join('') + '</div></section>' : '') +

      (extras.length ? '<section class="section"><div class="section__head"><h2>Also worth knowing</h2></div>' +
        '<div class="grid grid--2">' + extras.map(UI.extra).join('') + '</div></section>' : '') +

      (spend.length ? '<section class="section"><div class="section__head"><h2>Spending here</h2>' +
        '<a class="btn btn--ghost" href="#/expenses">All →</a></div>' +
        '<div class="card card--flat"><div class="rows">' +
          spend.slice(0, 6).map(Screens.expenses.row).join('') + '</div></div></section>' : '');
  },

  mount(cityId, el) {
    const slot = U.$('[data-wx-city]', el);
    if (!slot) return;
    const city = Trip.cityById(slot.getAttribute('data-wx-city'));
    if (!city) return;

    Weather.forCity(city).then(function (res) {
      if (!res.data) { slot.innerHTML = Net.stamp(res); return; }
      const days = (res.data.days || []).filter(function (d) {
        return !city.arriveDate || !city.departDate || U.inRange(d.date, city.arriveDate, city.departDate);
      });
      const show = (days.length ? days : res.data.days).slice(0, 7);
      slot.innerHTML =
        '<div class="widget__head"><span class="eyebrow">Forecast</span>' + Net.stamp(res) + '</div>' +
        '<div class="forecast">' + show.map(Screens.weather.dayCard).join('') + '</div>';
    });
  }
};
