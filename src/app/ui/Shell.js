import { html } from '../lib/html.js';
import { Icon } from '../lib/icons.js';
import { Rail, SCREENS, accentFor } from './Nav.js';
import { SheetHost, ToastHost } from './Sheet.js';
import { useRoute, useEffect, useRef, useState } from './hooks.js';
import { useTrip, isReadonly, getStaleBuild } from '../state/store.js';
import * as D from '../state/derive.js';
import * as A from '../actions.js';

import { Today } from '../screens/Today.js';
import { Overview } from '../screens/Overview.js';
import { Checklist } from '../screens/Checklist.js';
import { Destinations } from '../screens/Destinations.js';
import { Expenses } from '../screens/Expenses.js';
import { WeatherScreen } from '../screens/Weather.js';
import { Recap } from '../screens/Recap.js';
import { Data } from '../screens/Data.js';

const SCREEN_COMPONENTS = {
  today: Today, overview: Overview, checklist: Checklist,
  destinations: Destinations, expenses: Expenses, weather: WeatherScreen,
  recap: Recap, data: Data,
};

/* Old hashes from a bookmark or a shared link still resolve. */
const ROUTE_ALIASES = { cities: 'destinations', destination: 'destinations' };

export function App() {
  const state = useTrip();

  /* The default view is date-aware, not static (spec §12). */
  const fallback = () => (D.phase(state) === 'after' ? 'recap' : 'today');
  const route = useRoute(fallback);
  const aliased = ROUTE_ALIASES[route.name] || route.name;
  const name = SCREEN_COMPONENTS[aliased] ? aliased : fallback();
  const Screen = SCREEN_COMPONENTS[name];
  const meta = SCREENS.find((s) => s.id === name);
  const main = useRef(null);
  const previous = useRef(null);

  useEffect(() => {
    const label = meta?.label || 'Trip data';
    document.title = `${label} · ${state.trip.name || 'Jugni'}`;
    const status = document.getElementById('route-status');
    if (status) status.textContent = label;

    /* No document navigation actually happens, so move focus and scroll
       deliberately — but only on a real route change, or every keystroke in a
       sheet would yank the page back to the top. */
    if (previous.current && previous.current !== name) {
      main.current?.focus?.({ preventScroll: true });
      scrollTo({ top: 0, behavior: 'auto' });
    }
    previous.current = name;
  }, [name, state.trip.name]);

  return html`
    <div class="app">
      <${Rail} active=${name} state=${state} onShare=${A.share} />

      <main class="main" id="main" tabindex="-1" ref=${main}>
        ${/* F5: share reachable from every screen, including on mobile where
             the rail's footer is hidden. */ ''}
        <header class="topbar">
          <span class="rail__wordmark">
            ${D.ownerPossessive(state) && html`
              <span class="rail__owner rail__owner--inline">${D.ownerPossessive(state)}</span>`}${' '}Jugni
          </span>
          <span class="topbar__title truncate">${state.trip.name || 'Untitled trip'}</span>
          <span class="spacer"></span>
          <button class="btn btn--ghost btn--icon hide-readonly" onClick=${A.share} aria-label="Share this trip">
            <${Icon} name="share-2" />
          </button>
          <a class="btn btn--ghost btn--icon" href="#/data" aria-label="Trip data">
            <${Icon} name="settings" />
          </a>
        </header>

        <${RebuiltNotice} />

        <div class="wrap view" data-view=${name} data-accent=${accentFor(name)} key=${name}>
          <${Screen} state=${state} param=${route.param} />
        </div>
      </main>

      <${SheetHost} />
      <${ToastHost} />
    </div>`;
}

/* This file was rebuilt from newer trip data than the copy saved in this
   browser — regenerated with bookings that were not in the last build, say.

   It has to be an offer rather than an automatic swap: the saved copy holds
   ticked tasks and logged spend that the rebuild has never seen, and silently
   replacing them would be the worse bug. But saying nothing is what makes a
   freshly generated booking appear to be missing, so it cannot be silent
   either. */
function RebuiltNotice() {
  const [dismissed, setDismissed] = useState(false);
  const stale = getStaleBuild();
  if (!stale || dismissed || isReadonly()) return null;

  return html`
    <div class="rebuilt" role="status">
      <${Icon} name="info" />
      <p class="rebuilt__text">
        This file was built with newer trip data than the copy saved in this
        browser. Anything you have changed here is still safe — loading the new
        data replaces it.
      </p>
      <div class="rebuilt__actions">
        <button class="btn btn--primary" onClick=${A.restoreBuilt}>Load the new data</button>
        <button class="btn btn--ghost" onClick=${() => setDismissed(true)}>Keep mine</button>
      </div>
    </div>`;
}

export function ReadonlyBanner({ tripName }) {
  if (!isReadonly()) return null;
  return html`<p class="readonly-banner">
    <${Icon} name="info" /> Read-only snapshot of ${tripName || 'this trip'}
  </p>`;
}
