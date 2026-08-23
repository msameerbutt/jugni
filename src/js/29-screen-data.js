/* Trip data: the export/import/fork surface (spec §8/§12) plus the few trip
   settings a traveller genuinely owns. Everything else stays the agent's job. */

Screens.data = {
  render() {
    const t = Trip.t();
    const primary = Trip.primaryTraveler();
    const companions = Store.state.travelers.filter(function (x) { return x.role !== 'primary'; });
    const counts = Schema.COLLECTIONS.map(function (k) {
      return { key: k, n: Store.state[k].length };
    }).filter(function (c) { return c.n; });

    return Screens.head('Trip data', 'Export, import, settings') +

      (Store.warnings.length ? '<section class="card" style="border-color:var(--rust)">' +
        '<div class="widget__head"><h2 class="card__title">' + U.icon('warn', 16) +
        ' Data warnings</h2></div><ul class="rows">' +
        Store.warnings.map(function (w) {
          return '<li class="row"><div class="row__body small">' + U.esc(w) + '</div></li>';
        }).join('') + '</ul></section>' : '') +

      '<section class="card"><div class="widget">' +
        '<div class="datarow"><div><strong>Theme</strong>' +
          '<p class="small muted">Chosen at intake, changeable any time.</p></div>' +
          '<div class="themetoggle hide-readonly" role="group" aria-label="Theme">' +
            '<button data-act="theme" data-theme="light" aria-pressed="' +
              (t.theme !== 'dark') + '">Light</button>' +
            '<button data-act="theme" data-theme="dark" aria-pressed="' +
              (t.theme === 'dark') + '">Dark</button>' +
          '</div>' +
        '</div>' +
        '<div class="datarow" style="border-top:1px solid var(--line);padding-top:var(--space-3)">' +
          '<div><strong>Budget</strong><p class="small muted">' +
            (t.budget ? U.money(t.budget, t.homeCurrency) : 'not set') +
            ' · home currency ' + U.esc(t.homeCurrency || '—') + '</p></div>' +
          '<button class="btn hide-readonly" data-act="edit-trip">Edit trip</button>' +
        '</div>' +
      '</div></section>' +

      '<section class="section"><div class="section__head"><h2>Travellers</h2></div>' +
        '<div class="card card--flat"><div class="rows">' +
          (primary ? '<div class="row"><div class="row__body">' +
            '<div class="row__title">' + U.esc(primary.nickname || 'You') + ' ' +
              UI.badge('primary', 'done') + '</div>' +
            '<div class="row__meta small muted">' +
              (primary.email ? U.esc(primary.email) : 'no email') +
              (primary.age ? ' · ' + primary.age : '') +
              (primary.personaProfiles && primary.personaProfiles.length
                ? ' · ' + U.esc(primary.personaProfiles.join(', ')) : '') +
            '</div></div>' +
            '<div class="row__side hide-readonly"><button class="btn btn--ghost" data-act="edit-me">Edit</button></div>' +
            '</div>' : '') +
          companions.map(function (c) {
            return '<div class="row"><div class="row__body">' +
              '<div class="row__title">' + U.esc(c.nickname || 'Companion') + '</div>' +
              '<div class="row__meta small muted">companion — their own itinerary lives in ' +
              'their own Jugni</div></div></div>';
          }).join('') +
        '</div></div>' +
        '<p class="small muted" style="margin-top:var(--space-2)">This trip shows the primary ' +
          'traveller\'s itinerary. A companion gets their own editable copy by importing your ' +
          'exported file.</p>' +
      '</section>' +

      '<section class="section"><div class="section__head"><h2>Share this trip</h2></div>' +
        '<div class="grid grid--2">' +
          '<div class="card"><h3 class="card__title">Read-only snapshot</h3>' +
            '<p class="small muted">One HTML file a friend can open and browse. Nothing to ' +
              'set up, nothing they can change.</p>' +
            '<p style="margin-top:var(--space-3)"><button class="btn" data-act="snapshot">' +
              U.icon('down', 15) + ' Save snapshot</button></p></div>' +
          '<div class="card"><h3 class="card__title">Forkable copy</h3>' +
            '<p class="small muted">Export <span class="tkt">' + U.esc(Store.exportName()) +
              '</span>. Whoever imports it gets their own independent Jugni for the same trip.</p>' +
            '<p style="margin-top:var(--space-3)"><button class="btn btn--primary" data-act="export">' +
              U.icon('down', 15) + ' Export trip file</button></p></div>' +
        '</div>' +
      '</section>' +

      '<section class="section"><div class="section__head"><h2>Bring data in</h2></div>' +
        '<div class="card datarow">' +
          '<div><strong>Import a Jugni file</strong>' +
            '<p class="small muted">Replaces what\'s in this browser with the imported trip. ' +
              'Export first if you want to keep the current one.</p></div>' +
          '<button class="btn hide-readonly" data-act="import">' + U.icon('up', 15) + ' Import</button>' +
        '</div>' +
        '<div class="card datarow" style="margin-top:var(--space-3)">' +
          '<div><strong>Calendar reminders</strong>' +
            '<p class="small muted">' + Trip.datedItems().length + ' dated items — departures, ' +
              'check-ins, cancellation deadlines and due dates — as an <span class="tkt">.ics</span> ' +
              'file your phone can remind you about.</p></div>' +
          '<button class="btn" data-act="export-ics">' + U.icon('down', 15) + ' Export .ics</button>' +
        '</div>' +
      '</section>' +

      '<section class="section"><div class="section__head"><h2>What\'s in this trip</h2></div>' +
        '<div class="card card--flat"><div class="rows">' +
          counts.map(function (c) {
            return '<div class="row"><div class="row__body">' + U.esc(U.titleCase(c.key)) + '</div>' +
              '<div class="row__side tkt">' + c.n + '</div></div>';
          }).join('') +
          '<div class="row"><div class="row__body muted small">Schema version</div>' +
            '<div class="row__side tkt small muted">' + U.esc(t.schemaVersion) + '</div></div>' +
        '</div></div>' +
      '</section>' +

      '<section class="section"><div class="card datarow hide-readonly" style="border-color:var(--rust)">' +
        '<div><strong>Clear this trip from the browser</strong>' +
          '<p class="small muted">Removes the local copy. If the file was built with your trip ' +
            'baked in, reopening it restores that version.</p></div>' +
        '<button class="btn btn--danger" data-act="reset">Clear</button>' +
      '</div></section>';
  },

  tripForm() {
    const t = Trip.t();
    return UI.field('Trip name', 'name', { value: t.name, autofocus: true }) +
      '<div class="formgrid">' +
        UI.field('Start date', 'startDate', { type: 'date', value: (t.startDate || '').slice(0, 10) }) +
        UI.field('End date', 'endDate', { type: 'date', value: (t.endDate || '').slice(0, 10) }) +
      '</div>' +
      '<div class="formgrid">' +
        UI.field('Budget', 'budget', { type: 'number', step: '1', value: t.budget }) +
        UI.field('Home currency', 'homeCurrency', {
          type: 'select', value: t.homeCurrency, options: Screens.expenses.currencyOptions()
        }) +
      '</div>' +
      UI.field('Notes', 'notes', { type: 'textarea', value: t.notes, rows: 3 });
  },

  meForm() {
    const me = Trip.primaryTraveler() || {};
    return UI.field('Nickname', 'nickname', { value: me.nickname, autofocus: true,
      placeholder: 'what you want to be called' }) +
      '<div class="formgrid">' +
        UI.field('Email', 'email', { type: 'email', value: me.email }) +
        UI.field('Age', 'age', { type: 'number', min: '0', value: me.age || '' }) +
      '</div>' +
      '<p class="small muted">Jugni stores a nickname rather than a legal name on purpose, and ' +
        'keeps identity to these three fields.</p>';
  }
};
