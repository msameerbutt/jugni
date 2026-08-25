import { html } from '../lib/html.js';
import { Icon } from '../lib/icons.js';
import { Stat, Money, HomeMoney, Meter, Empty, Section, PageHead } from '../ui/components.js';
import { ExpenseRow } from '../ui/parts.js';
import { MissingPrices } from './Destinations.js';
import * as D from '../state/derive.js';
import * as A from '../actions.js';
import { sortBy, pct, plural, fmtDate } from '../lib/util.js';

const CATEGORY_HUE = {
  food: 'clay', transport: 'indigo', stay: 'plum', activity: 'cyan',
  shopping: 'magenta', fees: 'slate', other: 'sage',
};

/* Every booking, with every leg it covers.

   A four-flight ticket has one fare and four legs. Listing only the leg that
   happens to carry the fare loses the other three, and with them any way to
   record that they cost nothing on their own — which is exactly what a
   traveller wants to write down for the second, third and fourth flight of a
   return ticket. */
function BookingGroup({ group, state }) {
  const home = state.trip.homeCurrency;
  return html`
    <div class="card card--flat" style="margin-bottom:var(--space-3)">
      <div class="widget__head" style="margin-bottom:var(--space-2)">
        <span class="eyebrow">
          ${group.ref ? html`ref ${group.ref}` : (group.kind === 'stay' ? 'Stay' : 'Booking')}
          ${group.items.length > 1 && html` · ${plural(group.items.length, 'leg')}`}
        </span>
        ${group.paid
          ? html`<${HomeMoney} amount=${group.total} currency=${group.currency} home=${home}
                        hints=${state.trip.rateHints} />`
          : html`<span class="small muted">no fare recorded</span>`}
      </div>
      <div class="rows">
        ${group.items.map((r) => html`
          <div class="row" key=${r.id}>
            <${Icon} name=${r.kind === 'stay' ? 'bed-double' : 'plane'} />
            <div class="row__body">
              <div class="row__title">${r.label}</div>
              ${r.date && html`<div class="row__meta small muted tkt">${fmtDate(r.date)}</div>`}
            </div>
            <div class="row__side">
              ${Number(r.cost) > 0
                ? html`<${HomeMoney} amount=${r.cost} currency=${r.currency} home=${home}
                               snapshotHome=${r.homeAmount} hints=${state.trip.rateHints} />`
                : r.priced
                  ? html`<span class="small muted">no extra cost</span>`
                  : html`<button class="btn btn--ghost hide-readonly"
                            onClick=${() => A.addPriceFor(r.kind, r.id)}>
                      <${Icon} name="plus" /> Add the price
                    </button>`}
              ${/* A figure already entered can still be wrong. Every row that
                    shows a price offers the way to change it. */ ''}
              ${r.priced && html`
                <button class="btn btn--ghost btn--icon hide-readonly"
                        onClick=${() => A.addPriceFor(r.kind, r.id)}
                        aria-label=${`Edit the price of ${r.label}`}>
                  <${Icon} name="pencil" />
                </button>`}
            </div>
          </div>`)}
      </div>
    </div>`;
}

