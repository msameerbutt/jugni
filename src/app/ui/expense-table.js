/* The expense table — the only way expenses are ever listed.

   The Expenses screen shows all of them; a destination page passes a cityId
   and shows that city's. Same columns, same sorting, same totals row, same
   edit and delete controls. A second, smaller "just for this page" list is
   how the app grew four ways of displaying money in the first place.

   On a phone the same markup becomes a stack of boxes — one per expense, each
   field labelled, each keeping its row number so you can tell where you are
   in a long list. One layout described twice, not two layouts. */

import { html } from '../lib/html.js';
import { useState } from './hooks.js';
import { Icon } from '../lib/icons.js';
import { Money, Empty } from './components.js';
import * as D from '../state/derive.js';
import * as A from '../actions.js';
import { fmtDate, titleCase, plural } from '../lib/util.js';

/* Which way a column wants to be read first. Money and dates are most useful
   biggest/newest first; words read A→Z. */
const COLUMNS = [
  { key: 'date', label: 'Date', dir: 'desc', cls: 'tkt' },
  { key: 'label', label: 'What for', dir: 'asc', cls: 'xt__what' },
  { key: 'category', label: 'Category', dir: 'asc' },
  { key: 'city', label: 'Where', dir: 'asc' },
  { key: 'amount', label: 'Amount', dir: 'desc', cls: 'xt__num' },
];

/* Which hue a category is drawn in. Categorical, never semantic: brass, rust
   and transit-blue mean something specific elsewhere in the app and must not
   be spent on "this is the food one". */
export const CATEGORY_ACCENT = {
  food: 'clay', transport: 'indigo', stay: 'plum', activity: 'cyan',
  shopping: 'magenta', fees: 'slate', other: 'sage',
};
export const categoryAccent = (c) => CATEGORY_ACCENT[c] || 'slate';

/* What the booking adds beyond the row's own label: its reference, and its
   name only when the traveller has renamed the expense to something else. */
function bookingSuffix(r) {
  const parts = [];
  if (r.booking.label && r.booking.label !== r.label) parts.push(r.booking.label);
  if (r.booking.ref) parts.push(`ref ${r.booking.ref}`);
  return parts.join(' · ');
}

/* One icon, rotated. The vendored set has no arrow-up/arrow-down pair, and
   adding two more glyphs to every build to say "this way up" is not worth
   the bytes when a transform says it exactly. */
function SortHead({ col, sort, dir, onSort }) {
  const on = sort === col.key;
  return html`
    <th scope="col" class=${col.cls || ''}
        aria-sort=${on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button class=${`xt__sort ${on ? 'xt__sort--on' : ''} ${on && dir === 'asc' ? 'xt__sort--up' : ''}`}
              onClick=${() => onSort(col.key)}
              aria-label=${`Sort by ${col.label}${
                on ? (dir === 'asc' ? ', largest first' : ', smallest first') : ''}`}>
        ${col.label}
        <${Icon} name=${on ? 'chevron-down' : 'chevrons-down-up'} />
      </button>
    </th>`;
}

