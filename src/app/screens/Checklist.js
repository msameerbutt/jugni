import { html } from '../lib/html.js';
import { Icon } from '../lib/icons.js';
import { Meter, Empty, Section, PageHead } from '../ui/components.js';
import { TaskRow } from '../ui/parts.js';
import { useState, useAsync } from '../ui/hooks.js';
import * as D from '../state/derive.js';
import * as A from '../actions.js';
import * as Weather from '../data/weather.js';
import { groupBy, sortBy, todayISO, day, plural } from '../lib/util.js';

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
];

export function Checklist({ state }) {
  const [filter, setFilter] = useState('open');
  const today = todayISO();
  const stats = D.checklistStats(state);

  const counts = {
    all: state.checklist.length,
    open: stats.open,
    overdue: D.overdue(state).length,
    done: stats.done,
  };

  const shown = sortBy(state.checklist.filter((c) => {
    if (filter === 'open') return !c.done;
    if (filter === 'done') return c.done;
    if (filter === 'overdue') return !c.done && c.dueDate && day(c.dueDate) < today;
    return true;
  }), (c) => c.dueDate || '9999');

  /* Grouped by category: a packing list and a visa task are different kinds
     of work, and reading them interleaved helps nobody. */
  const groups = groupBy(shown, (c) => c.category || 'general');
  const order = A.categories().map((c) => c.id)
    .filter((id) => groups[id])
    .concat(Object.keys(groups).filter((id) => !A.categories().some((c) => c.id === id)));

  return html`
    <${PageHead} eyebrow=${`${stats.done} of ${stats.total} done`} title="Checklist"
      actions=${html`
        <button class="btn btn--primary" onClick=${() => A.addTask()}>
          <${Icon} name="plus" /> Add task
        </button>
        <button class="btn" onClick=${A.exportICS}><${Icon} name="download" /> Calendar</button>`} />

    <section class="card">
      <div class="widget">
        <${Meter} value=${stats.done} max=${stats.total} large />
        <div class="chiprow">
          ${FILTERS.map((f) => html`
            <button class="chip" key=${f.id} aria-pressed=${String(filter === f.id)}
                    onClick=${() => setFilter(f.id)}>
              ${f.label} <span class="chip__n">${counts[f.id]}</span>
            </button>`)}
        </div>
      </div>
    </section>

    ${shown.length === 0
      ? html`<${Section}><${Empty} icon="circle-check"
          title=${filter === 'open' ? 'Everything is done' : 'Nothing here'}
          body=${filter === 'open' ? 'Nothing left on the list.' : 'No tasks match this filter.'} /><//>`
      : order.map((catId) => {
          const cat = A.categoryById(catId);
          return html`
            <${Section} key=${catId} title=${cat.label} icon=${cat.icon} count=${groups[catId].length}
              actions=${html`
                <button class="btn btn--ghost hide-readonly" onClick=${() => A.addTask()}
                        aria-label=${`Add a task in ${cat.label}`}>
                  <${Icon} name="plus" />
                </button>`}>
              <div class="card card--flat" data-accent=${cat.accent}>
                <div class="rows">
                  ${groups[catId].map((item) => html`
                    <${TaskRow} key=${item.id} item=${item} state=${state}
                                leavesView=${filter === 'open' || filter === 'overdue'} />`)}
                </div>
              </div>
              ${catId === 'packing' && html`<${PackingNudge} state=${state} items=${groups[catId]} />`}
            <//>`;
        })}`;
}

/* Weather-informed packing (spec §12): a display-time join between the packing
   items and the live forecast for the cities they belong to. Nothing stored. */
function PackingNudge({ state, items }) {
  const cityIds = [...new Set(items.filter((i) => !i.done && i.cityId).map((i) => i.cityId))];
  const { result } = useAsync(
    () => Promise.all(cityIds.map(async (id) => {
      const city = D.cityById(state, id);
      if (!city) return null;
      const wx = await Weather.forCity(city);
      if (!wx.data) return null;
      return {
        city,
        rainy: Weather.rainyDays(wx.data, city.arriveDate, city.departDate),
        cold: Weather.coldDays(wx.data, city.arriveDate, city.departDate),
      };
    })),
    [cityIds.join(',')], []);

  const hits = (result || []).filter((r) => r && (r.rainy.length || r.cold.length));
  if (!hits.length) return null;

  return html`
    <div style="margin-top:var(--space-2);display:flex;flex-direction:column;gap:var(--space-2)">
      ${hits.map(({ city, rainy, cold }) => {
        const bits = [];
        if (rainy.length) {
          bits.push(`${plural(rainy.length, 'day')} with ${Math.max(...rainy.map((d) => d.rain))}% rain`);
        }
        if (cold.length) bits.push(`lows to ${Math.round(Math.min(...cold.map((d) => d.min)))}°`);
        return html`
          <p class="nudge" key=${city.id}>
            <${Icon} name="cloud-sun" />
            <span><strong>${city.name}</strong> forecast: ${bits.join(', ')} while you're there.</span>
          </p>`;
      })}
    </div>`;
}
