import { html } from '../lib/html.js';
import { Icon } from '../lib/icons.js';
import * as D from '../state/derive.js';
import { plural } from '../lib/util.js';

/* Each screen owns a categorical hue (feedback F1). It is identity, not
   meaning — it never lands on a control that does something. */
export const SCREENS = [
  /* Today took `brass` in cycle 01 — a SEMANTIC colour meaning done/progress,
     which contradicted the two-palette rule that cycle set. Every screen's
     accent must be categorical (feedback cycle 02, C1). */
  { id: 'today',        label: 'Today',        icon: 'calendar-days', accent: 'clay' },
  { id: 'overview',     label: 'Route',        icon: 'route',         accent: 'indigo' },
  { id: 'checklist',    label: 'Checklist',    icon: 'list-checks',   accent: 'teal' },
  { id: 'destinations', label: 'Destinations', icon: 'map-pin',       accent: 'plum' },
  { id: 'expenses',     label: 'Expenses',     icon: 'wallet',        accent: 'moss' },
  { id: 'weather',      label: 'Weather',      icon: 'cloud-sun',     accent: 'cyan' },
  { id: 'recap',        label: 'Recap',        icon: 'chart-column',  accent: 'slate' },
];

export const screenFor = (name) => SCREENS.find((s) => s.id === name);
export const accentFor = (name) =>
  name === 'data' ? 'sage' : (screenFor(name)?.accent || 'brass');

export function Rail({ active, state, onShare }) {
  const stats = D.checklistStats(state);
  const counts = {
    checklist: stats.open || '',
    destinations: state.cities.length || '',
    expenses: state.expenses.length || '',
  };

  return html`<nav class="rail" aria-label="Trip sections">
    <div class="rail__brand">
      ${D.ownerPossessive(state) && html`
        <span class="rail__owner">${D.ownerPossessive(state)}</span>`}
      <span class="rail__wordmark">Jugni</span>
    </div>
    <p class="rail__tripname">
      ${state.trip.name || 'Untitled trip'}
      ${state.trip.startDate && html`<br /><span class="tkt">${
        D.totalDays(state) ? plural(D.totalDays(state), 'day') : ''}</span>`}
    </p>

    <div class="rail__nav">
      ${SCREENS.map((item) => html`
        <a class="navstub" href=${`#/${item.id}`} data-accent=${item.accent}
           key=${item.id} aria-current=${active === item.id ? 'page' : undefined}>
          <${Icon} name=${item.icon} />
          <span class="navstub__label">${item.label}</span>
          ${counts[item.id] && html`<span class="navstub__count">${counts[item.id]}</span>`}
        </a>`)}
    </div>

    <${Thread} state=${state} />

    <div class="rail__foot">
      <button class="navstub hide-readonly" data-accent="brass" onClick=${onShare}>
        <${Icon} name="share-2" /><span class="navstub__label">Share</span>
      </button>
      <a class="navstub" href="#/data" data-accent="sage"
         aria-current=${active === 'data' ? 'page' : undefined}>
        <${Icon} name="database" /><span class="navstub__label">Trip data</span>
      </a>
    </div>
  </nav>`;
}

/* The manifest thread in miniature: how far along the route today is. */
function Thread({ state }) {
  const { startDate, endDate } = state.trip;
  if (!startDate || !endDate) return null;

  const total = D.totalDays(state);
  const dayN = D.dayNumber(state);
  const p = D.phase(state);
  const percent = p === 'before' ? 0 : p === 'after' ? 100 : Math.round((dayN / total) * 100);
  const label = p === 'before' ? `in ${D.daysUntilStart(state)}d`
    : p === 'after' ? 'complete'
    : `day ${dayN}/${total}`;

  return html`<div class="rail__thread" aria-hidden="true">
    <span class="rail__thread-line">
      <span class="rail__thread-fill" style=${`width:${percent}%`}></span>
      ${p === 'during' && html`<span class="rail__thread-dot" style=${`left:${percent}%`}></span>`}
    </span>
    <span class="rail__thread-label">${label}</span>
  </div>`;
}
