Screens.today = {
  render() {
    const phase = Trip.phase();
    if (phase === 'planning') return Screens.today.planning();
    if (phase === 'before') return Screens.today.before();
    if (phase === 'after') return Screens.today.after();
    return Screens.today.during();
  },

  /* ---------- No dates yet ---------- */
  planning() {
    return Screens.head('Your trip', 'Getting started') +
      UI.empty('No trip loaded yet',
        'Import a Jugni file, or ask Claude to build this app from your own raw travel data.',
        '<p style="margin-top:1rem"><a class="btn btn--primary" href="#/data">Import a trip file</a></p>');
  },

  /* ---------- Before the trip: "Upcoming" ---------- */
  before() {
    const t = Trip.t();
    const days = Trip.daysUntilStart();
    const first = Trip.citiesInOrder()[0];
    const leg = Trip.nextLeg(t.startDate);
    const soon = Trip.dueWithin(14);
    const overdue = Trip.overdue();
    const stats = Trip.checklistStats();

    return Screens.head(t.name || 'Upcoming', 'Upcoming') +
      '<section class="card">' +
        '<div class="today__hero">' +
          '<div>' +
            '<p class="eyebrow">Departs in</p>' +
            '<p class="today__city tkt">' + days + ' <span style="font-size:var(--step-1)">days</span></p>' +
            '<p class="today__day">' + U.esc(U.fmtDateLong(t.startDate)) +
              (first ? ' · first stop ' + U.esc(first.name) : '') + '</p>' +
          '</div>' +
          '<div style="min-width:180px">' +
            '<p class="eyebrow">Checklist</p>' +
            '<p class="stat__value tkt">' + stats.done + '/' + stats.total + '</p>' +
            UI.meter(stats.pct) +
          '</div>' +
        '</div>' +
      '</section>' +

      (overdue.length ? Screens.alertBlock(overdue) : '') +
      (leg ? Screens.legCard(leg, 'First leg') : '') +

      '<section class="section">' +
        '<div class="section__head"><h2>Due in the next two weeks</h2>' +
          '<a class="btn btn--ghost" href="#/checklist">All tasks →</a></div>' +
        (soon.length
          ? '<div class="card card--flat"><div class="rows">' +
              soon.map(Screens.checkRow).join('') + '</div></div>'
          : UI.empty('Nothing due yet', 'Tasks with a due date in the next 14 days show up here.')) +
      '</section>';
  },

  /* ---------- During the trip ---------- */
  during() {
    const today = U.todayISO();
    const city = Trip.currentCity();
    const stay = Trip.stayOn(today);
    const legs = Trip.legsOn(today);
    const next = Trip.nextLeg(today);
    const due = Trip.dueOn(today);
    const overdue = Trip.overdue();
    const day = Trip.dayNumber();
    const total = Trip.totalDays();
    const spentToday = Store.state.expenses
      .filter(function (e) { return (e.date || '').slice(0, 10) === today; })
      .reduce(function (s, e) { return s + (e.homeAmount || 0); }, 0);

    return Screens.head('Today', U.fmtDateLong(today)) +
      '<section class="card" data-wx-here>' +
        '<div class="today__hero">' +
          '<div>' +
            '<p class="eyebrow">You are in</p>' +
            '<p class="today__city">' + U.esc(city ? city.name : '—') + '</p>' +
            '<p class="today__day tkt">Day ' + (day || '?') + ' of ' + (total || '?') + '</p>' +
          '</div>' +
          '<div class="widget" data-wx-slot style="min-width:190px" aria-live="polite">' +
            '<p class="small muted">loading weather…</p>' +
          '</div>' +
        '</div>' +
        (stay ? '<div class="row" style="border-top:1px solid var(--line);margin-top:var(--space-4);padding-top:var(--space-3)">' +
            U.icon('bed', 18) +
            '<div class="row__body"><strong>' + U.esc(stay.name) + '</strong>' +
              '<div class="row__meta small muted">' +
                (stay.address ? U.esc(stay.address) + ' · ' : '') +
                '<span class="tkt">' + U.esc(U.fmtRange(stay.checkIn, stay.checkOut)) + '</span>' +
                (stay.confirmationNumber ? ' · ref <span class="tkt">' + U.esc(stay.confirmationNumber) + '</span>' : '') +
              '</div></div></div>' : '') +
      '</section>' +

      (overdue.length ? Screens.alertBlock(overdue) : '') +
      (legs.length ? legs.map(function (l) { return Screens.legCard(l, 'Today'); }).join('')
                   : (next ? Screens.legCard(next, 'Next leg') : '')) +

      '<section class="section">' +
        '<div class="section__head"><h2>Due today</h2>' +
          '<a class="btn btn--ghost" href="#/checklist">All tasks →</a></div>' +
        (due.length
          ? '<div class="card card--flat"><div class="rows">' + due.map(Screens.checkRow).join('') + '</div></div>'
          : UI.empty('Nothing due today', 'Enjoy ' + (city ? city.name : 'it') + '.')) +
      '</section>' +

      '<section class="section">' +
        '<div class="section__head"><h2>Spending</h2>' +
          '<a class="btn btn--ghost" href="#/expenses">All expenses →</a></div>' +
        '<div class="card"><div class="grid grid--3">' +
          UI.stat(U.money(spentToday, Trip.t().homeCurrency), 'today') +
          UI.stat(U.money(Trip.spentHome(), Trip.t().homeCurrency), 'trip so far') +
          UI.stat(U.money(Trip.budgetState().left, Trip.t().homeCurrency), 'budget left') +
        '</div></div>' +
      '</section>' +

      Screens.quickCaptureButton();
  },

  /* ---------- After the trip ---------- */
  after() {
    return Screens.head(Trip.t().name || 'Trip', 'Finished') +
      UI.empty('This trip is done',
        'Jugni now opens on your recap.',
        '<p style="margin-top:1rem"><a class="btn btn--primary" href="#/recap">See the trip recap</a></p>');
  },

  mount(param, el) {
    const city = Trip.currentCity() || Trip.citiesInOrder()[0];
    const slot = U.$('[data-wx-slot]', el);
    if (!slot || !city) { if (slot) slot.innerHTML = ''; return; }

    Weather.forCity(city).then(function (res) {
      if (!res.data) { slot.innerHTML = Net.stamp(res); return; }
      const todayFc = (res.data.days || []).filter(function (d) { return d.date === U.todayISO(); })[0];
      const cur = res.data.current;
      const desc = Weather.describe(cur ? cur.weather_code : (todayFc ? todayFc.code : -1));
      slot.innerHTML =
        '<div class="widget__head">' +
          '<span class="eyebrow">' + U.esc(city.name) + '</span>' +
          '<a class="small" href="#/weather">forecast →</a>' +
        '</div>' +
        '<p style="font-size:var(--step-2);line-height:1.2">' + desc[1] + ' ' +
          '<span class="tkt">' + (cur ? Math.round(cur.temperature_2m) + '°' : '—') + '</span></p>' +
        '<p class="small muted">' + U.esc(desc[0]) +
          (todayFc ? ' · <span class="tkt">' + Math.round(todayFc.min) + '–' + Math.round(todayFc.max) + '°</span>' +
            (todayFc.rain >= Weather.RAIN_THRESHOLD ? ' · ' + todayFc.rain + '% rain' : '') : '') + '</p>' +
        Net.stamp(res);
    });
  }
};
