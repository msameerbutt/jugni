/* Destinations — one screen covering a stop completely (feedback cycle 02,
   C8/C9/C10).

   This replaces the old Cities and Guide screens, which had grown into two
   views of the same thing: Guide's country facts and notes were a duplicate of
   the detail page's lower half, which is why per-city content kept feeling
   homeless. "Destination" rather than "City" because a stop is not always one
   city — this trip has "Kiruna / Abisko" and a Helsinki + Tallinn day. */
import { html } from '../lib/html.js';
import { Icon, Flag } from '../lib/icons.js';
import { Stat, Money, HomeMoney, Empty, Section, PageHead, Stamp, Badge,
         Fold, FoldControls, Carousel } from '../ui/components.js';
import { TaskRow, ExpenseRow, LegLine, CityTitle, ForecastDay, Extra } from '../ui/parts.js';
import { useAsync } from '../ui/hooks.js';
import * as D from '../state/derive.js';
import * as A from '../actions.js';
import * as Weather from '../data/weather.js';
import * as Facts from '../data/facts.js';
import { fmtRange, fmtLocalDateTime, todayISO, day, dayDiff, inRange, plural } from '../lib/util.js';

export function Destinations({ state, param }) {
  return param
    ? html`<${DestinationDetail} state=${state} cityId=${param} />`
    : html`<${DestinationList} state=${state} />`;
}

function DestinationList({ state }) {
  const cities = D.citiesInOrder(state);
  const today = todayISO();
  if (!cities.length) {
    return html`
      <${PageHead} eyebrow="Where you go" title="Destinations" />
      <${Empty} icon="map-pin" title="No destinations yet" body="These come from your trip data." />`;
  }

  return html`
    <${PageHead} eyebrow=${plural(cities.length, 'stop')} title="Destinations" />

    <div class="grid grid--2">
      ${cities.map((c) => {
        const now = inRange(today, c.arriveDate, c.departDate || c.arriveDate);
        const stays = D.staysInCity(state, c.id);
        const nights = dayDiff(c.arriveDate, c.departDate);
        const openTasks = state.checklist.filter((t) => t.cityId === c.id && !t.done).length;
        return html`
          <a class="card" key=${c.id} href=${`#/destinations/${c.id}`}
             style=${`text-decoration:none;color:inherit${now ? ';border-color:var(--transit-blue)' : ''}`}>
            <div class="stop__head">
              <${CityTitle} city=${c} />
              ${now && html`<${Badge} kind="now">now<//>`}
            </div>
            <p class="stop__dates" style="margin-top:var(--space-2)">
              ${fmtRange(c.arriveDate, c.departDate)}${nights ? ` · ${plural(nights, 'night')}` : ''}
            </p>
            <div class="row__meta small muted" style="margin-top:var(--space-2)">
              ${stays.length
                ? html`<span><${Icon} name="bed-double" /> ${stays[0].name}</span>`
                : html`<span class="faint"><${Icon} name="bed-double" /> No stay booked</span>`}
              ${openTasks > 0 && html`<span>${plural(openTasks, 'open task')}</span>`}
            </div>
          </a>`;
      })}
    </div>
`;
}

/* One stop, complete: facts, stay, transport, tasks, guide, extras, spending.
   Sections collapse; the one relevant today opens; a section holding an alert
   refuses to close (cycle 01 F12). */
