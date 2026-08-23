import { html } from '../lib/html.js';
import { Icon, Flag } from '../lib/icons.js';
import { Stat, Money, Meter, Empty, Section, PageHead } from '../ui/components.js';
import * as D from '../state/derive.js';
import * as A from '../actions.js';
import { fmtRange, fmtDate, sortBy, pct, plural } from '../lib/util.js';

/* Trip Recap (spec §12): once endDate passes, give the trip an actual close
   rather than letting the file go stale. */
export function Recap({ state }) {
  const phase = D.phase(state);
  if (phase === 'before' || phase === 'planning') {
    return html`
      <${PageHead} eyebrow="After the trip" title="Recap" />
      <${Empty} icon="chart-column" title="Not yet"
        body="Your recap — spend against budget, cities visited, checklist completion — appears here once the trip is under way." />`;
  }

  const b = D.budgetState(state);
  const stats = D.checklistStats(state);
  const cities = D.citiesInOrder(state);
  const home = state.trip.homeCurrency;
  const byCat = D.spendByCategory(state);
  const days = D.totalDays(state);
  const perDay = D.spendPerDay(state);
  const biggest = sortBy(state.expenses, (e) => -(e.homeAmount || 0))[0];

  return html`
    <${PageHead} eyebrow=${phase === 'after' ? 'Trip complete' : 'So far'}
                 title=${state.trip.name || 'Trip recap'} />

    <section class="card card--raised recap__hero">
      <span class="eyebrow eyebrow--accent">${fmtRange(state.trip.startDate, state.trip.endDate)}</span>
      <p class="recap__title">
        ${days ? plural(days, 'day') : '—'} · ${plural(cities.length, 'city', 'cities')}
      </p>
      <div class="recap__route">
        ${cities.map((c, i) => html`
          <span key=${c.id} class="chip">
            <${Flag} city=${c} />${c.name}
          </span>`)}
      </div>
    </section>

    <${Section} title="The numbers" icon="chart-column">
      <div class="grid grid--4">
        <div class="card">
          <${Stat} label="Total spent" modifier="stat--hero"
                   value=${html`<${Money} amount=${b.spent} currency=${home} />`} />
          ${b.budget > 0 && html`
            <div style="margin-top:var(--space-3)">
              <${Meter} value=${b.spent} max=${b.budget} over=${b.over} />
              <p class="small muted" style="margin-top:var(--space-2)">
                ${b.over
                  ? html`<${Money} amount=${b.spent - b.budget} currency=${home} /> over budget`
                  : html`<${Money} amount=${b.left} currency=${home} /> under budget`}
              </p>
            </div>`}
        </div>
        <div class="card">
          <${Stat} label="Per day" modifier="stat--hero"
                   value=${perDay ? html`<${Money} amount=${perDay} currency=${home} />` : '—'} />
        </div>
        <div class="card">
          <${Stat} label="Checklist done" modifier="stat--hero" value=${`${stats.pct}%`} />
          <div style="margin-top:var(--space-3)"><${Meter} value=${stats.done} max=${stats.total} /></div>
        </div>
        <div class="card">
          <${Stat} label="Transit legs" modifier="stat--hero" value=${state.transport.length}
                   note=${plural(state.stays.length, 'stay')} />
        </div>
      </div>
    <//>

    ${byCat.length > 0 && html`
      <${Section} title="Where the money went" icon="wallet">
        <div class="card card--flat"><div class="rows">
          ${byCat.map((c) => html`
            <div class="row" key=${c.category}>
              <div class="row__body">
                <div class="row__title">${A.categoryById(c.category).label}</div>
                <div style="margin-top:var(--space-2)"><${Meter} value=${c.total} max=${b.spent} /></div>
              </div>
              <div class="row__side">
                <${Money} amount=${c.total} currency=${home} />
                <span class="small muted tkt">${pct(c.total, b.spent)}%</span>
              </div>
            </div>`)}
        </div></div>
      <//>`}

    ${biggest?.homeAmount > 0 && html`
      <${Section} title="Single biggest expense" icon="wallet">
        <div class="card">
          <${Stat} label=${biggest.label || A.categoryById(biggest.category).label}
                   modifier="stat--hero"
                   value=${html`<${Money} amount=${biggest.homeAmount} currency=${home} />`}
                   note=${biggest.cityId ? D.cityName(state, biggest.cityId) : ''} />
        </div>
      <//>`}

    ${state.log.length > 0 && html`
      <${Section} title="Trip log" icon="file-text" count=${state.log.length}>
        <div class="card card--flat"><div class="rows">
          ${sortBy(state.log, (l) => l.date).reverse().slice(0, 25).map((l) => html`
            <div class="row" key=${l.id}>
              <div class="row__body"><div class="row__title small">${l.text}</div></div>
              <div class="row__side small muted tkt">${fmtDate(l.date)}</div>
            </div>`)}
        </div></div>
      <//>`}

    <${Section}>
      <div class="card datarow">
        <div class="datarow__text">
          <strong>Keep this trip</strong>
          <p class="small muted">Export the file so the trip survives a cleared browser.</p>
        </div>
        <button class="btn btn--primary hide-readonly" onClick=${A.exportTrip}>
          <${Icon} name="download" /> Export trip file
        </button>
      </div>
    <//>`;
}
