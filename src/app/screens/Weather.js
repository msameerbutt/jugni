import { html } from '../lib/html.js';
import { Icon } from '../lib/icons.js';
import { Empty, PageHead, Stamp } from '../ui/components.js';
import { useAsync } from '../ui/hooks.js';
import { ForecastDay } from '../ui/parts.js';
import * as D from '../state/derive.js';
import * as Weather from '../data/weather.js';
import { fmtRange, plural } from '../lib/util.js';

export function WeatherScreen({ state }) {
  const cities = D.citiesInOrder(state);
  if (!cities.length) {
    return html`
      <${PageHead} eyebrow="Live forecast" title="Weather" />
      <${Empty} icon="cloud-sun" title="No cities yet"
                body="Forecasts are tied to the cities in your trip." />`;
  }
  return html`
    <${PageHead} eyebrow="Live forecast per city" title="Weather" />
    <p class="small muted">
      Forecasts reach about 10 days out. Days inside your dates for that city are highlighted.
    </p>
    <div class="grid" style="margin-top:var(--space-4)">
      ${cities.map((c) => html`<${CityForecast} key=${c.id} city=${c} />`)}
    </div>`;
}

function CityForecast({ city }) {
  const { result, loading, reload } = useAsync(() => Weather.forCity(city), [city.id]);

  return html`
    <section class="card widget" aria-live="polite">
      <div class="widget__head">
        <div>
          <h2 class="card__title">${city.name}</h2>
          <p class="small muted tkt">${fmtRange(city.arriveDate, city.departDate)}</p>
        </div>
        <div class="row-actions">
          ${result && html`<${Stamp} result=${result} />`}
          <button class="btn btn--ghost btn--icon" onClick=${reload} aria-label=${`Refresh ${city.name}`}>
            <${Icon} name="refresh-cw" />
          </button>
        </div>
      </div>

      ${loading && !result && html`<p class="small muted">loading…</p>`}

      ${result && !result.data && html`
        <p class="small muted">
          ${typeof city.lat === 'number'
            ? 'No forecast available offline yet.'
            : "This city has no coordinates in the trip data, so it can't be looked up."}
        </p>`}

      ${result?.data && html`
        <div class="forecast">
          ${result.data.days.map((d) => html`<${ForecastDay} key=${d.date} d=${d} city=${city} />`)}
        </div>
        <${Nudges} wx=${result.data} city=${city} />`}
    </section>`;
}

/* Weather-informed packing (spec §12), stated where the weather is. */
function Nudges({ wx, city }) {
  const rainy = Weather.rainyDays(wx, city.arriveDate, city.departDate);
  const cold = Weather.coldDays(wx, city.arriveDate, city.departDate);
  if (!rainy.length && !cold.length) return null;

  return html`
    <div style="display:flex;flex-direction:column;gap:var(--space-2)">
      ${rainy.length > 0 && html`
        <p class="nudge">
          <${Icon} name="cloud-sun" />
          <span>${plural(rainy.length, 'wet day')} while you're here — worth a rain shell.
            ${' '}<a href="#/checklist">Check your packing list →</a></span>
        </p>`}
      ${cold.length > 0 && html`
        <p class="nudge">
          <${Icon} name="shirt" />
          <span>Lows around ${Math.round(Math.min(...cold.map((d) => d.min)))}° —
            thermal layers, not just a jacket.</span>
        </p>`}
    </div>`;
}
