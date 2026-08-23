/* Screen registry. Each screen exposes render(param) -> HTML, and optionally
   mount(param, el) for anything that needs the DOM or a live API call. */
const Screens = {};

/* ---- Parts shared by more than one screen ---- */

Screens.head = function (title, eyebrow, actions) {
  return '<header class="page-head">' +
    '<div>' + (eyebrow ? '<p class="eyebrow">' + U.esc(eyebrow) + '</p>' : '') +
      '<h1>' + U.esc(title) + '</h1></div>' +
    (actions ? '<div class="page-head__actions hide-readonly">' + actions + '</div>' : '') +
    '</header>';
};

/* A transit leg, rendered as departure-board data. */
Screens.legCard = function (leg, eyebrow) {
  const tz = U.tzOffsetOf(leg.departDateTime);
  return '<section class="section"><div class="stub stub--now">' +
    '<div class="widget__head" style="margin-bottom:var(--space-3)">' +
      '<span class="eyebrow">' + U.esc(eyebrow || 'Next leg') + '</span>' +
      (leg.bookingRef ? '<span class="badge">ref ' + U.esc(leg.bookingRef) + '</span>' : '') +
    '</div>' +
    '<div class="next-leg">' +
      '<span class="next-leg__pt">' +
        '<span class="next-leg__place">' + U.esc(leg.from || '—') + '</span>' +
        '<span class="next-leg__time">' + U.esc(U.fmtLocalDateTime(leg.departDateTime)) +
          (tz ? ' <span class="muted">' + U.esc(tz) + '</span>' : '') + '</span>' +
      '</span>' +
      '<span class="next-leg__link">' + UI.modeIcon(leg.mode) +
        '<span class="next-leg__rule"></span></span>' +
      '<span class="next-leg__pt next-leg__pt--to">' +
        '<span class="next-leg__place">' + U.esc(leg.to || '—') + '</span>' +
        '<span class="next-leg__time">' + U.esc(U.fmtLocalDateTime(leg.arriveDateTime)) + '</span>' +
      '</span>' +
    '</div>' +
    (leg.notes ? '<p class="small muted" style="margin-top:var(--space-3)">' + U.esc(leg.notes) + '</p>' : '') +
    '</div></section>';
};

/* Checklist row — used on Today and on the Checklist screen. */
Screens.checkRow = function (item) {
  const today = U.todayISO();
  const late = !item.done && item.dueDate && item.dueDate.slice(0, 10) < today;
  const city = item.cityId ? Trip.cityName(item.cityId) : '';
  return '<div class="row' + (item.done ? ' row--done' : '') + '">' +
    '<button class="check hide-readonly" role="checkbox" aria-checked="' + (item.done ? 'true' : 'false') +
      '" data-act="toggle-task" data-id="' + U.esc(item.id) + '" ' +
      'aria-label="' + U.esc(item.task) + '">' + U.icon('check', 14) + '</button>' +
    '<div class="row__body">' +
      '<div class="row__title">' + U.esc(item.task) + '</div>' +
      '<div class="row__meta small">' +
        (item.category ? UI.badge(item.category) : '') +
        (city ? '<span class="muted">' + U.esc(city) + '</span>' : '') +
        (item.dueDate ? '<span class="tkt ' + (late ? '' : 'muted') + '">' +
            (late ? 'overdue · ' : 'due ') + U.esc(U.fmtDate(item.dueDate)) + '</span>' : '') +
        (item.done && item.completedDate
          ? '<span class="muted tkt">done ' + U.esc(U.fmtDate(item.completedDate)) + '</span>' : '') +
      '</div>' +
      '<div data-packnudge="' + U.esc(item.id) + '"></div>' +
    '</div>' +
    '<div class="row__side hide-readonly">' +
      '<button class="btn btn--ghost" data-act="edit-task" data-id="' + U.esc(item.id) + '" ' +
        'aria-label="Edit ' + U.esc(item.task) + '">Edit</button>' +
    '</div>' +
    '</div>';
};

Screens.alertBlock = function (overdue) {
  return '<section class="section"><div class="card" style="border-color:var(--rust);background:var(--rust-wash)">' +
    '<div class="row" style="border:0;padding:0">' + U.icon('warn', 18) +
    '<div class="row__body"><strong>' + overdue.length + ' overdue ' +
      (overdue.length === 1 ? 'task' : 'tasks') + '</strong>' +
      '<div class="small">' + U.esc(overdue.slice(0, 3).map(function (o) { return o.task; }).join(' · ')) +
      (overdue.length > 3 ? ' …' : '') + '</div></div>' +
    '<a class="btn" href="#/checklist">Open</a></div></div></section>';
};

Screens.quickCaptureButton = function () {
  return '<button class="btn btn--primary quickcap hide-readonly" data-act="quick-expense">' +
    U.icon('plus', 16) + ' Log spend</button>';
};

/* City picker options, reused by every form that references a city. */
Screens.cityOptions = function (selected) {
  return [{ value: '', label: '— none —' }].concat(
    Trip.citiesInOrder().map(function (c) { return { value: c.id, label: c.name }; })
  ).map(function (o) { return { value: o.value, label: o.label }; });
};