export function Expenses({ state }) {
  const b = D.budgetState(state);
  const home = state.trip.homeCurrency;
  const list = sortBy(state.expenses, (e) => e.date || '').reverse();
  const perDay = D.spendPerDay(state);
  const pending = D.unconverted(state);
  const byCat = D.spendByCategory(state);
  const unsplit = state.stays.filter((x) => Number(x.cost) > 0 && !D.stayIsSplit(state, x.id));
  const missingPrices = D.bookingsMissingPrice(state);
  /* Transport only. Stays already appear twice on this screen — under
     "Bookings not in your spend", where the action is, and on their own
     destination pages — so listing them a third time here was two sections
     with almost the same title showing the same nine rows. */
  const bookings = D.bookingGroups(state).filter((g) => g.kind === 'transport');

  return html`
    <${PageHead} eyebrow=${b.budget ? 'Tracking against budget' : 'No budget set'} title="Expenses"
      actions=${html`
        <button class="btn btn--primary" onClick=${() => A.quickExpense()}>
          <${Icon} name="plus" /> Log spend
        </button>`} />

    ${/* F15: spent and remaining given real weight, the currency code stated
          rather than an ambiguous narrow symbol. */ ''}
    <section class="card card--raised">
      <div class="budget">
        <div class="statbar statbar--divided">
          <${Stat} label="Spent" modifier="stat--hero"
                   value=${html`<${Money} amount=${b.spent} currency=${home} />`}
                   note=${perDay ? html`<${Money} amount=${perDay} currency=${home} /> per day so far` : ''} />
          <${Stat} label=${b.over ? 'Over budget' : 'Left to spend'}
                   modifier=${`stat--hero ${b.over ? 'stat--over' : ''}`}
                   value=${html`<${Money} amount=${Math.abs(b.left)} currency=${home} />`}
                   note=${b.budget ? html`of <${Money} amount=${b.budget} currency=${home} />` : 'no budget set'} />
        </div>

        <div class="budget__meter">
          ${b.budget > 0 && html`
            <${Meter} value=${b.spent} max=${b.budget} over=${b.over} large />
            <div class="budget__legend">
              <span class="tkt">${b.pct}% used</span>
              <span class="tkt">${plural(state.expenses.length, 'entry', 'entries')}</span>
            </div>`}
          ${byCat.length > 0 && html`
            <div class="catbar" role="presentation">
              ${byCat.map((c) => html`
                <span class="catbar__seg" key=${c.category}
                      data-accent=${CATEGORY_HUE[c.category] || 'sage'}
                      style=${`width:${pct(c.total, b.spent)}%;background:var(--accent)`}></span>`)}
            </div>`}
          ${b.over && html`
            <span class="budget__over">
              <${Icon} name="triangle-alert" />
              <${Money} amount=${b.spent - b.budget} currency=${home} /> over budget
            </span>`}
        </div>
      </div>

      ${pending.length > 0 && html`
        <p class="nudge nudge--warn" style="margin-top:var(--space-4)">
          <${Icon} name="wifi-off" />
          <span>${plural(pending.length, 'expense')} saved offline without a converted amount.
          They fill in next time you're online.</span>
        </p>`}
    </section>

    ${bookings.length > 0 && html`
      <${Section} title="Flights and travel" icon="plane" count=${bookings.length}
        actions=${html`<span class="small muted">every leg, and what each booking cost</span>`}>
        ${bookings.map((g) => html`<${BookingGroup} key=${g.ref || g.items[0].id}
                                     group=${g} state=${state} />`)}
      <//>`}

    ${missingPrices.length > 0 && html`
      <${Section}><${MissingPrices} items=${missingPrices} state=${state} /><//>`}

    ${/* F8: accommodation is recorded on the booking, but these are group
          totals — so offer the split rather than quietly counting it. */ ''}
    ${unsplit.length > 0 && html`
      <${Section} title="Your share, not logged yet" icon="bed-double" count=${unsplit.length}>
        <p class="small muted" style="margin-bottom:var(--space-3)">
          These are confirmed stays with a cost on the booking. They are usually billed to the
          whole party, so they don't count against your budget until you add your share.
        </p>
        <div class="card card--flat"><div class="rows">
          ${unsplit.map((x) => html`
            <div class="row" key=${x.id}>
              <${Icon} name="bed-double" />
              <div class="row__body">
                <div class="row__title">${x.name}</div>
                <div class="row__meta small muted">${D.cityName(state, x.cityId)}</div>
              </div>
              <div class="row__side">
                <${HomeMoney} amount=${x.cost} currency=${x.currency} home=${home}
                              snapshotHome=${x.homeAmount} hints=${state.trip.rateHints} />
                <button class="btn btn--ghost hide-readonly" onClick=${() => A.splitStay(x.id)}>
                  Add my share
                </button>
              </div>
            </div>`)}
        </div></div>
      <//>`}

    ${byCat.length > 0 && html`
      <${Section} title="By category" icon="chart-column">
        <div class="card card--flat"><div class="rows">
          ${byCat.map((c) => html`
            <div class="row" key=${c.category} data-accent=${CATEGORY_HUE[c.category] || 'sage'}>
              <div class="row__body">
                <div class="row__title">${A.categoryById(c.category).label}</div>
                <div style="margin-top:var(--space-2)">
                  <div class="meter"><div class="meter__fill"
                    style=${`width:${pct(c.total, b.spent)}%;background:var(--accent)`}></div></div>
                </div>
              </div>
              <div class="row__side">
                <${Money} amount=${c.total} currency=${home} />
                <span class="small muted tkt">${pct(c.total, b.spent)}%</span>
              </div>
            </div>`)}
        </div></div>
      <//>`}

    <${Section} title="All expenses" icon="wallet" count=${list.length}>
      ${list.length
        ? html`<div class="card card--flat"><div class="rows">
            ${list.map((e) => html`<${ExpenseRow} key=${e.id} expense=${e} state=${state} />`)}
          </div></div>`
        : html`<${Empty} icon="wallet" title="Nothing logged yet"
            body="Two taps: amount and category. Date and city fill themselves in.">
            <button class="btn btn--primary hide-readonly" onClick=${() => A.quickExpense()}>
              Log your first spend
            </button>
          <//>`}
    <//>

    <button class="btn btn--primary quickcap hide-readonly" onClick=${() => A.quickExpense()}>
      <${Icon} name="plus" /> Log spend
    </button>`;
}
