import { html } from '../lib/html.js';
import { Icon, Flag } from '../lib/icons.js';
import { Stat, Money, Meter, Empty, Section, PageHead, Stamp, Fold, CopyButton } from '../ui/components.js';
import { TaskRow, LegCard, AlertBlock } from '../ui/parts.js';
import { useState, useEffect, useAsync } from '../ui/hooks.js';
import * as D from '../state/derive.js';
import * as A from '../actions.js';
import { hasBaked } from '../state/store.js';
import * as Weather from '../data/weather.js';
import { todayISO, addDays, fmtDateLong, fmtDateMed, fmtDate, fmtRange,
         dayDiff, toDate, day, sortBy, groupBy } from '../lib/util.js';

const HORIZON_DAYS = 14;

/* `#/today/2026-09-18` — a specific day, as linked from the Route screen's
   by-day lens. Anything else in the slot is ignored rather than trusted. */
const asDate = (p) => (/^\d{4}-\d{2}-\d{2}$/.test(p || '') ? p : null);

export function Today({ state, param }) {
  /* Opens on the real today unless a date was asked for by name; the strip
     only changes what is being looked at (spec §12). */
  const [viewDate, setViewDate] = useState(() => asDate(param) || todayISO());
  const { startDate } = state.trip;

  /* The route name does not change between #/today and #/today/<date>, so the
     screen is never remounted and the initialiser above runs only once. This
     is what actually moves the view when a day row is opened. */
  useEffect(() => {
    const wanted = asDate(param);
    if (wanted) setViewDate(wanted);
  }, [param]);

  if (D.phase(state) === 'planning') {
    return html`
      <${PageHead} eyebrow="Getting started" title="Your trip" />
      <${Empty} icon="compass" title="No trip loaded yet"
        body=${hasBaked()
          ? 'This file has a trip built into it — you can put it straight back.'
          : 'Import a Jugni file, or ask Claude to build this app from your own raw travel data.'}>
        ${hasBaked()
          ? html`<button class="btn btn--primary btn--lg" onClick=${A.restoreBuilt}>
              <${Icon} name="undo-2" /> Restore the trip built into this file
            </button>`
          : html`<a class="btn btn--primary" href="#/data">Import a trip file</a>`}
      <//>`;
  }

  /* C2: this used to compare against today rather than the trip's start, so
     picking any date before departure fell through to the day view and
     reported "Outside the trip dates". Before the trip starts, every date
     shows the countdown; from the start date on, each shows its own day. */
  const beforeDeparture = startDate && day(viewDate) < day(startDate);

  return html`
    <${PageHead} eyebrow=${fmtDateMed(viewDate)}
                 title=${beforeDeparture ? 'Upcoming'
                   : D.phase(state) === 'after' ? 'Trip complete' : 'Today'} />

    <${DateStrip} state=${state} viewDate=${viewDate} onPick=${setViewDate} />

    ${beforeDeparture
      ? html`<${Upcoming} state=${state} viewDate=${viewDate} />`
      : html`<${DayView} state=${state} viewDate=${viewDate} />`}

    <button class="btn btn--primary quickcap hide-readonly" onClick=${() => A.quickExpense(viewDate)}>
      <${Icon} name="plus" /> Log spend
    </button>`;
}

