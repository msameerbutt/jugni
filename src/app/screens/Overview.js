import { html } from '../lib/html.js';
import { Icon, Flag, modeIcon } from '../lib/icons.js';
import { Stat, Money, HomeMoney, Meter, Empty, Section, PageHead, Badge } from '../ui/components.js';
import { LegLine, CityTitle } from '../ui/parts.js';
import { usePref } from '../ui/hooks.js';
import * as D from '../state/derive.js';
import * as A from '../actions.js';
import { fmtRange, fmtLocalTime, todayISO, toDate, day, inRange, dayDiff, plural } from '../lib/util.js';

/* Overview — the manifest thread (spec §11). One connected route line of
   ticket stubs, not a grid of cards. */
export function Overview({ state }) {
  const cities = D.citiesInOrder(state);
  const today = todayISO();
  /* Which lens the traveller last used is a per-viewer preference, not trip
     data — it must never travel inside a shared file. */
  const [lens, setLens] = usePref('routeLens', 'stop');

  if (!cities.length) {
    return html`
      <${PageHead} eyebrow="Overview" title=${state.trip.name || 'Route'} />
      <${Empty} icon="route" title="No cities yet" body="Cities appear here once your trip data is loaded.">
        <a class="btn" href="#/data">Import a trip file</a>
      <//>`;
  }

  const days = D.tripDays(state, today);

  return html`
    <${PageHead} eyebrow="Overview" title=${state.trip.name || 'Route'}
      actions=${html`
        <button class="btn" onClick=${A.exportICS}><${Icon} name="download" /> Add to calendar</button>`} />

    <${Summary} state=${state} />

    ${days.length > 0 && html`
      <${LensSwitch} lens=${lens} onPick=${setLens}
                     stops=${cities.length} days=${days.length} />`}

    ${lens === 'day' && days.length
      ? html`<${ByDay} state=${state} days=${days} />`
      : html`<${ByStop} state=${state} cities=${cities} today=${today} />`}`;
}

/* ---------- Lens: by stop ---------- */

function ByStop({ state, cities, today }) {
  const legs = D.transportInOrder(state);
  const used = new Set();

  return html`
    <${Section}>
      <div class="thread">
        ${cities.map((city) => {
          const isNow = inRange(today, city.arriveDate, city.departDate || city.arriveDate);
          const isDone = city.departDate && day(city.departDate) < today;
          const outLeg = legs.find((l) => !used.has(l.id) && city.departDate
            && day(l.departDateTime) === day(city.departDate));
          if (outLeg) used.add(outLeg.id);
          return html`
            <div key=${city.id}>
              <div class=${`thread__stop ${isNow ? 'thread__stop--now' : isDone ? 'thread__stop--done' : ''}`}>
                <span class="thread__node"></span>
                <a class=${`stub stop ${isNow ? 'stub--now' : ''}`} href=${`#/destinations/${city.id}`}>
                  <div class="stop__head">
                    <${CityTitle} city=${city} />
                    <span class="stop__dates">
                      ${fmtRange(city.arriveDate, city.departDate)}
                      ${isNow && html` <${Badge} kind="now">you are here<//>`}
                    </span>
                  </div>
                  <${StopFacts} state=${state} city=${city} />
                </a>
              </div>
              ${outLeg && html`<${LegLine} leg=${outLeg} />`}
            </div>`;
        })}
      </div>
    <//>

    ${legs.filter((l) => !used.has(l.id)).length > 0 && html`
      <${Section} title="Other legs" icon="plane">
        <p class="small muted" style="margin-bottom:var(--space-3)">
          Booked transport that doesn't line up with a documented departure date.
        </p>
        ${legs.filter((l) => !used.has(l.id)).map((l) => html`<${LegLine} key=${l.id} leg=${l} boxed />`)}
      <//>`}`;
}

