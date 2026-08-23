/* Client-side routing: real page navigation, no server (spec §1/§8). */

const Router = {
  current: null,

  /* The default view is date-aware, not static (spec §12). */
  defaultRoute() {
    const phase = Trip.phase();
    if (phase === 'after') return 'recap';
    if (phase === 'during') return 'today';
    return 'today';   /* "Upcoming" summary — the Today screen renders it */
  },

  parse() {
    const hash = (location.hash || '').replace(/^#\/?/, '');
    if (!hash) return { name: Router.defaultRoute(), param: null };
    const parts = hash.split('/');
    const name = parts[0];
    return { name: Screens[name] ? name : Router.defaultRoute(), param: parts[1] || null };
  },

  go(route) { location.hash = '#/' + route; },

  start() {
    window.addEventListener('hashchange', Router.render);
    Store.subscribe(Router.render);
    Router.render();
  },

  render() {
    const route = Router.parse();
    const screen = Screens[route.name];
    const app = U.$('#app');

    app.innerHTML =
      Nav.render(route.name) +
      '<main class="main" id="main" tabindex="-1">' +
        '<div class="wrap view" data-view="' + route.name + '">' +
          screen.render(route.param) +
        '</div>' +
      '</main>';

    /* Announce the page change for screen readers, since no document
       navigation actually happens. */
    const title = (Nav.ITEMS.filter(function (i) { return i.id === route.name; })[0] || {}).label || 'Trip data';
    document.title = title + ' · ' + (Trip.t().name || 'Jugni');
    U.$('#route-status').textContent = title;

    if (Router.current && Router.current !== route.name) {
      U.$('#main').focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    Router.current = route.name;

    if (screen.mount) screen.mount(route.param, U.$('[data-view]'));
  }
};
