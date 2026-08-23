Screens.expenses = {
  CATEGORIES: ['food', 'transport', 'stay', 'activity', 'shopping', 'fees', 'other'],

  render() {
    const b = Trip.budgetState();
    const home = Trip.t().homeCurrency;
    const list = U.sortBy(Store.state.expenses, function (e) { return e.date || ''; }).reverse();
    const perDay = Trip.spendPerDay();
    const pending = Trip.unconverted();
    const byCat = Trip.spendByCategory();

    return Screens.head('Expenses', 'Budget ' + (b.budget ? U.money(b.budget, home) : 'not set'),
        '<button class="btn btn--primary" data-act="quick-expense">' + U.icon('plus', 15) + ' Log spend</button>') +

      '<section class="card">' +
        '<div class="budget__top">' +
          UI.stat(U.money(b.spent, home), 'spent') +
          UI.stat(U.money(b.left, home), b.over ? 'over budget' : 'left') +
          (perDay ? UI.stat(U.money(perDay, home),
             Trip.phase() === 'during' ? 'per day so far' : 'per day') : '') +
        '</div>' +
        (b.budget ? '<div style="margin-top:var(--space-4)">' + UI.meter(b.pct, b.over) +
          '<p class="small muted" style="margin-top:var(--space-2)">' + b.pct + '% of budget' +
          (b.over ? ' — ' + U.money(b.spent - b.budget, home) + ' over' : '') + '</p></div>' : '') +
        (pending.length ? '<p class="packnudge" style="margin-top:var(--space-3)">' + U.icon('warn', 14) +
          '<span>' + pending.length + ' expense' + (pending.length === 1 ? '' : 's') +
          ' saved offline without a converted amount. They fill in next time you\'re online.</span></p>' : '') +
      '</section>' +

      (byCat.length ? '<section class="section"><div class="section__head"><h2>By category</h2></div>' +
        '<div class="card card--flat"><div class="rows">' + byCat.map(function (c) {
          const pct = b.spent ? Math.round(c.total / b.spent * 100) : 0;
          return '<div class="row"><div class="row__body">' +
            '<div class="row__title">' + U.esc(U.titleCase(c.category)) + '</div>' +
            '<div style="margin-top:var(--space-2)">' + UI.meter(pct) + '</div></div>' +
            '<div class="row__side"><span class="expense__amt">' + U.esc(U.money(c.total, home)) + '</span>' +
            '<div class="small muted tkt">' + pct + '%</div></div></div>';
        }).join('') + '</div></div></section>' : '') +

      '<section class="section"><div class="section__head"><h2>All expenses</h2>' +
        '<span class="small muted tkt">' + list.length + '</span></div>' +
        (list.length
          ? '<div class="card card--flat"><div class="rows">' + list.map(Screens.expenses.row).join('') + '</div></div>'
          : UI.empty('Nothing logged yet', 'Two taps: amount and category. Date and city fill themselves in.',
              '<p style="margin-top:1rem"><button class="btn btn--primary hide-readonly" data-act="quick-expense">Log your first spend</button></p>')) +
      '</section>' +

      Screens.quickCaptureButton();
  },

  row(e) {
    const home = Trip.t().homeCurrency;
    const foreign = e.currency && e.currency !== home;
    return '<div class="row">' +
      '<div class="row__body">' +
        '<div class="row__title">' + U.esc(e.label || U.titleCase(e.category || 'Expense')) + '</div>' +
        '<div class="row__meta small">' +
          (e.category ? UI.badge(e.category) : '') +
          '<span class="muted tkt">' + U.esc(U.fmtDate(e.date)) + '</span>' +
          (e.cityId ? '<span class="muted">' + U.esc(Trip.cityName(e.cityId)) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="row__side">' +
        '<div class="expense__amt">' + U.esc(U.money(e.amount, e.currency)) + '</div>' +
        (foreign
          ? '<div class="expense__home">' +
              (typeof e.homeAmount === 'number'
                ? U.esc(U.money(e.homeAmount, e.homeCurrency || home)) +
                  (e.rateSnapshotDate ? ' <span class="muted">@' + U.esc(e.rateSnapshotDate) + '</span>' : '')
                : '<span class="stamp stamp--stale">not converted yet</span>') +
            '</div>'
          : '') +
        '<button class="btn btn--ghost small hide-readonly" data-act="edit-expense" data-id="' + U.esc(e.id) + '">Edit</button>' +
      '</div>' +
    '</div>';
  },

  /* Quick-capture (spec §12): amount + category, everything else defaulted.
     This is the only way to add data while actually travelling, so it has to
     be short enough to do standing at a counter. */
  quickForm() {
    const city = Trip.currentCity();
    const home = Trip.t().homeCurrency;
    const last = Screens.expenses.lastCurrency();
    const currencies = Screens.expenses.currencyOptions();

    return '<div class="amountpad">' +
        UI.field('Amount', 'amount', { type: 'number', step: '0.01', min: '0', autofocus: true, placeholder: '0.00' }) +
        UI.field('Currency', 'currency', { type: 'select', value: last || home, options: currencies }) +
      '</div>' +
      '<div class="field"><label>Category</label><div class="chiprow" data-catpicker>' +
        Screens.expenses.CATEGORIES.map(function (c, i) {
          return '<button type="button" class="chip" data-cat="' + c + '" aria-pressed="' +
            (i === 0 ? 'true' : 'false') + '">' + U.esc(U.titleCase(c)) + '</button>';
        }).join('') +
      '</div><input type="hidden" name="category" value="' + Screens.expenses.CATEGORIES[0] + '"></div>' +
      '<details><summary class="small muted">Label, date, city</summary>' +
        '<div style="margin-top:var(--space-3);display:flex;flex-direction:column;gap:var(--space-3)">' +
          UI.field('Label', 'label', { placeholder: 'optional' }) +
          '<div class="formgrid">' +
            UI.field('Date', 'date', { type: 'date', value: U.todayISO() }) +
            UI.field('City', 'cityId', {
              type: 'select', value: city ? city.id : '', options: Screens.cityOptions()
            }) +
          '</div>' +
        '</div>' +
      '</details>';
  },

  editForm(e) {
    return '<div class="amountpad">' +
        UI.field('Amount', 'amount', { type: 'number', step: '0.01', value: e.amount, autofocus: true }) +
        UI.field('Currency', 'currency', { type: 'select', value: e.currency, options: Screens.expenses.currencyOptions() }) +
      '</div>' +
      UI.field('Label', 'label', { value: e.label }) +
      '<div class="formgrid">' +
        UI.field('Category', 'category', { type: 'select', value: e.category, options: Screens.expenses.CATEGORIES }) +
        UI.field('Date', 'date', { type: 'date', value: (e.date || '').slice(0, 10) }) +
      '</div>' +
      UI.field('City', 'cityId', { type: 'select', value: e.cityId || '', options: Screens.cityOptions() });
  },

  /* Offer the currencies this trip actually involves first — a traveller in
     Oslo should not scroll a list of 150 codes to find NOK. */
  currencyOptions() {
    const seen = {};
    const push = function (c) { if (c) seen[c] = true; };
    push(Trip.t().homeCurrency);
    Store.state.expenses.forEach(function (e) { push(e.currency); });
    Store.state.stays.forEach(function (s) { push(s.currency); });
    Store.state.transport.forEach(function (t) { push(t.currency); });
    ['EUR', 'USD', 'GBP', 'AUD', 'NOK', 'SEK', 'DKK', 'HUF', 'PLN', 'CZK', 'CHF', 'JPY', 'TRY'].forEach(push);
    return Object.keys(seen);
  },

  lastCurrency() {
    try { return localStorage.getItem('jugni.lastCurrency') || ''; } catch (e) { return ''; }
  },
  rememberCurrency(c) {
    try { localStorage.setItem('jugni.lastCurrency', c); } catch (e) {}
  }
};
