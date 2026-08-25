import { html } from '../lib/html.js';
import { Icon } from '../lib/icons.js';
import { Money, Section, PageHead, Badge, Fold, Carousel } from '../ui/components.js';
import { Extra } from '../ui/parts.js';
import * as Store from '../state/store.js';
import * as D from '../state/derive.js';
import * as A from '../actions.js';
import { COLLECTIONS } from '../state/schema.js';
import { titleCase } from '../lib/util.js';

export function Data({ state }) {
  const t = state.trip;
  const me = D.primaryTraveler(state);
  const companions = state.travelers.filter((x) => x.role !== 'primary');
  const warnings = Store.getWarnings();
  const counts = COLLECTIONS.map((k) => ({ key: k, n: state[k].length })).filter((c) => c.n);
  const dated = D.datedItems(state).length;

  return html`
    <${PageHead} eyebrow="Export, import, settings" title="Trip data" />

    ${warnings.length > 0 && html`
      <section class="card" style="border-color:var(--rust)">
        <h2 class="card__title"><${Icon} name="triangle-alert" /> Data warnings</h2>
        <ul class="rows">
          ${warnings.map((w, i) => html`
            <li class="row" key=${i}><div class="row__body small">${w}</div></li>`)}
        </ul>
      </section>`}

    <${Section} title="Settings" icon="settings">
      <div class="card">
        <div class="datarow">
          <div class="datarow__text">
            <strong>Theme</strong>
            <p class="small muted">Chosen at intake, changeable any time.</p>
          </div>
          <div class="themetoggle hide-readonly" role="group" aria-label="Theme">
            <button onClick=${() => Store.setTheme('light')} aria-pressed=${String(t.theme !== 'dark')}>
              <${Icon} name="sun" /> Light
            </button>
            <button onClick=${() => Store.setTheme('dark')} aria-pressed=${String(t.theme === 'dark')}>
              <${Icon} name="moon" /> Dark
            </button>
          </div>
        </div>

        <div class="datarow" style="border-top:1px solid var(--line);padding-top:var(--space-3);margin-top:var(--space-3)">
          <div class="datarow__text">
            <strong>Trip</strong>
            <p class="small muted">
              ${t.budget
                ? html`Budget <${Money} amount=${t.budget} currency=${t.homeCurrency} />`
                : 'No budget set'} · home currency ${t.homeCurrency || '—'}
            </p>
          </div>
          <button class="btn hide-readonly" onClick=${A.editTrip}>
            <${Icon} name="pencil" /> Edit trip
          </button>
        </div>
      </div>
    <//>

    <${Section} title="Travellers" icon="compass" count=${state.travelers.length}>
      <div class="card card--flat"><div class="rows">
        ${me && html`
          <div class="row">
            <div class="row__body">
              <div class="row__title">
                ${me.nickname || 'You'} <${Badge} kind="done">primary<//>
              </div>
              <div class="row__meta small muted wrap-anywhere">
                ${me.email || 'no email'}${me.age ? ` · ${me.age}` : ''}
                ${me.personaProfiles?.length ? ` · ${me.personaProfiles.join(', ')}` : ''}
              </div>
            </div>
            <div class="row__side hide-readonly">
              <button class="btn btn--ghost" onClick=${A.editMe}
                      aria-label=${`Edit ${me.nickname || 'your details'}`}>Edit</button>
            </div>
          </div>`}
        ${companions.map((c) => html`
          <div class="row" key=${c.id}>
            <div class="row__body">
              <div class="row__title">${c.nickname || 'Companion'}</div>
              <div class="row__meta small muted wrap-anywhere">
                ${c.email || 'no email'}${c.age ? ` · ${c.age}` : ''} · companion
              </div>
            </div>
            <div class="row__side hide-readonly">
              <button class="btn btn--ghost" onClick=${() => A.editTraveler(c.id)}
                      aria-label=${`Edit ${c.nickname || 'this companion'}`}>Edit</button>
            </div>
          </div>`)}
      </div></div>
      <div class="hide-readonly" style="margin-top:var(--space-2)">
        <button class="btn btn--ghost" onClick=${A.addTraveler}>
          <${Icon} name="plus" /> Add a traveller
        </button>
      </div>
      <p class="small muted" style="margin-top:var(--space-2)">
        This trip shows the primary traveller's itinerary. A companion gets their own
        editable copy by importing your exported file.
      </p>
    <//>

    <${Section} title="Share and export" icon="share-2">
      <div class="grid grid--2">
        <div class="card">
          <h3 class="card__title"><${Icon} name="share-2" /> Read-only snapshot</h3>
          <p class="small muted">One HTML file a friend can open and browse. Nothing to set up,
          nothing they can change.</p>
          <p style="margin-top:var(--space-3)">
            <button class="btn" onClick=${A.downloadSnapshot}>
              <${Icon} name="download" /> Save snapshot
            </button>
          </p>
        </div>
        <div class="card">
          <h3 class="card__title"><${Icon} name="upload" /> Forkable copy</h3>
          <p class="small muted wrap-anywhere">
            Export <span class="tkt">${Store.exportName()}</span>. Whoever imports it gets their
            own independent Jugni for the same trip.
          </p>
          <p style="margin-top:var(--space-3)">
            <button class="btn btn--primary" onClick=${A.exportTrip}>
              <${Icon} name="download" /> Export trip file
            </button>
          </p>
        </div>
      </div>

      <div class="card datarow" style="margin-top:var(--space-3)">
        <div class="datarow__text">
          <strong>Import a Jugni file</strong>
          <p class="small muted">Replaces what's in this browser with the imported trip.
          Export first if you want to keep the current one.</p>
        </div>
        <button class="btn hide-readonly" onClick=${A.importTrip}>
          <${Icon} name="upload" /> Import
        </button>
      </div>

      <div class="card datarow" style="margin-top:var(--space-3)">
        <div class="datarow__text">
          <strong>Calendar reminders</strong>
          <p class="small muted">
            ${dated} dated items — departures, check-ins, cancellation deadlines and due dates —
            as an <span class="tkt">.ics</span> file your phone can remind you about.
          </p>
        </div>
        <button class="btn" onClick=${A.exportICS} disabled=${!dated}>
          <${Icon} name="download" /> Export .ics
        </button>
      </div>
    <//>

    ${/* C9: the guide is per-destination now. A genuinely trip-wide note — a
          visa rule covering the whole route, or research on a place that was
          considered and dropped — is the exception, so it lives here rather
          than cluttering every destination page. */ ''}
    ${state.extras.filter((x) => !x.cityId).length > 0 && html`
      <${Section} title="Trip-wide notes" icon="compass">
        <${Carousel} label="Trip-wide notes">
          ${state.extras.filter((x) => !x.cityId).map((x) => html`
            <${Extra} key=${x.id} extra=${x} />`)}
        <//>
      <//>`}

    ${D.sourceDocuments(state).length > 0 && html`
      <${Section} title="Where this came from" icon="file-text">
        <${Fold} id="data.sources" title="Source documents" icon="file-text"
                 count=${D.sourceDocuments(state).length} defaultOpen=${false}>
          <p class="small muted" style="margin-bottom:var(--space-3)">
            The files each booking was read from. Rarely needed — but at a check-in desk
            this is which email or download to open.
          </p>
          <div class="rows">
            ${D.sourceDocuments(state).map((doc) => html`
              <div class="row" key=${doc.file}>
                <${Icon} name="file-text" />
                <div class="row__body">
                  <div class="row__title small wrap-anywhere">${doc.file}</div>
                  <div class="row__meta small muted">
                    ${doc.records.map((r) => r.label).join(' · ')}
                  </div>
                </div>
              </div>`)}
          </div>
        <//>
      <//>`}

    <${Section} title="What's in this trip" icon="database">
      <div class="card card--flat"><div class="rows">
        ${counts.map((c) => html`
          <div class="row" key=${c.key}>
            <div class="row__body">${titleCase(c.key.replace(/([A-Z])/g, ' $1'))}</div>
            <div class="row__side tkt">${c.n}</div>
          </div>`)}
        <div class="row">
          <div class="row__body muted small">Schema version</div>
          <div class="row__side tkt small muted">${t.schemaVersion}</div>
        </div>
      </div></div>
    <//>

    <${Section} title="Start over" icon="refresh-cw">
      ${Store.hasBaked() && html`
        <div class="card datarow hide-readonly" style="border-color:var(--transit-blue);margin-bottom:var(--space-3)">
          <div class="datarow__text">
            <strong>Restore the trip built into this file</strong>
            <p class="small muted">
              This file carries a copy of the trip as it was generated. Use this if you
              cleared the app by accident, or want to discard everything since the build.
            </p>
          </div>
          <button class="btn btn--primary" onClick=${A.restoreBuilt}>
            <${Icon} name="undo-2" /> Restore
          </button>
        </div>`}

      <div class="card datarow hide-readonly">
        <div class="datarow__text">
          <strong>Reset to the trip as built</strong>
          <p class="small muted">
            Discards changes made in this browser and restores the trip exactly as it was
            generated. The usual way back if something gets into a mess.
          </p>
        </div>
        <button class="btn btn--danger" onClick=${A.resetToBuilt}>
          <${Icon} name="undo-2" /> Reset
        </button>
      </div>

      <div class="card datarow hide-readonly" style="border-color:var(--rust);margin-top:var(--space-3)">
        <div class="datarow__text">
          <strong>Clear everything</strong>
          <p class="small muted">
            Empties this browser copy completely. Nothing is restored — use Reset above
            unless you genuinely want an empty app.
          </p>
        </div>
        <button class="btn btn--solid-danger" onClick=${A.clearEverything}>
          <${Icon} name="trash-2" /> Clear everything
        </button>
      </div>
    <//>`;
}
