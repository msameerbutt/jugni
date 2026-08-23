Screens.checklist = {
  filter: 'open',

  render() {
    const all = Store.state.checklist;
    const today = U.todayISO();
    const f = Screens.checklist.filter;

    const shown = U.sortBy(all.filter(function (c) {
      if (f === 'open') return !c.done;
      if (f === 'done') return c.done;
      if (f === 'overdue') return !c.done && c.dueDate && c.dueDate.slice(0, 10) < today;
      return true;
    }), function (c) { return c.dueDate || '9999'; });

    /* Grouped by category — a packing list and a visa task are different
       kinds of work, and reading them interleaved helps nobody. */
    const groups = {};
    shown.forEach(function (c) {
      const k = c.category || 'other';
      (groups[k] = groups[k] || []).push(c);
    });
    const stats = Trip.checklistStats();

    const counts = {
      all: all.length,
      open: all.filter(function (c) { return !c.done; }).length,
      overdue: Trip.overdue().length,
      done: stats.done
    };

    const filters = ['open', 'overdue', 'done', 'all'].map(function (key) {
      return '<button class="chip" data-act="filter-tasks" data-filter="' + key + '" ' +
        'aria-pressed="' + (f === key ? 'true' : 'false') + '">' +
        U.esc(U.titleCase(key)) + ' <span class="tkt">' + counts[key] + '</span></button>';
    }).join('');

    const body = Object.keys(groups).sort().map(function (cat) {
      return '<section class="section">' +
        '<div class="section__head"><h2>' + U.esc(U.titleCase(cat)) + '</h2>' +
          '<span class="small muted tkt">' + groups[cat].length + '</span></div>' +
        '<div class="card card--flat"><div class="rows">' +
          groups[cat].map(Screens.checkRow).join('') +
        '</div></div></section>';
    }).join('');

    return Screens.head('Checklist', stats.done + ' of ' + stats.total + ' done',
        '<button class="btn btn--primary" data-act="add-task">' + U.icon('plus', 15) + ' Add task</button>' +
        '<button class="btn" data-act="export-ics">' + U.icon('down', 15) + ' Calendar</button>') +
      '<section class="card"><div class="widget">' +
        UI.meter(stats.pct) +
        '<div class="chiprow">' + filters + '</div>' +
      '</div></section>' +
      (shown.length ? body
        : UI.empty('Nothing here', f === 'open' ? 'Everything on the list is done.' : 'No tasks match this filter.'));
  },

  /* Weather-informed packing (spec §12): display-time only — join the
     packing items to the live forecast for their city. Nothing is stored. */
  mount(param, el) {
    const packing = Store.state.checklist.filter(function (c) {
      return !c.done && (c.category || '').toLowerCase() === 'packing' && c.cityId;
    });
    if (!packing.length) return;

    const byCity = {};
    packing.forEach(function (c) { (byCity[c.cityId] = byCity[c.cityId] || []).push(c); });

    Object.keys(byCity).forEach(function (cityId) {
      const city = Trip.cityById(cityId);
      if (!city) return;
      Weather.forCity(city).then(function (res) {
        if (!res.data) return;
        const rainy = Weather.rainyDaysInWindow(res.data, city.arriveDate, city.departDate);
        const cold = Weather.coldDaysInWindow(res.data, city.arriveDate, city.departDate);
        if (!rainy.length && !cold.length) return;

        const bits = [];
        if (rainy.length) bits.push(rainy.length + (rainy.length === 1 ? ' day' : ' days') +
          ' with ' + Math.max.apply(null, rainy.map(function (d) { return d.rain; })) + '% rain');
        if (cold.length) bits.push('lows to ' +
          Math.round(Math.min.apply(null, cold.map(function (d) { return d.min; }))) + '°');

        byCity[cityId].forEach(function (item) {
          const slot = U.$('[data-packnudge="' + item.id + '"]', el);
          if (!slot) return;
          slot.innerHTML = '<p class="packnudge">' + U.icon('cloud', 14) +
            '<span>' + U.esc(city.name) + ' forecast: ' + U.esc(bits.join(', ')) + '</span></p>';
        });
      });
    });
  },

  form(item) {
    item = item || {};
    return UI.field('Task', 'task', { value: item.task, autofocus: true, placeholder: 'e.g. Renew travel insurance' }) +
      '<div class="formgrid">' +
        UI.field('Category', 'category', {
          type: 'select', value: item.category || 'general',
          options: ['general', 'packing', 'documents', 'booking', 'health', 'money', 'transport']
        }) +
        UI.field('Due date', 'dueDate', { type: 'date', value: (item.dueDate || '').slice(0, 10) }) +
      '</div>' +
      UI.field('City', 'cityId', { type: 'select', value: item.cityId || '', options: Screens.cityOptions() });
  }
};
