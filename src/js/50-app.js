/* Boot. */

const App = {
  start() {
    const el = document.getElementById('jugni-data');
    let baked = null;
    if (el && el.textContent.trim()) {
      try { baked = JSON.parse(el.textContent); } catch (e) { baked = null; }
    }

    Store.init(baked);
    Store.setReadonly(!!(el && el.getAttribute('data-mode') === 'readonly'));

    App.bindEvents();
    Router.start();

    if (Store.readonly) {
      document.body.insertAdjacentHTML('afterbegin',
        '<p class="readonly-banner">' + U.icon('info', 14) +
        ' Read-only snapshot of ' + U.esc(Trip.t().name || 'this trip') + '</p>');
    }

    /* Anything saved while offline gets its rate snapshotted now (spec §4). */
    Currency.backfill().then(function (n) {
      if (n) UI.toast(n + ' offline expense' + (n === 1 ? '' : 's') + ' converted');
    });
    window.addEventListener('online', function () { Currency.backfill(); });

    if (Store.warnings.length) {
      UI.toast(Store.warnings.length + ' data warning' +
        (Store.warnings.length === 1 ? '' : 's') + ' — see Trip data');
    }
  },

  bindEvents() {
    document.addEventListener('click', function (ev) {
      /* Category chips inside the quick-capture sheet. */
      const chip = ev.target.closest('[data-cat]');
      if (chip) {
        ev.preventDefault();
        const picker = chip.closest('[data-catpicker]');
        U.$$('[data-cat]', picker).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        chip.setAttribute('aria-pressed', 'true');
        const hidden = picker.parentElement.querySelector('input[name="category"]');
        if (hidden) hidden.value = chip.getAttribute('data-cat');
        return;
      }

      const target = ev.target.closest('[data-act]');
      if (!target) return;
      const act = target.getAttribute('data-act');
      if (!Actions[act]) return;
      ev.preventDefault();
      Actions[act](target);
    });

    /* Keyboard: checkboxes are buttons, so make Space behave like Enter. */
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== ' ' && ev.key !== 'Spacebar') return;
      const box = ev.target.closest('[role="checkbox"]');
      if (!box) return;
      ev.preventDefault();
      box.click();
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.start);
} else {
  App.start();
}
