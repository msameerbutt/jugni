Screens.weather = {
  render() {
    const cities = Trip.citiesInOrder();
    if (!cities.length) {
      return Screens.head('Weather', 'Live forecast') +
        UI.empty('No cities yet', 'Forecasts are tied to the cities in your trip.');
    }
    return Screens.head('Weather', 'Live forecast per city',
        '<button class="btn" data-act="refresh-weather">Refresh</button>') +
      '<p class="small muted">Forecasts reach about 10 days out. Days inside your dates for ' +
        'that city are highlighted.</p>' +
      '<div class="grid" style="margin-top:var(--space-4)">' +
        cities.map(function (c) {
          return '<section class="card widget" data-wx="' + U.esc(c.id) + '" aria-live="polite">' +
            '<div class="widget__head">' +
              '<div><h2 class="card__title">' + U.esc(c.name) + '</h2>' +
              '<p class="small muted tkt">' + U.esc(U.fmtRange(c.arriveDate, c.departDate)) + '</p></div>' +
              '<span class="small muted">loading…</span>' +
            '</div></section>';
        }).join('') +
      '</div>';
  },

  dayCard(d, city) {
    const desc = Weather.describe(d.code);
    const inTrip = city && U.inRange(d.date, city.arriveDate, city.departDate || city.arriveDate);
    const dt = U.toDate(d.date);
    return '<div class="fc-day' + (inTrip ? ' fc-day--intrip' : '') + '">' +
      '<div class="fc-day__d">' + U.esc(dt ? dt.toLocaleDateString(undefined, { weekday: 'short' }) : '') + '</div>' +
      '<div class="fc-day__d tkt">' + U.esc(U.fmtDate(d.date, { day: '2-digit', month: 'short' })) + '</div>' +
      '<div class="fc-day__ico" title="' + U.esc(desc[0]) + '">' + desc[1] + '</div>' +
      '<div class="fc-day__t"><b>' + Math.round(d.max) + '°</b> ' + Math.round(d.min) + '°</div>' +
      (d.rain >= 20 ? '<div class="fc-day__rain">' + d.rain + '%</div>' : '<div class="fc-day__rain">&nbsp;</div>') +
      '</div>';
  },

  mount(param, el, force) {
    U.$$('[data-wx]', el).forEach(function (node) {
      const city = Trip.cityById(node.getAttribute('data-wx'));
      if (!city) return;
      Weather.forCity(city, { force: !!force }).then(function (res) {
        const head = U.$('.widget__head', node);
        if (!res.data) {
          head.lastElementChild.outerHTML = Net.stamp(res);
          node.insertAdjacentHTML('beforeend',
            '<p class="small muted">' + (typeof city.lat === 'number'
              ? 'No forecast available offline yet.'
              : 'This city has no coordinates in the trip data, so it can\'t be looked up.') + '</p>');
          return;
        }
        head.lastElementChild.outerHTML = Net.stamp(res);
        const rainy = Weather.rainyDaysInWindow(res.data, city.arriveDate, city.departDate);
        node.insertAdjacentHTML('beforeend',
          '<div class="forecast">' + res.data.days.map(function (d) {
            return Screens.weather.dayCard(d, city);
          }).join('') + '</div>' +
          (rainy.length
            ? '<p class="packnudge">' + U.icon('cloud', 14) + '<span>' + rainy.length +
              ' wet ' + (rainy.length === 1 ? 'day' : 'days') + ' while you\'re here — ' +
              'worth a rain shell. <a href="#/checklist">Check your packing list →</a></span></p>'
            : ''));
      });
    });
  }
};
