/* Expenses — three blocks, in this order:

     1. the budget: what there is, what has gone, what is left
     2. where it went, by category, with the expensive ones drawn hot
     3. the table: every line, sortable, editable, totalled

   Nothing else. This screen previously carried five sections showing
   overlapping subsets of the same money with a different control on each —
   "Flights and travel", "Bookings not in your spend", "Your share, not logged
   yet", "By category", "All expenses" — and a traveller could not tell which
   of them their total came from. */

import { html } from '../lib/html.js';
import { Icon } from '../lib/icons.js';
import { Stat, Money, Meter, Section, PageHead } from '../ui/components.js';
import { ExpenseTable, categoryAccent } from '../ui/expense-table.js';
import * as D from '../state/derive.js';
import * as A from '../actions.js';
import { plural, titleCase } from '../lib/util.js';

/* Where it went, biggest first.

   The expensive line reads hot, the cheapest reads cool. Which line that is
   differs by trip, so the colour comes from the ranking rather than from a
   fixed hue per category. Colour never carries it alone: the bar length and
   the percentage say the same thing. */
export function CategoryBreakdown({ state, cityId = null }) {
  const rows = D.categoryBreakdown(state, cityId);
  const home = state.trip.homeCurrency;
  if (!rows.length) return null;

  /* Banded by rank, not by proportion. A trip with two categories at 54% and
     46% has one expensive line and one cheap one — a proportional threshold
     called both of them hot, which is a colour saying nothing at all. */
  const heatBand = (r) => (r.rank === 0 ? 'hot' : r.rank === rows.length - 1 ? 'cool' : 'warm');

  return html`
    <div class="cats">
      ${rows.map((r) => html`
        <div class=${`cat cat--${heatBand(r)}`} key=${r.category || 'none'}
             data-accent=${categoryAccent(r.category)}>
          <div class="cat__head">
            <span class="cat__name">
              ${r.category ? titleCase(r.category) : html`<span class="faint">Uncategorised</span>`}
            </span>
            <span class="cat__pct tkt">${r.pct}%</span>
          </div>
          <div class="cat__amt"><${Money} amount=${r.total} currency=${home} digits=${2} /></div>
          <div class="cat__bar" role="presentation">
            <div class="cat__fill" style=${`width:${Math.round(r.heat * 100)}%`}></div>
          </div>
        </div>`)}
    </div>`;
}

export function Expenses({ state }) {
  const b = D.budgetState(state);
  const home = state.trip.homeCurrency;
  const perDay = D.spendPerDay(state);
  const cats = D.categoryBreakdown(state);

  return html`
    <${PageHead} eyebrow=${b.budget ? 'Tracking against budget' : 'No budget set'} title="Expenses"
      actions=${html`
        <button class="btn btn--primary hide-readonly" onClick=${() => A.quickExpense()}>
          <${Icon} name="plus" /> Add expense
        </button>`} />

    ${/* ---- 1. the budget ---- */ ''}
    <section class="card card--raised">
      <div class="budget">
        <div class="statbar statbar--divided">
          <${Stat} label="Budget"
                   value=${b.budget
                     ? html`<${Money} amount=${b.budget} currency=${home} digits=${2} />`
                     : html`<span class="faint">not set</span>`} />
          <${Stat} label="Spent" modifier="stat--hero"
                   value=${html`<${Money} amount=${b.spent} currency=${home} digits=${2} />`}
                   note=${perDay ? html`<${Money} amount=${perDay} currency=${home} /> per day so far` : ''} />
          <${Stat} label=${b.over ? 'Over budget' : 'Left to spend'}
                   modifier=${`stat--hero ${b.over ? 'stat--over' : ''}`}
                   value=${b.budget
                     ? html`<${Money} amount=${Math.abs(b.left)} currency=${home} digits=${2} />`
                     : html`<span class="faint">—</span>`}
                   note=${b.budget ? `${b.pct}% of budget used` : 'set a budget in Trip data'} />
        </div>

        ${b.budget > 0 && html`
          <div class="budget__meter">
            <${Meter} value=${b.spent} max=${b.budget} over=${b.over} large />
            ${b.over && html`
              <span class="budget__over">
                <${Icon} name="triangle-alert" />
                <${Money} amount=${b.spent - b.budget} currency=${home} /> over budget
              </span>`}
          </div>`}
      </div>
    </section>

    ${/* ---- 2. where it went ---- */ ''}
    ${cats.length > 0 && html`
      <${Section} title="Where it went" icon="chart-column"
        actions=${html`<span class="small muted">${plural(cats.length, 'category', 'categories')}
                       · brightest is the biggest</span>`}>
        <${CategoryBreakdown} state=${state} />
      <//>`}

    ${/* ---- 3. every line ---- */ ''}
    <${Section} title="All expenses" icon="wallet" count=${state.expenses.length}>
      <${ExpenseTable} state=${state} title="Every expense" />
    <//>

    <button class="btn btn--primary quickcap hide-readonly" onClick=${() => A.quickExpense()}>
      <${Icon} name="plus" /> Add expense
    </button>`;
}