function DateStrip({ state, viewDate, onPick }) {
  const today = todayISO();
  const { startDate, endDate } = state.trip;
  const days = Array.from({ length: 9 }, (_, i) => addDays(viewDate, i - 4));

  return html`
    <div class="card card--flat" style="margin-bottom:var(--space-5)">
      <div class="datestrip">
        <button class="btn btn--ghost btn--icon" onClick=${() => onPick(addDays(viewDate, -7))}
                aria-label="Previous week"><${Icon} name="chevron-left" /></button>

        <div class="datestrip__track">
          ${days.map((d) => {
            const outside = startDate && endDate && (day(d) < day(startDate) || day(d) > day(endDate));
            const busy = D.legsOn(state, d).length || D.dueOn(state, d).length;
            return html`
              <button class=${`dpill ${d === today ? 'dpill--today' : ''} ${outside ? 'dpill--outside' : ''}`}
                      key=${d} aria-current=${d === viewDate ? 'date' : undefined}
                      onClick=${() => onPick(d)}>
                <span class="dpill__d">${toDate(d)?.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span class="dpill__n">${toDate(d)?.getDate()}</span>
                ${busy ? html`<span class="dpill__dot"></span>` : html`<span style="height:4px"></span>`}
              </button>`;
          })}
        </div>

        <button class="btn btn--ghost btn--icon" onClick=${() => onPick(addDays(viewDate, 7))}
                aria-label="Next week"><${Icon} name="chevron-right" /></button>

        <input class="input" type="date" value=${viewDate} style="width:auto"
               aria-label="Jump to a date" onInput=${(e) => e.target.value && onPick(e.target.value)} />
        ${viewDate !== today && html`<button class="btn" onClick=${() => onPick(today)}>Today</button>`}
      </div>
    </div>`;
}

/* ---------- Before departure ---------- */

function Upcoming({ state, viewDate }) {
  /* Always counted from the real today. Browsing back to last week should not
     inflate "departs in" — the traveller wants the stable answer. */
  const days = dayDiff(todayISO(), state.trip.startDate);
  const first = D.citiesInOrder(state)[0];
  const leg = D.nextLeg(state, state.trip.startDate);
  const late = D.overdue(state);
  const stats = D.checklistStats(state);
  const isToday = viewDate === todayISO();

  return html`
    <section class="card card--accent">
      <div class="today__hero">
        <div>
          <span class="eyebrow eyebrow--accent">Departs in</span>
          <p class="today__city">
            <span class="tkt">${days}</span>
            <span style="font-size:var(--step-1);align-self:flex-end;padding-bottom:.35em">days</span>
          </p>
          <p class="today__day">
            ${fmtDateLong(state.trip.startDate)}
            ${first && html` · first stop <${Flag} city=${first} /> ${first.name}`}
          </p>
        </div>
        <div style="min-width:190px">
          <${Stat} label="Checklist" value=${`${stats.done}/${stats.total}`}
                   note=${`${stats.open} still open`} />
          <div style="margin-top:var(--space-2)"><${Meter} value=${stats.done} max=${stats.total} /></div>
        </div>
      </div>
    </section>

    ${late.length > 0 && html`<${Section}><${AlertBlock} items=${late} /><//>`}
    ${leg && html`<${Section}><${LegCard} leg=${leg} eyebrow="First leg" /><//>`}
    <${UpcomingByDay} state=${state} from=${viewDate} />`;
}

/* ---------- A specific day ---------- */

function DayView({ state, viewDate }) {
  const isToday = viewDate === todayISO();
  const city = D.cityOn(state, viewDate);
  const stay = D.stayOn(state, viewDate);
  const legs = D.legsOn(state, viewDate);
  /* Departure day sits before the first stop's arrival date, so there is no
     city to name. "In transit" beats an em dash. */
  const transit = !city && legs.length ? legs[0] : null;
  const next = D.nextLeg(state, viewDate);
  const late = isToday ? D.overdue(state) : [];
  const dayN = D.dayNumber(state, viewDate);
  const total = D.totalDays(state);
  const extras = D.extrasForDate(state, viewDate);

  const spentThatDay = state.expenses
    .filter((e) => day(e.date) === viewDate)
    .reduce((sum, e) => sum + (e.homeAmount || 0), 0);
  const budget = D.budgetState(state);

  return html`
    <section class="card card--accent">
      <div class="today__hero">
        <div style="min-width:0">
          <span class="eyebrow eyebrow--accent">
            ${transit ? 'In transit' : isToday ? 'You are in' : 'On this day'}
          </span>
          <p class="today__city">
            ${city
              ? html`<${Flag} city=${city} size="1em" /><span class="truncate">${city.name}</span>`
              : transit
                ? html`<span class="truncate" style="font-size:var(--step-2)">${transit.from} → ${transit.to}</span>`
                : '—'}
          </p>
          <p class="today__day tkt">
            ${dayN >= 1 && dayN <= total ? `Day ${dayN} of ${total}` : 'After the trip'}
          </p>
        </div>
        <${TodayWeather} city=${city} viewDate=${viewDate} />
      </div>

      ${stay && html`
        <div class="row" style="border-top:1px solid var(--line);border-bottom:0;margin-top:var(--space-4);padding-top:var(--space-3)">
          <${Icon} name="bed-double" />
          <div class="row__body">
            <strong>${stay.name}</strong>
            <div class="row__meta small muted">
              ${stay.address && html`
                <span class="copyrow"><span class="truncate">${stay.address}</span>
                  <${CopyButton} value=${stay.address} label="address" /></span>`}
              <span class="tkt">${fmtRange(stay.checkIn, stay.checkOut)}</span>
              ${stay.confirmationNumber && html`
                <span class="copyrow tkt">ref ${stay.confirmationNumber}
                  <${CopyButton} value=${stay.confirmationNumber} label="confirmation number" /></span>`}
            </div>
          </div>
        </div>`}
    </section>

    ${late.length > 0 && html`<${Section}><${AlertBlock} items=${late} /><//>`}

    ${legs.length
      ? legs.map((l) => html`<${Section} key=${l.id}><${LegCard} leg=${l} eyebrow="Departing" /><//>`)
      : next && html`<${Section}><${LegCard} leg=${next}
          eyebrow=${`Next leg · ${fmtDate(next.departDateTime)}`} /><//>`}

    <${UpcomingByDay} state=${state} from=${viewDate} />

    ${extras.length > 0 && html`
      <${Section} title="Worth knowing here" icon="sparkles"
        actions=${html`<a class="btn btn--ghost" href=${`#/destinations/${city.id}`}>
          Full guide <${Icon} name="arrow-right" /></a>`}>
        <div class="grid grid--2">
          ${extras.slice(0, 2).map((x) => html`
            <article class="card notecard" key=${x.id}>
              <h3 class="card__title">${x.title}</h3>
              <p class="small note-body">${String(x.content).split('\n')[0]}</p>
              <div class="notecard__foot hide-readonly">
                <button class="btn btn--ghost" onClick=${() => A.extraToTask(x.id)}>
                  <${Icon} name="plus" /> Make it a task
                </button>
              </div>
            </article>`)}
        </div>
      <//>`}

    <${Section} title="Spending" icon="wallet"
      actions=${html`<a class="btn btn--ghost" href="#/expenses">
        All expenses <${Icon} name="arrow-right" /></a>`}>
      <div class="card">
        <div class="statbar statbar--divided">
          <${Stat} label=${isToday ? 'Today' : 'That day'}
                   value=${html`<${Money} amount=${spentThatDay} currency=${state.trip.homeCurrency} />`} />
          <${Stat} label="Trip so far"
                   value=${html`<${Money} amount=${budget.spent} currency=${state.trip.homeCurrency} />`} />
          <${Stat} label=${budget.over ? 'Over budget' : 'Budget left'}
                   modifier=${budget.over ? 'stat--over' : ''}
                   value=${html`<${Money} amount=${Math.abs(budget.left)} currency=${state.trip.homeCurrency} />`} />
        </div>
      </div>
    <//>`;
}

/* ---------- C6: tasks grouped by the day they are due ----------
   A flat fourteen-day list buried what mattered now. Grouped by day, one
   collapsible per day, days with nothing are not rendered at all, and the
   window re-anchors whenever the selected date changes. */
function UpcomingByDay({ state, from }) {
  const today = todayISO();
  const horizonEnd = addDays(from, HORIZON_DAYS);

  const upcoming = state.checklist.filter((c) => {
    if (c.done || !c.dueDate) return false;
    const d = day(c.dueDate);
    return d >= day(from) && d <= day(horizonEnd);
  });

  /* Overdue stays out of the folds entirely: cycle 01 ruled that a section
     hiding the one urgent thing is worse than a long page. */
  const late = state.checklist.filter((c) => !c.done && c.dueDate && day(c.dueDate) < day(from));

  if (!upcoming.length && !late.length) {
    return html`
      <${Section} title="What's due" icon="list-checks"
        actions=${html`<a class="btn btn--ghost" href="#/checklist">
          All tasks <${Icon} name="arrow-right" /></a>`}>
        <${Empty} icon="circle-check" title="Nothing due"
                  body=${`No tasks in the next ${HORIZON_DAYS} days.`} />
      <//>`;
  }

  const byDay = groupBy(upcoming, (c) => day(c.dueDate));
  const dates = Object.keys(byDay).sort();

  return html`
    <${Section} title="What's due" icon="list-checks" count=${upcoming.length + late.length}
      actions=${html`<a class="btn btn--ghost" href="#/checklist">
        All tasks <${Icon} name="arrow-right" /></a>`}>

      ${late.length > 0 && html`
        <div class="card" style="border-color:var(--rust);background:var(--rust-wash);margin-bottom:var(--space-3)">
          <h3 class="card__title" style="color:var(--rust);margin-bottom:var(--space-2)">
            <${Icon} name="triangle-alert" /> Overdue (${late.length})
          </h3>
          <div class="rows">
            ${sortBy(late, (c) => c.dueDate).map((t) => html`
              <${TaskRow} key=${t.id} item=${t} state=${state} leavesView />`)}
          </div>
        </div>`}

      ${dates.map((d, i) => html`
        <${Fold} key=${d} id=${`due.${d}`} title=${dayLabel(d, today)}
                 icon="calendar-days" count=${byDay[d].length}
                 defaultOpen=${i === 0}>
          <div class="rows">
            ${byDay[d].map((t) => html`<${TaskRow} key=${t.id} item=${t} state=${state} leavesView />`)}
          </div>
        <//>`)}
    <//>`;
}

/* Labels are relative to the real today, not to whatever date is being
   browsed: calling the 4th "Today" while standing on the 2nd would be a
   plain untruth, and the page header already states which day is in view. */
function dayLabel(iso, today) {
  const delta = dayDiff(today, iso);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  return fmtDateMed(iso);
}

function TodayWeather({ city, viewDate }) {
  const { result } = useAsync(() => (city ? Weather.forCity(city) : null), [city?.id]);
  if (!city) return null;
  if (!result) return html`<div class="widget" style="min-width:190px"><p class="small muted">loading weather…</p></div>`;
  if (!result.data) return html`<div class="widget" style="min-width:190px"><${Stamp} result=${result} /></div>`;

  const fc = (result.data.days || []).find((d) => d.date === viewDate);
  const cur = viewDate === todayISO() ? result.data.current : null;
  const [text, emoji] = Weather.describe(cur ? cur.weather_code : fc?.code ?? -1);

  return html`
    <div class="widget" style="min-width:190px" aria-live="polite">
      <div class="widget__head">
        <span class="eyebrow">${city.name}</span>
        <a class="small" href="#/weather">forecast →</a>
      </div>
      <p style="font-size:var(--step-2);line-height:1.15">
        ${emoji} <span class="tkt">${cur ? `${Math.round(cur.temperature_2m)}°` : fc ? `${Math.round(fc.max)}°` : '—'}</span>
      </p>
      <p class="small muted">
        ${text}
        ${fc && html` · <span class="tkt">${Math.round(fc.min)}–${Math.round(fc.max)}°</span>`}
        ${fc?.rain >= Weather.RAIN_THRESHOLD && html` · ${fc.rain}% rain`}
      </p>
      <${Stamp} result=${result} />
    </div>`;
}