function DestinationDetail({ state, cityId }) {
  const city = D.cityById(state, cityId);
  if (!city) {
    return html`
      <${PageHead} eyebrow="Destinations" title="Unknown destination" />
      <${Empty} icon="map-pin" title="That destination is not in this trip">
        <a class="btn" href="#/destinations">Back to destinations</a>
      <//>`;
  }

  const today = todayISO();
  const isNow = inRange(today, city.arriveDate, city.departDate || city.arriveDate);
  const legs = D.legsForCity(state, city);
  const isTravelDay = legs.some((l) => day(l.departDateTime) === today);

  const stays = D.staysInCity(state, city.id);
  const tasks = state.checklist.filter((c) => c.cityId === city.id);
  const openTasks = tasks.filter((t) => !t.done);
  const lateTasks = D.overdue(state).filter((t) => t.cityId === city.id);
  const spend = state.expenses.filter((e) => e.cityId === city.id);
  const notes = state.destinationNotes.filter((n) => n.cityId === city.id);
  const extras = state.extras.filter((x) => x.cityId === city.id);
  const stayCost = D.stayCostInCity(state, city.id);
  const missingPrices = D.bookingsMissingPrice(state, city.id);
  const home = state.trip.homeCurrency;

  const liveDeadline = stays.some((x) => x.cancellationDeadline && day(x.cancellationDeadline) >= today);

  const foldIds = ['stay', 'transport', 'tasks', 'guide', 'extras', 'spending']
    .map((k) => `city.${city.id}.${k}`);

  return html`
    <${PageHead} eyebrow=${city.country || 'Destination'}
      title=${html`<span style="display:inline-flex;align-items:center;gap:.4em">
        <${Flag} city=${city} size=".85em" />${city.name}</span>`}
      actions=${html`
        <${FoldControls} ids=${foldIds} />
        <a class="btn btn--ghost" href="#/destinations">
          <${Icon} name="chevron-left" /> All destinations
        </a>`} />

    <section class="card card--accent">
      <div class="statbar statbar--divided">
        <${Stat} label="Dates" value=${fmtRange(city.arriveDate, city.departDate) || '—'}
                 note=${isNow ? 'you are here now' : ''} />
        <${Stat} label="Nights" value=${dayDiff(city.arriveDate, city.departDate) ?? 0} />
        <${Stat} label="You spent"
                 value=${html`<${Money} amount=${D.spentInCity(state, city.id)} currency=${home} />`}
                 note=${stayCost ? 'stay billed separately' : ''} />
      </div>
      ${city.notes && html`<p class="small muted" style="margin-top:var(--space-4)">${city.notes}</p>`}
      <${CountryFacts} city=${city} />
      <${LocalForecast} city=${city} />
    </section>

    ${missingPrices.length > 0 && html`
      <${Section}><${MissingPrices} items=${missingPrices} state=${state} inline /><//>`}

    <div style="margin-top:var(--space-5)">
      <${Fold} id=${foldIds[0]} title="Stay" icon="bed-double" count=${stays.length}
               defaultOpen=${!isTravelDay} alert=${liveDeadline}>
        ${stays.length
          ? stays.map((s) => html`<${StayCard} key=${s.id} stay=${s} state=${state} />`)
          : html`<${Empty} icon="bed-double" title="No stay booked here"
                   body="Nothing in the raw data covers these nights." />`}
      <//>

      <${Fold} id=${foldIds[1]} title="Getting in and out" icon="plane" count=${legs.length}
               defaultOpen=${isTravelDay}>
        ${legs.length
          ? legs.map((l) => html`<${LegLine} key=${l.id} leg=${l} boxed />`)
          : html`<p class="small muted">No transport documented for this destination.</p>`}
      <//>

      <${Fold} id=${foldIds[2]} title="Tasks here" icon="list-checks" count=${openTasks.length}
               defaultOpen=${isNow} alert=${lateTasks.length > 0}>
        <div class="row-actions hide-readonly" style="margin-bottom:var(--space-2)">
          <button class="btn" onClick=${() => A.addTask(city.id)}>
            <${Icon} name="plus" /> Add a task here
          </button>
        </div>
        ${tasks.length
          ? html`<div class="rows">
              ${tasks.map((t) => html`<${TaskRow} key=${t.id} item=${t} state=${state} showCity=${false} />`)}
            </div>`
          : html`<p class="small muted">Nothing tied to ${city.name} yet.</p>`}
      <//>

      <${Fold} id=${foldIds[3]} title="Good to know" icon="info" count=${notes.length}
               defaultOpen=${isNow && !isTravelDay}>
        ${notes.length
          ? html`
            <${Carousel} label=${`Notes about ${city.name}`}>
              ${notes.map((n) => html`
                <article class="card notecard" key=${n.id}>
                  <div class="widget__head">
                    <h3 class="card__title">${n.title}</h3>
                    <button class="btn btn--ghost btn--icon hide-readonly"
                            onClick=${() => A.editNote(n.id)} aria-label=${`Edit ${n.title}`}>
                      <${Icon} name="pencil" />
                    </button>
                  </div>
                  <p class="note-body small">${n.body}</p>
                </article>`)}
            <//>
            <div class="hide-readonly" style="margin-top:var(--space-2)">
              <button class="btn btn--ghost" onClick=${() => A.addNote(city.id)}>
                <${Icon} name="plus" /> Add a note
              </button>
            </div>`
          : html`<${Empty} icon="info" title=${`Nothing noted for ${city.name} yet`}
                   body="Emergency numbers, plug type, transit quirks.">
              <button class="btn hide-readonly" onClick=${() => A.addNote(city.id)}>Add a note</button>
            <//>`}
      <//>

      ${extras.length > 0 && html`
        <${Fold} id=${foldIds[4]} title="Worth knowing" icon="sparkles" count=${extras.length}>
          <${Carousel} label=${`Worth knowing in ${city.name}`}>
            ${extras.map((x) => html`<${Extra} key=${x.id} extra=${x} />`)}
          <//>
        <//>`}

      ${spend.length > 0 && html`
        <${Fold} id=${foldIds[5]} title="Spending here" icon="wallet" count=${spend.length}>
          <div class="rows">
            ${spend.map((e) => html`<${ExpenseRow} key=${e.id} expense=${e} state=${state} showCity=${false} />`)}
          </div>
        <//>`}
    </div>`;
}

/* Country facts, previously the Guide screen's header. */
function CountryFacts({ city }) {
  const { result } = useAsync(() => Facts.country(city.country), [city.country]);
  if (!city.country || !result?.data) return null;
  const f = result.data;
  return html`
    <div style="margin-top:var(--space-4);padding-top:var(--space-4);border-top:1px solid var(--line)"
         aria-live="polite">
      <div class="widget__head" style="margin-bottom:var(--space-3)">
        <span class="eyebrow eyebrow--accent"><${Flag} city=${city} /> ${f.name || city.country}</span>
        <${Stamp} result=${result} />
      </div>
      <div class="statbar">
        ${f.timezone && html`<${Stat} label="Local time" value=${Facts.localTime(f.timezone) || '—'} />`}
        ${f.currency && html`<${Stat} label="Currency" value=${f.currency} />`}
        ${f.dialCode && html`<${Stat} label="Dialling code" value=${f.dialCode} />`}
        ${f.languages && html`<${Stat} label="Language" value=${f.languages.split(',')[0]} />`}
      </div>
    </div>`;
}

function LocalForecast({ city }) {
  const { result } = useAsync(() => Weather.forCity(city), [city.id]);
  if (!result) return null;
  if (!result.data) {
    return html`<div class="widget" style="margin-top:var(--space-4)"><${Stamp} result=${result} /></div>`;
  }
  const window_ = (result.data.days || [])
    .filter((d) => !city.arriveDate || !city.departDate || inRange(d.date, city.arriveDate, city.departDate));
  const show = (window_.length ? window_ : result.data.days).slice(0, 7);

  return html`
    <div class="widget" style="margin-top:var(--space-4)" aria-live="polite">
      <div class="widget__head">
        <span class="eyebrow">Forecast</span>
        <${Stamp} result=${result} />
      </div>
      <div class="forecast">
        ${show.map((d) => html`<${ForecastDay} key=${d.date} d=${d} city=${city} />`)}
      </div>
    </div>`;
}

function StayCard({ stay, state }) {
  const today = todayISO();
  const passed = stay.cancellationDeadline && day(stay.cancellationDeadline) < today;
  const alreadySplit = D.stayIsSplit(state, stay.id);
  const people = D.headcount(state);

  return html`
    <div class="stub" style="margin-bottom:var(--space-3)">
      <div class="stop__head">
        <span class="stop__city">${stay.name}</span>
        <span class="stop__dates">${fmtRange(stay.checkIn, stay.checkOut)}</span>
      </div>
      ${stay.address && html`<p class="small muted wrap-anywhere">${stay.address}</p>`}

      <div class="stop__facts">
        <span class="fact">
          <span class="fact__k">Confirmation</span>
          <span class=${`fact__v wrap-anywhere ${stay.confirmationNumber ? '' : 'fact__v--zero'}`}>
            ${stay.confirmationNumber || '—'}
          </span>
        </span>
        <span class="fact">
          <span class="fact__k">Cost</span>
          <span class=${`fact__v ${stay.cost ? 'fact__v--group' : 'fact__v--zero'}`}>
            ${stay.cost
              ? html`<${HomeMoney} amount=${stay.cost} currency=${stay.currency}
                                   home=${state.trip.homeCurrency}
                                   snapshotHome=${stay.homeAmount}
                                   hints=${state.trip.rateHints} />`
              : html`<span style="color:var(--rust)">no price recorded</span>`}
          </span>
        </span>
        ${stay.cancellationDeadline && html`
          <span class="fact">
            <span class="fact__k">Free cancellation until</span>
            <span class="fact__v" style=${passed ? 'color:var(--ink-faint)' : 'color:var(--rust)'}>
              ${fmtLocalDateTime(stay.cancellationDeadline)}${passed ? ' (passed)' : ''}
            </span>
          </span>`}
      </div>

      ${stay.notes && html`<p class="small muted wrap-anywhere" style="margin-top:var(--space-3)">${stay.notes}</p>`}

      <div class="notecard__foot hide-readonly">
        ${stay.cost > 0
          ? (alreadySplit
            ? html`<span class="badge badge--done"><${Icon} name="circle-check" /> your share is logged</span>`
            : html`<button class="btn" onClick=${() => A.splitStay(stay.id)}>
                <${Icon} name="wallet" /> Add my share${people > 1 ? ` (÷${people})` : ''}
              </button>`)
          : html`<button class="btn btn--danger" onClick=${() => A.addPriceFor('stay', stay.id)}>
              <${Icon} name="triangle-alert" /> Add the price
            </button>`}
      </div>
    </div>`;
}

/* C5: a confirmed booking with no price is a real gap. Flag it in rust and
   offer to fill it — but never invent a zero-value expense record, which
   would make the expense count and the category chart lie. */
export function MissingPrices({ items, state, inline }) {
  return html`
    <div class="card" style="border-color:var(--rust);background:var(--rust-wash)">
      <div class="widget__head" style="margin-bottom:var(--space-3)">
        <h2 class="card__title" style="color:var(--rust)">
          <${Icon} name="triangle-alert" />
          ${items.length} booking${items.length === 1 ? '' : 's'} with no price
        </h2>
      </div>
      <p class="small" style="color:var(--rust);margin-bottom:var(--space-3)">
        ${inline
          ? 'Confirmed here, but the document never stated a fare — so it is missing from your spend.'
          : 'These are confirmed, but no fare was recorded, so your total is lower than what you actually paid.'}
      </p>
      <div class="rows">
        ${items.map((it) => html`
          <div class="row" key=${it.id}>
            <${Icon} name=${it.kind === 'stay' ? 'bed-double' : 'plane'} />
            <div class="row__body">
              <div class="row__title">${it.label}</div>
              <div class="row__meta small muted">
                ${it.ref && html`<span class="tkt">ref ${it.ref}</span>`}
                ${it.cityId && state && html`<span>${D.cityName(state, it.cityId)}</span>`}
              </div>
            </div>
            <div class="row__side hide-readonly">
              <button class="btn btn--danger" onClick=${() => A.addPriceFor(it.kind, it.id)}>
                Add the price
              </button>
            </div>
          </div>`)}
      </div>
    </div>`;
}
