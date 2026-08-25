/* Pieces used by more than one screen. */
import { html } from '../lib/html.js';
import { Icon, Flag, modeIcon } from '../lib/icons.js';
import { HomeMoney, Badge, CopyButton } from './components.js';
import { useState, usePrefersReducedMotion } from './hooks.js';
import * as A from '../actions.js';
import * as D from '../state/derive.js';
import { getState } from '../state/store.js';
import { fmtDate, fmtLocalDateTime, fmtLocalTime, tzLabel, duration, todayISO, day, titleCase, inRange } from '../lib/util.js';
import * as Weather from '../data/weather.js';

/* A checklist row.

   F2: ticking used to destroy the node instantly, so nothing was visible. Now
   the row shows as checked, holds long enough to register, then collapses out
   — and the store is only written once that has happened. Reduced motion
   shortens the hold rather than removing the feedback. */
export function TaskRow({ item, state, leavesView = false, showCity = true }) {
  const [leaving, setLeaving] = useState(false);
  const reduced = usePrefersReducedMotion();
  const checked = leaving ? true : item.done;
  const late = !checked && item.dueDate && day(item.dueDate) < todayISO();
  const cat = A.categoryById(item.category);
  const city = showCity && item.cityId ? D.cityName(state, item.cityId) : '';

  const onToggle = () => {
    if (leaving) return;
    if (!item.done && leavesView) {
      setLeaving(true);
      setTimeout(() => A.toggleTask(item.id), reduced ? 220 : 820);
    } else {
      A.toggleTask(item.id);
    }
  };

  return html`
    <div class=${`row ${checked ? 'row--done' : ''} ${leaving ? 'row--leaving' : ''}`}
         data-accent=${cat.accent}>
      <button class="check hide-readonly" role="checkbox" aria-checked=${String(checked)}
              onClick=${onToggle} aria-label=${item.task}>
        <${Icon} name="check" />
      </button>

      <div class="row__body">
        <div class="row__title">${item.task}</div>
        <div class="row__meta small">
          <${Badge} kind="cat">
            <${Icon} name=${cat.icon} />${cat.label}
          <//>
          ${city && html`<span class="muted">${city}</span>`}
          ${item.dueDate && html`<span class=${`tkt ${late ? '' : 'muted'}`}
            style=${late ? 'color:var(--rust);font-weight:600' : ''}>
            ${late ? 'overdue · ' : 'due '}${fmtDate(item.dueDate)}
          </span>`}
          ${checked && item.completedDate && html`
            <span class="muted tkt">done ${fmtDate(item.completedDate)}</span>`}
          ${item.source === 'default' && html`<span class="badge">standard</span>`}
        </div>
        ${item.note && html`<p class="small faint" style="margin-top:2px">${item.note}</p>`}
      </div>

      <div class="row__side">
        ${item.dueDate && !checked && html`
          <button class="btn btn--ghost btn--icon" onClick=${() => A.taskToCalendar(item.id)}
                  aria-label=${`Add "${item.task}" to your calendar`}
                  title="Add to calendar">
            <${Icon} name="calendar-days" />
          </button>`}
        <button class="btn btn--ghost btn--icon hide-readonly" onClick=${() => A.editTask(item.id)}
                aria-label=${`Edit ${item.task}`}>
          <${Icon} name="pencil" />
        </button>
      </div>
    </div>`;
}


/* A transit leg as departure-board data. */
export function LegCard({ leg, eyebrow }) {
  const tz = tzLabel(leg.departDateTime);
  const dur = duration(leg.departDateTime, leg.arriveDateTime);
  return html`
    <div class="stub stub--now">
      <div class="widget__head" style="margin-bottom:var(--space-3)">
        <span class="eyebrow">${eyebrow || 'Next leg'}</span>
        ${leg.bookingRef && html`
          <span class="copyrow">
            <${Badge}>ref ${leg.bookingRef}<//>
            <${CopyButton} value=${leg.bookingRef} label=${`booking reference ${leg.bookingRef}`} />
          </span>`}
      </div>
      <div class="next-leg">
        <span class="next-leg__pt">
          <span class="next-leg__place">${leg.from || '—'}</span>
          <span class="next-leg__time tkt">
            ${fmtLocalDateTime(leg.departDateTime)}${tz && html` <span class="faint">${tz}</span>`}
          </span>
        </span>
        <span class="next-leg__mid">
          <${Icon} name=${modeIcon(leg.mode)} />
          <span class="next-leg__rule"></span>
          ${dur && html`<span class="next-leg__dur">${dur}</span>`}
        </span>
        <span class="next-leg__pt next-leg__pt--to">
          <span class="next-leg__place">${leg.to || '—'}</span>
          <span class="next-leg__time tkt">${fmtLocalTime(leg.arriveDateTime) || '—'}</span>
        </span>
      </div>
      ${leg.notes && html`<p class="small muted wrap-anywhere" style="margin-top:var(--space-3)">${leg.notes}</p>`}
    </div>`;
}

