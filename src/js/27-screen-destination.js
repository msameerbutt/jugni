/* Destination guide: static essentials the agent pre-filled (spec §4) plus
   live country facts. Pre-fill first, let the traveller correct what's wrong. */

Screens.destination = {
  render(cityId) {
    const cities = Trip.citiesInOrder();
    if (!cities.length) {
      return Screens.head('Guide', 'Destination') +
        UI.empty('No destinations yet', 'Guides are generated per city from your trip data.');
    }
    const city = cityId ? Trip.cityById(cityId) : (Trip.currentCity() || cities[0]);
    if (!city) return Screens.head('Guide', 'Destination') + UI.empty('Unknown city', '');

    const notes = Store.state.destinationNotes.filter(function (n) { return n.cityId === city.id; });
    const extras = Store.state.extras.filter(function (x) { return x.cityId === city.id; });
    const general = Store.state.extras.filter(function (x) { return !x.cityId; });

    const tabs = cities.map(function (c) {
      return '<a class="chip" href="#/destination/' + U.esc(c.id) + '" aria-pressed="' +
        (c.id === city.id ? 'true' : 'false') + '">' + U.esc(c.name) + '</a>';
    }).join('');

    return Screens.head(city.name, 'Destination guide',
        '<button class="btn" data-act="add-note" data-city="' + U.esc(city.id) + '">' +
        U.icon('plus', 15) + ' Add a note</button>') +

      '<div class="chiprow">' + tabs + '</div>' +

      '<section class="card" data-facts="' + U.esc(city.country || '') + '" ' +
        'style="margin-top:var(--space-4)" aria-live="polite">' +
        '<p class="small muted">loading country facts…</p></section>' +

      (notes.length
        ? '<section class="section"><div class="section__head"><h2>Essentials</h2></div>' +
          '<div class="grid grid--2">' + notes.map(function (n) {
            return '<article class="card notecard">' +
              '<div class="widget__head"><h3 class="card__title">' + U.esc(n.title) + '</h3>' +
                '<button class="btn btn--ghost small hide-readonly" data-act="edit-note" data-id="' +
                U.esc(n.id) + '">Edit</button></div>' +
              '<p class="note-body">' + U.esc(n.body) + '</p></article>';
          }).join('') + '</div></section>'
        : UI.empty('No notes for ' + city.name + ' yet',
            'Emergency numbers, plug type, visa reminders — the things you want before you land.')) +

      (extras.length ? '<section class="section"><div class="section__head"><h2>Also worth knowing</h2></div>' +
        '<div class="grid grid--2">' + extras.map(UI.extra).join('') + '</div></section>' : '') +

      (general.length ? '<section class="section"><div class="section__head"><h2>Trip-wide</h2></div>' +
        '<div class="grid grid--2">' + general.map(UI.extra).join('') + '</div></section>' : '');
  },

  mount(cityId, el) {
    const slot = U.$('[data-facts]', el);
    if (!slot) return;
    const country = slot.getAttribute('data-facts');
    if (!country) { slot.innerHTML = '<p class="small muted">No country recorded for this city.</p>'; return; }

    Facts.country(country).then(function (res) {
      const f = res.data;
      if (!f) { slot.innerHTML = Net.stamp(res); return; }
      const time = Facts.localTime(f.timezone);
      slot.innerHTML =
        '<div class="widget__head" style="margin-bottom:var(--space-3)">' +
          '<span class="eyebrow">' + (f.flag ? f.flag + ' ' : '') + U.esc(f.name || country) + '</span>' +
          Net.stamp(res) + '</div>' +
        '<div class="grid grid--3">' +
          (time ? UI.stat(time, 'local time') : '') +
          (f.currency ? UI.stat(f.currency, 'currency') : '') +
          (f.dialCode ? UI.stat(f.dialCode, 'dialling code') : '') +
          (f.languages ? UI.stat(f.languages.split(',')[0], 'language') : '') +
          (f.capital ? UI.stat(f.capital, 'capital') : '') +
        '</div>';
    });
  },

  form(note, cityId) {
    note = note || {};
    return UI.field('Title', 'title', { value: note.title, autofocus: true, placeholder: 'e.g. Emergency numbers' }) +
      UI.field('Note', 'body', { type: 'textarea', value: note.body, rows: 5 }) +
      UI.field('City', 'cityId', {
        type: 'select', value: note.cityId || cityId || '', options: Screens.cityOptions()
      });
  }
};