/* ---------- Lens: by day ----------

   One row per calendar day of the trip, DAY 1 through the flight home. Every
   day is rendered, including the quiet ones: a day that vanishes because
   nothing is booked on it is exactly the day worth noticing. */
function ByDay({ state, days }) {
  return html`
    <${Section}>
      <div class="thread thread--days">
        ${days.map((d) => html`<${DayRow} key=${d.iso} d=${d} state=${state} />`)}
      </div>
    <//>`;
}

/* Property names arrive as booking-platform strings, often with the branch or
   room type appended after a comma. Drop that tail; `.truncate` handles the
   ones that are simply long. Same rule the by-stop lens already uses. */
const shortStay = (stay) => stay.name.split(/[,(]/)[0].trim();

function DayRow({ d, state }) {
  const date = toDate(d.iso);
  const moving = d.legs.length > 0;
  const home = state.trip.homeCurrency;

  return html`
    <div class=${`thread__stop dayrow ${d.isToday ? 'thread__stop--now' : d.isPast ? 'thread__stop--done' : ''}`}>
      <span class="thread__node"></span>
      <a class=${`stub day ${d.isToday ? 'stub--now' : ''}`} href=${`#/today/${d.iso}`}>
        <div class="day__head">
          <span class="day__when">
            <span class="day__n">Day ${d.n}</span>
            <span class="day__date">
              ${date?.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </span>
          <span class="day__where">
            ${d.chain.length
              ? d.chain.map((c, i) => html`
                  <span class="day__hop" key=${c.id}>
                    ${i > 0 && html`<span class="day__arrow" aria-hidden="true">→</span>`}
                    <${Flag} city=${c} /><span class="truncate">${c.name}</span>
                  </span>`)
              : html`<span class="muted">In transit</span>`}
            ${d.isToday && html`<${Badge} kind="now">today<//>`}
          </span>
        </div>

        ${moving && html`
          <div class="day__legs">
            ${d.legs.map((l) => html`
              <span class="day__leg" key=${l.id}>
                <${Icon} name=${modeIcon(l.mode)} />
                <span class="truncate">${l.from || '?'} → ${l.to || '?'}</span>
                <span class="day__time">${fmtLocalTime(l.departDateTime) || ''}</span>
              </span>`)}
          </div>`}

        <div class="day__marks">
          <span class=${`day__mark ${d.stay ? '' : 'day__mark--none'}`}>
            <${Icon} name="bed-double" />
            <span class="truncate">${d.stay ? shortStay(d.stay) : 'no bed booked'}</span>
            ${d.stay && d.checkIn?.id === d.stay.id && html`<span class="badge">check in</span>`}
          </span>

          ${d.checkOut && d.checkOut.id !== d.stay?.id && html`
            <span class="day__mark">
              <${Icon} name="luggage" />
              <span class="truncate">out of ${shortStay(d.checkOut)}</span>
            </span>`}

          ${d.due.length > 0 && html`
            <span class="day__mark">
              <${Icon} name="list-checks" />${plural(d.due.length, 'task')} due
            </span>`}

          ${d.spent > 0 && html`
            <span class="day__mark">
              <${Icon} name="wallet" /><${Money} amount=${d.spent} currency=${home} />
            </span>`}
        </div>
      </a>
    </div>`;
}

/* Two readings of one route. Buttons rather than links: this changes how the
   page is drawn, not where you are, so it must not push a history entry. */
function LensSwitch({ lens, onPick, stops, days }) {
  const opt = (id, label, count) => html`
    <button class=${`lens__opt ${lens === id ? 'lens__opt--on' : ''}`}
            aria-pressed=${String(lens === id)} onClick=${() => onPick(id)}>
      ${label} <span class="lens__count">${count}</span>
    </button>`;

  return html`
    <div class="lens" role="group" aria-label="How to read the route">
      ${opt('stop', 'By stop', stops)}
      ${opt('day', 'By day', days)}
    </div>`;
}

/* F8: every stop shows the same columns. A figure that vanishes when it is
   zero reads as a bug, and hides that accommodation was never counted. */
function StopFacts({ state, city }) {
  const nights = dayDiff(city.arriveDate, city.departDate);
  const stays = D.staysInCity(state, city.id);
  const stayCost = D.stayCostInCity(state, city.id);
  const spend = D.spentInCity(state, city.id);
  const open = state.checklist.filter((c) => c.cityId === city.id && !c.done).length;
  const home = state.trip.homeCurrency;

  return html`
    <div class="stop__facts">
      <span class="fact">
        <span class="fact__k">Nights</span>
        <span class=${`fact__v ${nights ? '' : 'fact__v--zero'}`}>${nights ?? 0}</span>
      </span>

      <span class="fact">
        <span class="fact__k">Stay</span>
        <span class=${`fact__v ${stays.length ? '' : 'fact__v--zero'}`}>
          ${stays.length ? stays[0].name.split(/[,(]/)[0].trim() : 'none booked'}
        </span>
      </span>

      <span class="fact">
        <span class="fact__k">Stay cost</span>
        <span class=${`fact__v ${stayCost ? 'fact__v--group' : 'fact__v--zero'}`}>
          ${stayCost
            ? html`<${HomeMoney} amount=${stayCost.total} currency=${stayCost.currency} home=${home}
                            snapshotHome=${stayCost.homeAmount} hints=${state.trip.rateHints} />`
            : '—'}
        </span>
      </span>

      <span class="fact">
        <span class="fact__k">You spent</span>
        <span class=${`fact__v ${spend ? '' : 'fact__v--zero'}`}>
          <${Money} amount=${spend} currency=${home} />
        </span>
      </span>

      <span class="fact">
        <span class="fact__k">Open tasks</span>
        <span class=${`fact__v ${open ? '' : 'fact__v--zero'}`}>${open}</span>
      </span>
    </div>`;
}

/* F7: the old block jammed two unrelated numbers into one stat labelled
   "cities · legs". Separate figures, and the budget gets real room. */
function Summary({ state }) {
  const b = D.budgetState(state);
  const stats = D.checklistStats(state);
  const home = state.trip.homeCurrency;
  const total = D.totalDays(state);
  const perDay = D.spendPerDay(state);

  return html`
    <section class="card card--raised">
      <div class="budget">
        <div class="statbar statbar--divided">
          <${Stat} label="Cities" value=${state.cities.length}
                   note=${total ? plural(total, 'day') : ''} />
          <${Stat} label="Transit legs" value=${state.transport.length}
                   note=${state.stays.length ? `${state.stays.length} stays booked` : 'no stays booked'} />
          <${Stat} label="Checklist" value=${`${stats.done}/${stats.total}`}
                   note=${stats.open ? `${stats.open} open` : 'all done'} />
        </div>

        <div class="budget__meter">
          <div class="budget__legend">
            <span><strong style="color:var(--ink)">
              <${Money} amount=${b.spent} currency=${home} /></strong> spent</span>
            ${b.budget > 0 && html`<span>of <${Money} amount=${b.budget} currency=${home} /></span>`}
          </div>
          ${b.budget > 0
            ? html`
              <${Meter} value=${b.spent} max=${b.budget} over=${b.over} large />
              <div class="budget__legend">
                <span class="tkt">${b.pct}%</span>
                <span>${b.over
                  ? html`<span style="color:var(--rust);font-weight:600">
                      <${Money} amount=${b.spent - b.budget} currency=${home} /> over</span>`
                  : html`<${Money} amount=${b.left} currency=${home} /> left`}</span>
              </div>`
            : html`<p class="small muted">No budget set — <a href="#/data">add one</a> to track against it.</p>`}
          ${perDay && html`<p class="small muted">
            <${Money} amount=${perDay} currency=${home} /> per day so far</p>`}
        </div>
      </div>
    </section>`;
}
