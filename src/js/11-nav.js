/* Persistent nav (rail on desktop, tab bar on mobile) — spec §11.
   The manifest thread reappears here in miniature as the progress indicator. */

const Nav = {
  ITEMS: [
    { id: 'today',       label: 'Today',    icon: 'today' },
    { id: 'overview',    label: 'Route',    icon: 'route' },
    { id: 'checklist',   label: 'Checklist',icon: 'check' },
    { id: 'cities',      label: 'Cities',   icon: 'city'  },
    { id: 'expenses',    label: 'Expenses', icon: 'money' },
    { id: 'weather',     label: 'Weather',  icon: 'cloud' },
    { id: 'destination', label: 'Guide',    icon: 'info'  },
    { id: 'recap',       label: 'Recap',    icon: 'recap' }
  ],

  counts() {
    const stats = Trip.checklistStats();
    return {
      checklist: stats.total ? (stats.total - stats.done) || '' : '',
      cities: Store.state.cities.length || '',
      expenses: Store.state.expenses.length || ''
    };
  },

  render(active) {
    const t = Trip.t();
    const counts = Nav.counts();

    const links = Nav.ITEMS.map(function (item) {
      const count = counts[item.id];
      return '<a class="navstub" href="#/' + item.id + '"' +
        (item.id === active ? ' aria-current="page"' : '') + '>' +
        U.icon(item.icon) +
        '<span>' + U.esc(item.label) + '</span>' +
        (count ? '<span class="navstub__count">' + U.esc(count) + '</span>' : '') +
        '</a>';
    }).join('');

    return '<nav class="rail" aria-label="Trip sections">' +
      '<div class="rail__brand"><span class="rail__wordmark">Jugni</span></div>' +
      '<p class="rail__tripname">' + U.esc(t.name || 'Untitled trip') +
        (t.startDate ? '<br><span class="tkt">' + U.esc(U.fmtRange(t.startDate, t.endDate)) + '</span>' : '') +
      '</p>' +
      '<div class="rail__nav">' + links + '</div>' +
      Nav.thread() +
      '<div class="rail__foot">' +
        '<a class="navstub" href="#/data"' +
          (active === 'data' ? ' aria-current="page"' : '') + '>' +
          U.icon('data') + '<span>Trip data</span></a>' +
      '</div>' +
      '</nav>';
  },

  /* The thread in miniature: how far along the route we are today. */
  thread() {
    const t = Trip.t();
    if (!t.startDate || !t.endDate) return '';
    const total = Trip.totalDays();
    const day = Trip.dayNumber();
    const phase = Trip.phase();
    let pct = 0, label;

    if (phase === 'before') { pct = 0; label = 'in ' + Trip.daysUntilStart() + 'd'; }
    else if (phase === 'after') { pct = 100; label = 'complete'; }
    else { pct = Math.round((day / total) * 100); label = 'day ' + day + '/' + total; }

    return '<div class="rail__thread" aria-hidden="true">' +
      '<span class="rail__thread-line"><span class="rail__thread-fill" style="width:' + pct + '%"></span>' +
      (phase === 'during' ? '<span class="rail__thread-dot" style="left:' + pct + '%"></span>' : '') +
      '</span>' +
      '<span class="rail__thread-label">' + U.esc(label) + '</span>' +
      '</div>';
  }
};
