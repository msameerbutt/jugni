import { html } from '../lib/html.js';
import { Icon } from '../lib/icons.js';
import { Stat, Money, HomeMoney, Meter, Empty, Section, PageHead, Badge } from '../ui/components.js';
import { LegLine, CityTitle } from '../ui/parts.js';
import * as D from '../state/derive.js';
import * as A from '../actions.js';
import { fmtRange, todayISO, day, inRange, dayDiff, plural } from '../lib/util.js';

/* Overview — the manifest thread (spec §11). One connected route line of
   ticket stubs, not a grid of cards. */
export function Overview({ state }) {
  const cities = D.citiesInOrder(state);
  const today = todayISO();

  if (!cities.length) {
    return html`
      <${PageHead} eyebrow="Overview" title=${state.trip.name || 'Route'} />
      <${Empty} icon="route" title="No cities yet" body="Cities appear here once your trip data is loaded.">
        <a class="btn" href="#/data">Import a trip file</a>
      <//>`;
  }

  const legs = D.transportInOrder(state);
  const used = new Set();

  return html`
    <${PageHead} eyebrow="Overview" title=${state.trip.name || 'Route'}
      actions=${html`
        <button class="btn" onClick=${A.exportICS}><${Icon} name="download" /> Add to calendar</button>`} />

    <${Summary} state=${state} />

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
