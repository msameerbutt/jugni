/* One delegated click handler for the whole app. Screens declare intent with
   data-act; nothing re-binds listeners after a re-render. */

const Actions = {
  'toggle-task'(el) {
    const id = el.getAttribute('data-id');
    Store.mutate(function (s) {
      const item = s.checklist.filter(function (c) { return c.id === id; })[0];
      if (!item) return;
      item.done = !item.done;
      item.completedDate = item.done ? U.todayISO() : null;
      Store.logEvent('task', 'checklist', id,
        (item.done ? 'Done: ' : 'Reopened: ') + item.task);
    });
  },

  'add-task'() {
    UI.sheet({
      title: 'Add a task', body: Screens.checklist.form(), confirm: 'Add task',
      onSave(d) {
        if (!d.task) return;
        Store.mutate(function (s) {
          s.checklist.push({
            id: U.uid('task'), task: d.task, category: d.category || 'general',
            cityId: d.cityId || '', dueDate: d.dueDate || '', done: false, completedDate: null
          });
        });
        UI.toast('Task added');
      }
    });
  },

  'edit-task'(el) {
    const id = el.getAttribute('data-id');
    const item = Store.state.checklist.filter(function (c) { return c.id === id; })[0];
    if (!item) return;
    UI.sheet({
      title: 'Edit task', body: Screens.checklist.form(item),
      onSave(d) {
        Store.mutate(function (s) {
          const rec = s.checklist.filter(function (c) { return c.id === id; })[0];
          if (!rec) return;
          rec.task = d.task; rec.category = d.category;
          rec.cityId = d.cityId || ''; rec.dueDate = d.dueDate || '';
        });
      }
    });
  },

  'filter-tasks'(el) {
    Screens.checklist.filter = el.getAttribute('data-filter');
    Router.render();
  },

  /* Quick-capture: amount + category, everything else defaulted (spec §12). */
  'quick-expense'() {
    const city = Trip.currentCity();
    UI.sheet({
      title: 'Log spend', body: Screens.expenses.quickForm(), confirm: 'Save',
      onSave(d) {
        const amount = parseFloat(d.amount);
        if (!amount || amount <= 0) { UI.toast('Enter an amount'); return; }
        const home = Trip.t().homeCurrency;
        const id = U.uid('exp');
        const rec = {
          id: id, label: d.label || '', category: d.category || 'other',
          amount: amount, currency: d.currency || home,
          homeAmount: null, homeCurrency: home, rateSnapshotDate: null,
          date: d.date || U.todayISO(), cityId: d.cityId || (city ? city.id : '')
        };
        Screens.expenses.rememberCurrency(rec.currency);

        Store.mutate(function (s) {
          s.expenses.push(rec);
          Store.logEvent('expense', 'expense', id,
            'Logged ' + U.money(rec.amount, rec.currency) + ' — ' + (rec.label || rec.category));
        });

        /* Snapshot the rate now, once (spec §4). Offline, it stays null and
           gets backfilled on the next online boot. */
        Currency.snapshot(rec.amount, rec.currency, home).then(function (snap) {
          if (snap.homeAmount === null) { UI.toast('Saved — will convert when you\'re online'); return; }
          Store.mutate(function (s) {
            const saved = s.expenses.filter(function (x) { return x.id === id; })[0];
            if (saved) Object.assign(saved, snap);
          });
        });
      }
    });
  },

  'edit-expense'(el) {
    const id = el.getAttribute('data-id');
    const e = Store.state.expenses.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    UI.sheet({
      title: 'Edit expense', body: Screens.expenses.editForm(e),
      onSave(d) {
        const amount = parseFloat(d.amount);
        const home = Trip.t().homeCurrency;
        Store.mutate(function (s) {
          const rec = s.expenses.filter(function (x) { return x.id === id; })[0];
          if (!rec) return;
          rec.amount = isNaN(amount) ? rec.amount : amount;
          rec.label = d.label; rec.category = d.category;
          rec.currency = d.currency; rec.date = d.date; rec.cityId = d.cityId || '';
          /* The stored conversion belongs to the old amount — re-snapshot it. */
          rec.homeAmount = null; rec.rateSnapshotDate = null;
        });
        const rec = Store.state.expenses.filter(function (x) { return x.id === id; })[0];
        Currency.snapshot(rec.amount, rec.currency, home).then(function (snap) {
          if (snap.homeAmount === null) return;
          Store.mutate(function (s) {
            const saved = s.expenses.filter(function (x) { return x.id === id; })[0];
            if (saved) Object.assign(saved, snap);
          });
        });
      }
    });
  },

  'add-note'(el) {
    const cityId = el.getAttribute('data-city');
    UI.sheet({
      title: 'Add a note', body: Screens.destination.form(null, cityId), confirm: 'Add note',
      onSave(d) {
        if (!d.title) return;
        Store.mutate(function (s) {
          s.destinationNotes.push({
            id: U.uid('note'), cityId: d.cityId || '', title: d.title, body: d.body || ''
          });
        });
      }
    });
  },

  'edit-note'(el) {
    const id = el.getAttribute('data-id');
    const note = Store.state.destinationNotes.filter(function (n) { return n.id === id; })[0];
    if (!note) return;
    UI.sheet({
      title: 'Edit note', body: Screens.destination.form(note),
      onSave(d) {
        Store.mutate(function (s) {
          const rec = s.destinationNotes.filter(function (n) { return n.id === id; })[0];
          if (!rec) return;
          rec.title = d.title; rec.body = d.body; rec.cityId = d.cityId || '';
        });
      }
    });
  },

  'edit-trip'() {
    UI.sheet({
      title: 'Trip settings', body: Screens.data.tripForm(),
      onSave(d) {
        Store.mutate(function (s) {
          s.trip.name = d.name;
          s.trip.startDate = d.startDate; s.trip.endDate = d.endDate;
          s.trip.budget = parseFloat(d.budget) || 0;
          s.trip.homeCurrency = d.homeCurrency; s.trip.notes = d.notes;
        });
      }
    });
  },

  'edit-me'() {
    UI.sheet({
      title: 'About you', body: Screens.data.meForm(),
      onSave(d) {
        Store.mutate(function (s) {
          let me = s.travelers.filter(function (t) { return t.role === 'primary'; })[0];
          if (!me) { me = { id: U.uid('trav'), role: 'primary', personaProfiles: [] }; s.travelers.push(me); }
          me.nickname = d.nickname; me.email = d.email; me.age = parseInt(d.age, 10) || 0;
        });
      }
    });
  },

  'theme'(el) { Store.setTheme(el.getAttribute('data-theme')); },

  'export'() {
    Files.save(Store.exportJSON(), Store.exportName(), 'application/json');
    UI.toast('Exported ' + Store.exportName());
  },

  'import'() {
    Files.pick('.json,application/json', function (text, name) {
      const res = Store.importJSON(text);
      if (!res.ok) { UI.toast(res.error); return; }
      UI.toast('Imported ' + name);
      /* Forking someone else's trip: the new owner needs their own identity
         before this counts as their Jugni (spec §2's fork path). */
      if (Store.needsFork) Actions['edit-me']();
    });
  },

  'export-ics'() {
    const items = Trip.datedItems();
    if (!items.length) { UI.toast('Nothing dated to export yet'); return; }
    ICS.download(items, Trip.t().name, 'jugni-' +
      (Trip.t().name || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.ics');
    UI.toast(items.length + ' items exported — open the file to add them');
  },

  'snapshot'() { Snapshot.download(); },

  'refresh-weather'() {
    Screens.weather.mount(null, U.$('[data-view]'), true);
    UI.toast('Refreshing…');
  },

  'reset'() {
    UI.confirm('This clears the trip stored in this browser. Export it first if you want to keep it.',
      function () { Store.reset(); });
  }
};