export function ExpenseTable({ state, cityId = null, presetDate = null, title = 'Expenses' }) {
  const [sort, setSort] = useState('date');
  const [dir, setDir] = useState('desc');
  const home = state.trip.homeCurrency;

  const onSort = (key) => {
    if (key === sort) { setDir(dir === 'asc' ? 'desc' : 'asc'); return; }
    setSort(key);
    setDir(COLUMNS.find((c) => c.key === key)?.dir || 'asc');
  };

  const rows = D.expenseRows(state, { cityId, sort, dir });
  const total = D.rowsTotal(rows);

  const add = html`
    <button class="btn btn--primary hide-readonly"
            onClick=${() => A.quickExpense(presetDate, cityId)}>
      <${Icon} name="plus" /> Add expense
    </button>`;

  if (!rows.length) {
    return html`
      <div class="xt">
        <div class="xt__head">
          <h3 class="xt__title">${title}</h3>
          ${add}
        </div>
        <${Empty} icon="wallet" title="Nothing recorded yet"
          body=${cityId ? 'Expenses you tag with this stop show up here.'
                        : 'Amount and category are the only fields you must touch.'} />
      </div>`;
  }

  return html`
    <div class="xt">
      <div class="xt__head">
        <h3 class="xt__title">${title} <span class="xt__count">${plural(rows.length, 'line')}</span></h3>
        ${add}
      </div>

      ${/* The scroller is the element that overflows, never the page: a table
            that pushes the body sideways breaks every other screen too. */ ''}
      <div class="xt__scroll">
        <table class="xt__table">
          <caption class="visually-hidden">
            ${title}, sortable. Currently sorted by ${sort}, ${dir === 'asc' ? 'ascending' : 'descending'}.
          </caption>
          <thead>
            <tr>
              <th scope="col" class="xt__n"><span class="visually-hidden">Row</span>#</th>
              ${COLUMNS.map((c) => html`<${SortHead} key=${c.key} col=${c}
                                          sort=${sort} dir=${dir} onSort=${onSort} />`)}
              <th scope="col" class="xt__act"><span class="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => html`
              <tr key=${r.id}>
                <td class="xt__n" data-label="Row">${r.n}</td>
                <td class="tkt" data-label="Date">${r.date ? fmtDate(r.date) : '—'}</td>
                <td class="xt__what" data-label="What for">
                  <span class="xt__label">${r.label || '—'}</span>
                  ${/* Only what the label does not already say. Printing the
                        booking's own name under an identical label read as a
                        stutter: "Prague → Istanbul / Prague → Istanbul". */ ''}
                  ${r.booking && bookingSuffix(r) && html`
                    <span class="xt__from">
                      <${Icon} name=${r.booking.kind === 'stay' ? 'bed-double' : 'plane'} />
                      ${bookingSuffix(r)}
                    </span>`}
                  ${r.note && html`<span class="xt__note">${r.note}</span>`}
                </td>
                <td data-label="Category">
                  ${r.category
                    ? html`<span class="badge" data-accent=${categoryAccent(r.category)}>${titleCase(r.category)}</span>`
                    : html`<span class="faint">Uncategorised</span>`}
                </td>
                <td data-label="Where">${r.cityName || html`<span class="faint">—</span>`}</td>
                <td class="xt__num" data-label="Amount">
                  <${Money} amount=${r.share} currency=${home} digits=${2} />
                  ${r.splitBetween > 1 && html`
                    <span class="xt__split">your share of
                      <${Money} amount=${r.amount} currency=${home} digits=${2} /> ÷ ${r.splitBetween}</span>`}
                </td>
                <td class="xt__act" data-label="Actions">
                  <span class="xt__actions">
                    <button class="btn btn--ghost btn--icon hide-readonly"
                            onClick=${() => A.editExpense(r.id)}
                            aria-label=${`Edit expense: ${r.label || titleCase(r.category) || 'row'} ${r.n}`}>
                      <${Icon} name="pencil" />
                    </button>
                    <button class="btn btn--ghost btn--icon hide-readonly"
                            onClick=${() => A.deleteExpense(r.id)}
                            aria-label=${`Delete expense: ${r.label || titleCase(r.category) || 'row'} ${r.n}`}>
                      <${Icon} name="trash-2" />
                    </button>
                  </span>
                </td>
              </tr>`)}
          </tbody>
          ${/* The total belongs to the table, so it moves with any filter
                applied to it and can never disagree with the rows above. */ ''}
          <tfoot>
            <tr>
              <td class="xt__n"></td>
              <td colspan="3" data-label="Total">Total${cityId ? ' for this stop' : ''}</td>
              <td class="xt__num xt__total" data-label="Total">
                <${Money} amount=${total} currency=${home} digits=${2} />
              </td>
              <td class="xt__act"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
}