export function LegLine({ leg, boxed }) {
  const inner = html`
    <div class="leg" style=${boxed ? 'margin:0' : ''}>
      <span class="leg__mode"><${Icon} name=${modeIcon(leg.mode)} />${titleCase(leg.mode || 'travel')}</span>
      <span class="leg__time">${leg.from || '?'} → ${leg.to || '?'}</span>
      <span class="leg__time faint">
        ${fmtLocalDateTime(leg.departDateTime)}${leg.arriveDateTime ? ` – ${fmtLocalTime(leg.arriveDateTime)}` : ''}
      </span>
      ${leg.bookingRef && html`
        <span class="copyrow">
          <${Badge}>ref ${leg.bookingRef}<//>
          <${CopyButton} value=${leg.bookingRef} label=${`booking reference ${leg.bookingRef}`} />
        </span>`}
      ${leg.cost > 0
        ? html`<${HomeMoney} amount=${leg.cost} currency=${leg.currency}
                      home=${getState().trip.homeCurrency}
                      snapshotHome=${leg.homeAmount}
                      hints=${getState().trip.rateHints} class="leg__time" />`
        : (D.isPriced(leg) || D.coveredByBooking(getState(), leg)) && html`
            <span class="leg__time faint">included</span>`}
    </div>`;
  return boxed ? html`<div class="card card--flat" style="margin-bottom:var(--space-2)">${inner}</div>` : inner;
}

export function AlertBlock({ items }) {
  return html`
    <div class="card" style="border-color:var(--rust);background:var(--rust-wash)">
      <div class="row" style="border:0;padding:0">
        <${Icon} name="triangle-alert" style="color:var(--rust)" />
        <div class="row__body">
          <strong>${items.length} overdue ${items.length === 1 ? 'task' : 'tasks'}</strong>
          <div class="small">
            ${items.slice(0, 3).map((o) => o.task).join(' · ')}${items.length > 3 ? ' …' : ''}
          </div>
        </div>
        <a class="btn" href="#/checklist">Open</a>
      </div>
    </div>`;
}

export const CityTitle = ({ city, size }) => html`
  <span class="stop__city">
    <${Flag} city=${city} size=${size} />
    <span class="truncate">${city.name}</span>
    ${city.country && html`<span class="stop__country">${city.country}</span>`}
  </span>`;


/* One day of forecast. Lives here rather than on a screen because both the
   Weather screen and every destination page render it. */
export function ForecastDay({ d, city }) {
  const [text, emoji] = Weather.describe(d.code);
  const inTrip = city && inRange(d.date, city.arriveDate, city.departDate || city.arriveDate);
  const date = new Date(`${d.date}T00:00:00`);
  return html`
    <div class=${`fc-day ${inTrip ? 'fc-day--intrip' : ''}`}>
      <div class="fc-day__d">${date.toLocaleDateString(undefined, { weekday: 'short' })}</div>
      <div class="fc-day__d tkt">${date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</div>
      <div class="fc-day__ico" title=${text}>${emoji}</div>
      <div class="fc-day__t"><b>${Math.round(d.max)}°</b> ${Math.round(d.min)}°</div>
      <div class="fc-day__rain">${d.rain >= 20 ? `${d.rain}%` : ''}</div>
    </div>`;
}

/* An `extras` record, rendered through its displayHint (spec §4) so unmodeled
   data still looks native rather than a dumped text block.

   Cycle 01 F13: every extra offers something to DO — links the Convert Skill
   found, and a one-tap "make it a task". A fact you can act on is not a dead
   end. */
export function Extra({ extra }) {
  const hint = !extra.displayHint || extra.displayHint === 'auto'
    ? inferHint(extra.content) : extra.displayHint;
  const lines = String(extra.content || '').split(/\r?\n/).filter(Boolean);

  let body;
  if (hint === 'list') {
    body = html`<ul class="rows">
      ${lines.map((l, i) => html`
        <li class="row" key=${i}><div class="row__body small">${l.replace(/^[-*•]\s*/, '')}</div></li>`)}
    </ul>`;
  } else if (hint === 'table') {
    body = html`<div class="scroll-x"><table class="table"><tbody>
      ${lines.map((l, i) => {
        const cells = l.split(/\s*[:|]\s*/);
        return html`<tr key=${i}>
          ${cells.map((c, j) => (j === 0
            ? html`<th scope="row" key=${j}>${c}</th>`
            : html`<td key=${j}>${c}</td>`))}
        </tr>`;
      })}
    </tbody></table></div>`;
  } else if (hint === 'link') {
    const url = String(extra.content).trim();
    body = html`<a class="btn" href=${url} target="_blank" rel="noopener noreferrer">
      ${url.replace(/^https?:\/\//, '').slice(0, 44)} <${Icon} name="external-link" />
    </a>`;
  } else {
    body = html`<p class="note-body small">${extra.content}</p>`;
  }

  const links = Array.isArray(extra.links) ? extra.links : [];

  return html`
    <article class="card notecard">
      <h3 class="card__title">${extra.title}</h3>
      ${body}
      <div class="notecard__foot">
        ${links.length > 0 && html`
          <div class="linkrow">
            ${links.map((l, i) => html`
              <a class="btn btn--ghost" key=${i} href=${l.url} target="_blank" rel="noopener noreferrer">
                <${Icon} name="external-link" /> ${l.label || 'Open'}
              </a>`)}
          </div>`}
        <button class="btn btn--ghost hide-readonly" onClick=${() => A.extraToTask(extra.id)}>
          <${Icon} name="plus" /> Make it a task
        </button>
      </div>
    </article>`;
}

function inferHint(content) {
  const s = String(content || '').trim();
  if (/^https?:\/\/\S+$/.test(s)) return 'link';
  const lines = s.split(/\r?\n/).filter(Boolean);
  if (lines.length > 1 && lines.every((l) => /^[^:|]+[:|]/.test(l))) return 'table';
  if (lines.length > 1) return 'list';
  return 'text';
}
