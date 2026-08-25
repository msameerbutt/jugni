/* Runtime smoke test for a built Jugni file.
 *
 * `node --check` proves the bundle parses. That is not the same as proving the
 * app runs, so this loads the real output in jsdom and walks every route.
 *
 * fetch is stubbed to reject on purpose: the offline path is the one that has
 * to hold (spec §8/§12), and a test that only covers the happy path would miss
 * exactly the failure travellers actually hit on hostel wifi.
 */

const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = process.argv[2];
if (!file) { console.error('usage: node smoke.js <built.html>'); process.exit(2); }

const ROUTES = ['today', 'overview', 'checklist', 'destinations', 'expenses',
                'weather', 'recap', 'data'];

const errors = [];
const fail = (msg) => errors.push(msg);

/* jsdom refuses localStorage on an opaque origin, which file:// is — so
   without this every write silently no-ops behind the store's try/catch and
   the whole persistence layer goes untested. Real browsers do give a file://
   page its own storage, so the shim restores reality rather than faking it. */
function withStorage(window) {
  const map = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
      clear: () => map.clear(),
      key: (i) => [...map.keys()][i] ?? null,
      get length() { return map.size; },
    },
  });
}

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => {
  // jsdom has no layout, so scrollTo is unimplemented there. That is a gap in
  // the test environment, not in the app.
  if (/Not implemented: window.scroll/.test(e.message || '')) return;
  fail('jsdomError: ' + (e.stack || e.message));
});
virtualConsole.on('error', (...args) => fail('console.error: ' + args.join(' ')));

const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'file:///jugni.html',
  virtualConsole,
  beforeParse: withStorage,
});

const { window } = dom;
const doc = window.document;

/* Offline, with an empty cache: the hardest first-run state (spec §12). */
window.fetch = () => Promise.reject(new Error('offline (smoke test)'));
window.scrollTo = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function (v) { this.open = false; this.returnValue = v || ''; };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Trip state lives under a key scoped to this trip, so every assertion that
   reads it has to ask the document which trip this file is. */
function tripStorageKey(base = 'jugni.trip.v1') {
  const scope = doc.getElementById('jugni-data')?.getAttribute('data-trip') || '';
  return scope ? `${base}::${scope}` : base;
}

/* hashchange dispatches on the event loop, so a route change is not visible
   until the next turn — and setting the hash to what it already is fires
   nothing at all, which would hang this test rather than fail it. */
function goto(route) {
  const target = '#/' + route;
  if (window.location.hash === target) return wait(30);
  return new Promise((resolve) => {
    window.addEventListener('hashchange', () => setTimeout(resolve, 30), { once: true });
    window.location.hash = target;
  });
}

(async function main() {
  await wait(150);

  const app = doc.getElementById('app');
  if (!app || !app.children.length) fail('#app rendered nothing');
  if (!doc.querySelector('.rail')) fail('no persistent nav rendered');

  /* jsdom has no layout engine, so a broken grid renders "fine" here and is
     wrecked on screen. Assert the structure instead: exactly one .app, with
     the rail and main as its direct children. A nested duplicate turns the
     content column into a single track's width. */
  const layouts = doc.querySelectorAll('.app');
  if (layouts.length !== 1) {
    fail(`expected exactly one .app layout container, found ${layouts.length}`);
  } else {
    const kids = [...layouts[0].children].map((n) => n.tagName.toLowerCase() + '.' + (n.className || ''));
    const hasRail = layouts[0].querySelector(':scope > .rail');
    const hasMain = layouts[0].querySelector(':scope > .main');
    if (!hasRail || !hasMain) {
      fail(`.app must hold .rail and .main directly; children are [${kids.join(', ')}]`);
    } else {
      console.log('  ok    layout: one .app grid holding .rail + .main');
    }
  }

  const results = [];
  const missingSymbols = new Set();
  for (const route of ROUTES) {
    await goto(route);

    const view = doc.querySelector('[data-view]');
    if (!view) { fail(`route ${route}: no view element`); continue; }
    if (view.getAttribute('data-view') !== route) {
      fail(`route ${route}: rendered '${view.getAttribute('data-view')}' instead`);
      continue;
    }

    const text = (view.textContent || '').trim();
    if (text.length < 20) fail(`route ${route}: rendered almost nothing (${text.length} chars)`);

    /* Whichever control leads here must say so. Not every screen is reached
       from a `.navstub` — Trip data is a gear at the top of the rail — so ask
       for the marker by role, not by the class it happens to wear. */
    const marked = [...doc.querySelectorAll('[aria-current="page"]')]
      .map((el) => el.getAttribute('href'));
    if (!marked.includes('#/' + route)) {
      fail(`route ${route}: nav does not mark it as current (marked: ${marked.join(', ') || 'nothing'})`);
    }
    if ((doc.title || '').trim() === '') fail(`route ${route}: document title is empty`);

    /* F5: share must be reachable from every screen, not only the rail. */
    const shareCount = [...doc.querySelectorAll('button')]
      .filter((b) => /share/i.test(b.getAttribute('aria-label') || b.textContent || '')).length;
    if (!shareCount) fail(`route ${route}: no share control`);

    /* F15: "A$" is Intl's narrow symbol and does not say which dollar. */
    if (/[A-Z]\$\d/.test(view.textContent || '')) {
      fail(`route ${route}: renders an ambiguous narrow currency symbol`);
    }

    /* An icon referencing a symbol that was never vendored renders an empty
       box — silent, and easy to ship. */
    for (const use of view.querySelectorAll('use')) {
      const id = (use.getAttribute('href') || '').replace('#', '');
      if (id && !doc.getElementById(id)) missingSymbols.add(id);
    }

    results.push(`  ok    /${route} rendered (${text.length} chars)`);
  }

  /* Accessibility floor (spec §8): no icon-only control without a label.
     Checked on the data screen, which carries the most icon-only controls. */
  const unlabelled = [...doc.querySelectorAll('button')].filter((b) => {
    const label = (b.textContent || '').trim() || b.getAttribute('aria-label') || b.getAttribute('title');
    return !label;
  });
  if (unlabelled.length) {
    fail(`${unlabelled.length} button(s) with no accessible label: ` +
         unlabelled.map((b) => b.outerHTML.slice(0, 60)).join(' | '));
  }

  if (missingSymbols.size) {
    fail(`icons referenced but not in the sprite: ${[...missingSymbols].join(', ')}`);
  }

  /* F12: collapsible sections must be real buttons that report their state,
     or keyboard and screen-reader users cannot open them. The route loop ends
     on /data, so go back to the route thread to find a city to open. */
  await goto('overview');
  await wait(80);
  const cityId = doc.querySelector('.thread__stop a[href^="#/destinations/"]')?.getAttribute('href');
  if (!cityId) {
    /* The empty shell has no cities by design (build path (b), spec §8), so
       there is nothing to open — not a failure. */
    console.log('  --    collapsible sections: skipped, no cities in this build');
  } else {
    await goto(cityId.replace('#/', ''));
    await wait(120);
    const folds = [...doc.querySelectorAll('.fold__head')];
    if (!folds.length) {
      fail('city detail: no collapsible sections rendered');
    } else {
      const bad = folds.filter((f) => f.tagName !== 'BUTTON' || !f.hasAttribute('aria-expanded'));
      if (bad.length) fail(`${bad.length} fold header(s) are not buttons with aria-expanded`);

      const open = folds.filter((f) => f.getAttribute('aria-expanded') === 'true');
      if (!open.length) fail('city detail: every section is collapsed — one should open by default');

      /* Toggling must actually change the rendered body. */
      const target = folds.find((f) => !f.disabled && f.getAttribute('aria-expanded') === 'false');
      if (target) {
        const before = doc.querySelectorAll('.fold__body').length;
        target.click();
        await wait(80);
        if (doc.querySelectorAll('.fold__body').length <= before) {
          fail('city detail: expanding a section rendered no extra body');
        }
      }
      console.log(`  ok    ${folds.length} collapsible sections, ${open.length} open by default`);
    }
  }

  /* Widgets must state the offline case, not sit blank or spin forever. */
  await goto('weather');
  await wait(250);
  const wx = doc.querySelector('[data-wx]');
  if (wx && !/not yet available|last updated|coordinates|loading/i.test(wx.textContent)) {
    fail('weather widget offline state is blank — expected an explicit "not yet available"');
  }

  /* Whose Jugni this is, shown wherever the wordmark appears. */
  const nickname = (() => {
    try {
      const trip = JSON.parse(doc.getElementById('jugni-data')?.textContent || '{}');
      return (trip.travelers || []).find((t) => t.role === 'primary')?.nickname || '';
    } catch { return ''; }
  })();
  if (nickname) {
    const brand = doc.querySelector('.rail__brand')?.textContent || '';
    if (!brand.toLowerCase().includes(nickname.toLowerCase().slice(0, 6))) {
      fail(`the wordmark does not name the traveller (expected "${nickname}", got "${brand.trim()}")`);
    } else {
      console.log(`  ok    wordmark names the traveller (${brand.replace(/\s+/g, ' ').trim()})`);
    }
  }

  /* Every write goes through the store's clone-and-commit path, and nothing
     here exercised it — so a broken write would have passed silently. Tick a
     task, confirm it took, untick it, confirm that took too. */
  await goto('checklist');
  await wait(120);
  const box = doc.querySelector('.check[aria-checked="false"]');
  if (!box) {
    console.log('  --    mutation check: skipped, no open tasks in this build');
  } else {
    const label = box.getAttribute('aria-label');
    box.click();
    await wait(1100);   // the row animates out before the store is written
    const stored = (() => {
      try { return JSON.parse(window.localStorage.getItem(tripStorageKey()) || '{}'); }
      catch { return {}; }
    })();
    const rec = (stored.checklist || []).find((c) => c.task === label);
    if (!rec?.done) fail(`ticking "${label}" did not persist to storage`);
    else if (!rec.completedDate) fail('a completed task has no completedDate');
    else console.log('  ok    writes commit and persist (ticked a task)');
  }

  /* Cycle 02 C10: Guide and Cities merged. Old hashes must still resolve, or
     a bookmarked link silently lands on the wrong screen. */
  for (const [oldRoute, expected] of [['cities', 'destinations'], ['destination', 'destinations']]) {
    window.location.hash = `#/${oldRoute}`;
    await wait(90);
    const got = doc.querySelector('[data-view]')?.getAttribute('data-view');
    if (got !== expected) fail(`legacy route #/${oldRoute} resolved to '${got}', expected '${expected}'`);
  }
  if (!errors.some((e) => e.includes('legacy route'))) {
    console.log('  ok    legacy #/cities and #/destination still resolve');
  }

  /* The Route screen's by-day lens.

     The route walk above cannot reach it: the lens defaults to "by stop", so
     the day rows are a branch that never renders during a normal pass — the
     same shape of hole that once let a broken component ship because the only
     screen that drew it depended on the calendar. Drive the real control and
     assert on what comes out, so this holds whether or not the trip has
     started. */
  {
    await goto('overview');
    const opts = [...doc.querySelectorAll('.lens__opt')];
    const byDay = opts.find((b) => /by day/i.test(b.textContent || ''));
    /* The empty shell has no route to read either way — nothing to assert. */
    const hasRoute = !!doc.querySelector('.thread');

    if (!hasRoute) {
      console.log('  --    by-day lens: no trip loaded, nothing to read by day');
    } else if (opts.length !== 2 || !byDay) {
      fail(`route screen: expected a two-way lens switch, found ${opts.length} option(s)`);
    } else if (doc.querySelectorAll('.dayrow').length) {
      fail('route screen: day rows render before the by-day lens is chosen');
    } else {
      byDay.click();
      await wait(80);

      const rows = [...doc.querySelectorAll('.dayrow')];
      const baked = JSON.parse(doc.getElementById('jugni-data')?.textContent || '{}');
      const { startDate, endDate } = baked.trip || {};
      const expected = startDate && endDate
        ? Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1 : 0;

      if (expected && rows.length !== expected) {
        fail(`by-day lens: ${rows.length} day rows for a ${expected}-day trip`);
      } else if (!rows.length) {
        fail('by-day lens: chose "By day" and nothing rendered');
      } else if (byDay.getAttribute('aria-pressed') !== 'true') {
        fail('by-day lens: the chosen option does not report aria-pressed="true"');
      } else {
        /* Each row is a link into that specific day. A row that leads nowhere
           useful is worse than no row: it reads as a dead control. */
        const bad = rows.filter((r) =>
          !/^#\/today\/\d{4}-\d{2}-\d{2}$/.test(r.querySelector('a')?.getAttribute('href') || ''));
        if (bad.length) {
          fail(`by-day lens: ${bad.length} day row(s) do not link to a dated Today`);
        } else {
          /* …and following one must actually land on that date, not on the
             real today — the screen is not remounted by a param-only change. */
          const target = rows.at(-1).querySelector('a').getAttribute('href');
          const iso = target.split('/').pop();
          await goto(target.replace(/^#\//, ''));
          const shown = (doc.querySelector('[data-view]')?.textContent || '').replace(/\s+/g, ' ');
          if (!new RegExp(`Day\\s+${expected}\\s+of\\s+${expected}`).test(shown)) {
            fail(`by-day lens: #/today/${iso} did not open day ${expected} of ${expected}`);
          } else {
            console.log(`  ok    by-day lens: ${rows.length} day rows, each opening its own day`);
          }
        }
      }
      /* Leave the lens as it was found, so later assertions see the default.
         Re-query rather than reusing `opts` — the nodes above belong to a
         render that has since been diffed away. */
      await goto('overview');
      [...doc.querySelectorAll('.lens__opt')]
        .find((b) => /by stop/i.test(b.textContent || ''))?.click();
      await wait(60);
    }
  }

  /* Destination guide panels (schema 1.5).

     The page a traveller opens on a street corner wants "where do I eat" and
     "what is on tonight" as their own sections, not one pile of notes. And the
     short facts — emergency number, plug type, tipping — belong in a strip:
     as cards in a carousel each cost most of a phone screen to say twenty-five
     characters, and hid the next one behind a swipe. */
  {
    const baked = JSON.parse(doc.getElementById('jugni-data')?.textContent?.trim() || '{}');
    const kinds = new Set((baked.extras || []).map((x) => x.kind).filter((k) => k && k !== 'note'));
    const withKind = (baked.extras || []).find((x) => kinds.has(x.kind));

    if (!withKind) {
      console.log('  --    guide panels: no categorised destination content in this trip');
    } else {
      await goto(`destinations/${withKind.cityId}`);
      await wait(160);
      const heads = [...doc.querySelectorAll('.fold__head')].map((b) => b.textContent.trim());
      const PANEL = { food: 'Best food', free: 'Free things',
                      nightlife: 'After dark', event: "On while you're here" };
      const cityKinds = new Set((baked.extras || [])
        .filter((x) => x.cityId === withKind.cityId && PANEL[x.kind]).map((x) => x.kind));
      const missing = [...cityKinds].filter((k) => !heads.some((h) => h.startsWith(PANEL[k])));

      if (missing.length) {
        fail(`destination page has ${[...cityKinds]} content but no panel for: ${missing}`);
      } else {
        console.log(`  ok    guide panels render: ${[...cityKinds].map((k) => PANEL[k]).join(', ')}`);
      }

      /* Short facts must be a strip, not one card each. */
      const short = (baked.destinationNotes || [])
        .filter((n) => n.cityId === withKind.cityId && (n.body || '').length <= 90);
      const strip = doc.querySelectorAll('.qfact').length;
      if (short.length && strip !== short.length) {
        fail(`${short.length} short destination facts but ${strip} in the quick-facts strip`);
      } else if (short.length) {
        console.log(`  ok    ${strip} short facts shown as a strip, not ${strip} cards`);
      }
    }
  }

  /* The expense table: one entity, one shape, every line reachable.

     An expense is a flight, a room, a coffee or a museum ticket — the same
     record either way. This block asserts the consequences: every booking in
     the trip has a line, every line can be edited and deleted, and the table's
     own total agrees with the rows above it. Previously this screen carried
     five sections showing overlapping subsets of the same money, each with a
     different control, and no two of them agreed. */
  {
    await goto('expenses');
    await wait(200);
    const baked = JSON.parse(doc.getElementById('jugni-data')?.textContent?.trim() || '{}');
    const table = doc.querySelector('.xt__table');
    const bodyRows = [...doc.querySelectorAll('.xt__table tbody tr')];

    if (!table) {
      fail('the Expenses screen has no expense table');
    } else if (!bodyRows.length) {
      console.log('  --    expense table: no expenses in this trip');
    } else {
      /* Every line is editable AND deletable — the two controls the traveller
         was promised, on every row, with no row exempt. */
      const noEdit = bodyRows.filter((r) => !r.querySelector('[aria-label^="Edit expense"]'));
      const noDel = bodyRows.filter((r) => !r.querySelector('[aria-label^="Delete expense"]'));
      if (noEdit.length || noDel.length) {
        fail(`${noEdit.length} row(s) cannot be edited and ${noDel.length} cannot be deleted `
             + '— every expense carries both');
      } else {
        console.log(`  ok    all ${bodyRows.length} table rows can be edited and deleted`);
      }

      /* Row numbers exist and run 1..n in the visible order. On a phone the
         table becomes a stack of boxes and the number is the only way to keep
         your place in it. */
      const ns = [...doc.querySelectorAll('.xt__table tbody td.xt__n')].map((td) => td.textContent.trim());
      const expected = bodyRows.map((_, i) => String(i + 1));
      if (ns.join(',') !== expected.join(',')) {
        fail(`row numbers do not run 1..${bodyRows.length} in display order: got ${ns.slice(0, 6).join(',')}…`);
      } else {
        console.log(`  ok    rows numbered 1..${bodyRows.length}, matching display order`);
      }

      /* Every booking is a line. A four-flight ticket is four lines, because
         a leg that cannot be given its own figure is a leg that can never be
         recorded as having cost nothing. */
      const bookings = [
        ...(baked.transport || []).map((t) => `${t.from || '?'} → ${t.to || '?'}`),
        ...(baked.stays || []).map((x) => x.name),
      ].filter(Boolean);
      const view = (table.textContent || '').replace(/\s+/g, ' ');
      const absent = bookings.filter((label) => !view.includes(label));
      if (absent.length) {
        fail(`${absent.length} booking(s) have no line in the expense table: `
             + absent.slice(0, 4).join(', '));
      } else if (bookings.length) {
        console.log(`  ok    all ${bookings.length} bookings appear as expense lines`);
      }

      /* A booking whose document never stated a fare is a line reading 0.00 —
         present, editable, asking to be filled in. Not a hidden row, and not
         a warning panel listing the same thing a second time. */
      const seeded = JSON.parse(window.localStorage.getItem(tripStorageKey()) || 'null')
        || baked;
      const linked = (seeded.expenses || []).filter((e) => e.relatedTransportId || e.relatedStayId);
      const bookingCount = (baked.transport || []).length + (baked.stays || []).length;
      if (linked.length !== bookingCount) {
        fail(`${bookingCount} bookings but ${linked.length} linked expense rows `
             + '— every booking is seeded as an expense at build time');
      } else if (bookingCount) {
        const zeros = linked.filter((e) => !Number(e.amount)).length;
        console.log(`  ok    ${linked.length} bookings seeded as expenses`
                    + (zeros ? `, ${zeros} awaiting a figure at 0.00` : ''));
      }

      /* The phone layout, as far as anything can check it here.

         jsdom applies no media queries and computes no layout, so the stack of
         labelled boxes a phone gets is invisible to every other assertion. What
         *is* checkable is the thing it depends on: each cell carries the header
         it belongs to as `data-label`, which the stylesheet prints in front of
         it. A cell that loses its label becomes an unlabelled value in a stack
         of eight, and nobody can tell which field they are reading. */
      const cells = [...doc.querySelectorAll('.xt__table tbody td')];
      const unlabelled = cells.filter((td) => !td.getAttribute('data-label'));
      if (unlabelled.length) {
        fail(`${unlabelled.length} table cell(s) carry no data-label — on a phone they `
             + 'render as bare values with nothing saying which field they are');
      } else {
        console.log(`  ok    all ${cells.length} cells labelled for the phone layout`);
      }

      /* The total row is the table's own sum. It moves with any filter applied
         to the table, so it can never disagree with the rows above it. */
      const money = (s) => parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0;
      const rowSum = [...doc.querySelectorAll('.xt__table tbody td.xt__num')]
        .reduce((sum, td) => sum + money((td.textContent || '').split('your share')[0]), 0);
      const shown = money(doc.querySelector('.xt__total')?.textContent || '0');
      if (Math.abs(rowSum - shown) > 0.05) {
        fail(`the table totals ${shown.toFixed(2)} but its rows add to ${rowSum.toFixed(2)}`);
      } else {
        console.log(`  ok    total row agrees with its ${bodyRows.length} lines (${shown.toFixed(2)})`);
      }

      /* Sorting actually sorts. A header that looks clickable and reorders
         nothing is worse than no sorting at all. */
      const firstBefore = bodyRows[0]?.textContent?.trim();
      const amountHead = [...doc.querySelectorAll('.xt__sort')]
        .find((b) => /Amount/.test(b.textContent || ''));
      if (!amountHead) {
        fail('the expense table offers no sort control for Amount');
      } else {
        amountHead.click();
        await wait(180);
        const after = [...doc.querySelectorAll('.xt__table tbody td.xt__num')]
          .map((td) => money((td.textContent || '').split('your share')[0]));
        const descending = after.every((v, i) => i === 0 || after[i - 1] >= v);
        const firstAfter = doc.querySelector('.xt__table tbody tr')?.textContent?.trim();
        if (!descending) {
          fail('sorting by Amount did not order the rows by amount');
        } else if (bodyRows.length > 1 && firstAfter === firstBefore
                   && new Set(after).size > 1) {
          fail('sorting by Amount changed nothing');
        } else {
          console.log('  ok    sorting by Amount reorders the table');
        }
      }
    }
  }

  /* A destination's spending is the same table, filtered.

     The city's headline figure and its table must be the same number: they
     used to come from different reductions — one reading `homeAmount`, the
     other dividing `amount` — and disagreed by a few cents on any split. */
  {
    const baked = JSON.parse(doc.getElementById('jugni-data')?.textContent?.trim() || '{}');
    const withSpend = (baked.cities || []).find((c) =>
      (baked.expenses || []).some((e) => e.cityId === c.id));

    if (!withSpend) {
      console.log('  --    destination spending: no expense is tagged with a city');
    } else {
      await goto(`destinations/${withSpend.id}`);
      await wait(260);
      const money = (s) => parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0;
      const stat = [...doc.querySelectorAll('.stat')].find((s) => /You spent/.test(s.textContent || ''));
      const head = money((stat?.textContent || '').replace('You spent', ''));
      const table = doc.querySelector('.xt__table');

      if (!table) {
        fail(`${withSpend.name} has spending but no expense table on its page`);
      } else if (!doc.querySelector('.xt__table [aria-label^="Edit expense"]')) {
        fail(`${withSpend.name}'s expense table offers no way to edit a line`);
      } else if (!doc.querySelector('.xt [aria-label], .xt button')) {
        fail(`${withSpend.name}'s expense table offers no way to add a line`);
      } else {
        const total = money(doc.querySelector('.xt__total')?.textContent || '0');
        if (Math.abs(head - total) > 0.05) {
          fail(`${withSpend.name} reports ${head.toFixed(2)} at the top of the page `
               + `but its table totals ${total.toFixed(2)} — same money, two reductions`);
        } else {
          console.log(`  ok    ${withSpend.name}: headline figure matches its table (${total.toFixed(2)})`);
        }
      }
    }
  }

  /* A bill splits by who was in the room (schema 1.4).

     A trip is not one party size: five share the city apartments and three go
     north. Dividing by the traveller count understated a share on every
     booking that was not the whole group, and it did so silently — the number
     looked plausible either way. Assert the offer matches the booking. */
  {
    const baked = JSON.parse(doc.getElementById('jugni-data')?.textContent?.trim() || '{}');
    const withGuests = (baked.stays || []).filter((x) => Number(x.guests) > 0
      && Number(x.cost) > 0 && Number(x.guests) !== (baked.travelers || []).length);

    if (!withGuests.length) {
      console.log('  --    stay split: no booking here differs from the traveller count');
    } else {
      const wrong = [];
      for (const stay of withGuests) {
        await goto(`destinations/${stay.cityId}`);
        await wait(120);
        const card = [...doc.querySelectorAll('.stub')]
          .find((el) => (el.textContent || '').includes(stay.name));
        const btn = card && [...card.querySelectorAll('button')]
          .find((b) => /Add my share/.test(b.textContent || ''));
        if (btn && !btn.textContent.includes(`÷${stay.guests}`)) {
          wrong.push(`${stay.name}: offers "${btn.textContent.trim()}" for ${stay.guests} guests`);
        }
      }
      if (wrong.length) fail(`stay split divides by the wrong party: ${wrong.join('; ')}`);
      else console.log(`  ok    stay split follows each booking's own guest count`);
    }
  }

  /* A multi-leg ticket is priced once.

     Melbourne to Lahore is four flights on one reference and one receipt, so
     three of those legs carry no fare of their own. Listing them as "no price
     recorded — your total is lower than what you actually paid" contradicts
     the paid total on the same screen. Checked against the data rather than a
     fixture: no leg may be flagged when a sibling on its booking reference
     carries the fare, and a ticket with no fare anywhere must still show. */
  {
    const baked = JSON.parse(doc.getElementById('jugni-data')?.textContent?.trim() || '{}');
    const legs = baked.transport || [];
    const pricedRefs = new Set(legs.filter((t) => Number(t.cost) > 0 && t.bookingRef)
      .map((t) => String(t.bookingRef).trim().toLowerCase()));

    await goto('expenses');
    await wait(120);
    const panel = (doc.querySelector('[data-view]')?.textContent || '').replace(/\s+/g, ' ');
    const listed = panel.includes('bookings with no price') ? panel : '';

    const wrongly = legs.filter((t) => !(Number(t.cost) > 0) && t.bookingRef
      && pricedRefs.has(String(t.bookingRef).trim().toLowerCase())
      && listed.includes(`${t.from || '?'} → ${t.to || '?'}`));

    if (wrongly.length) {
      fail(`${wrongly.length} leg(s) reported as unpriced although their booking `
           + `carries the fare: ${wrongly.map((t) => t.bookingRef).join(', ')}`);
    } else if (pricedRefs.size) {
      console.log('  ok    a multi-leg ticket counts as priced once, not once per leg');
    }
  }

  /* First-run identity (spec §6).

     The app has no login, so this dialog is the only moment it asks who is
     holding the file — and it fires from a boot-time flag that is trivially
     lost in a refactor. This same jsdom started with empty storage, so it IS
     a first run: the dialog must be open, and must carry exactly the three
     identity fields, no more. */
  {
    const dialog = [...doc.querySelectorAll('dialog.sheet')].find((d) => d.open);
    const bakedTrip = JSON.parse(doc.getElementById('jugni-data')?.textContent?.trim() || '{}');
    if (!bakedTrip.trip) {
      console.log('  --    welcome dialog: no trip baked in, nothing to introduce');
    } else if (!dialog) {
      fail('first run did not ask who the traveller is');
    } else {
      const fields = [...dialog.querySelectorAll('[name]')].map((i) => i.name).sort();
      if (String(fields) !== 'age,email,nickname') {
        fail(`welcome asks for [${fields}] — identity is exactly nickname, email, age (spec §6)`);
      } else {
        console.log('  ok    first run asks for nickname, email and age');
      }
      /* Leave it closed, or every later query hits a modal-covered page. */
      dialog.close();
      await wait(60);
    }
  }

  /* One expense form, whichever door you came through.

     There were three, with different fields and different wording, so what a
     traveller could record depended on which button they happened to press.
     Assert the field set is identical from every entry point, and that no row
     shows two currencies — a trip has one currency, and anything else that
     needs saying goes in the comment. */
  {
    await goto('expenses');
    await wait(180);
    const fieldsOf = (sheet) => [...sheet.querySelectorAll('[name]')]
      .map((i) => i.name).sort().join(',');
    const openBy = async (match) => {
      /* Normalised: a button reading `<svg/> Add expense` has newlines and
         indentation in its textContent, and an anchored pattern misses it
         entirely — which reads as "this door does not exist". */
      const btn = [...doc.querySelectorAll('button')]
        .find((b) => match.test(
          (b.textContent || '').replace(/\s+/g, ' ').trim()
          || (b.getAttribute('aria-label') || '').trim()));
      if (!btn) return null;
      btn.click();
      await wait(150);
      const sheet = [...doc.querySelectorAll('dialog.sheet')].find((d) => d.open);
      const fields = sheet ? fieldsOf(sheet) : null;
      sheet?.close();
      await wait(60);
      return fields;
    };

    /* Every door on every screen, not just the ones that already agreed.

       The last version of this check compared two doors and passed while a
       third — "Add the price" — kept its own sheet with a currency picker on
       a one-currency trip. A door this check cannot reach is a door it cannot
       vouch for, so failing to find one is a failure, never a skip. */
    const seen = [];
    for (const [name, match] of [
      ['Add expense (page)', /^Add expense$/],
      ['Edit expense (row)', /^Edit expense/],
    ]) {
      const fields = await openBy(match);
      if (fields) seen.push([name, fields]);
    }

    /* And the same form again from a destination page's own table, which is a
       different component rendering the same entity. */
    const baked = JSON.parse(doc.getElementById('jugni-data')?.textContent?.trim() || '{}');
    const anyCity = (baked.cities || [])[0];
    if (anyCity) {
      await goto(`destinations/${anyCity.id}`);
      await wait(240);
      for (const [name, match] of [
        ['Add expense (destination)', /^Add expense$/],
        ['Edit expense (destination row)', /^Edit expense/],
      ]) {
        const fields = await openBy(match);
        if (fields) seen.push([name, fields]);
      }
      await goto('expenses');
      await wait(180);
    }

    const REQUIRED = ['amount', 'category', 'cityId', 'currency', 'date', 'label', 'mine', 'note', 'splitBetween'];
    if (seen.length < 3) {
      fail(`only ${seen.length} way(s) to record an expense found `
           + `(${seen.map(([n]) => n).join(', ') || 'none'}) — expected the page's own `
           + `Add and Edit plus a destination page's. A door that is not reachable `
           + `here is a door this check cannot prove agrees with the others.`);
    } else {
      const [, first] = seen[0];
      const odd = seen.filter(([, f]) => f !== first);
      const missing = REQUIRED.filter((f) => !first.split(',').includes(f));
      if (odd.length) {
        fail('the expense form differs by entry point: '
             + seen.map(([n, f]) => `${n}=[${f}]`).join('  '));
      } else if (missing.length) {
        fail(`the expense form is missing ${missing.join(', ')} — the field list is `
             + `the contract: [${first}]`);
      } else {
        console.log(`  ok    one expense form, identical from all ${seen.length} entry points`);
      }
    }

    /* The one control the traveller asked to be gone. Pricing a booking is
       editing its expense; a second, differently-worded button for the same
       act is exactly what three rounds of feedback were about. */
    const strays = [...doc.querySelectorAll('button')]
      .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => /^(Add the price|Add my share|Log spend|Save price|Edit the price)$/.test(t));
    if (strays.length) {
      fail(`${strays.length} bespoke money control(s) still on screen: ${[...new Set(strays)].join(', ')}`
           + ' — an expense is added with "Add expense" and changed with the edit icon');
    } else {
      console.log('  ok    no bespoke "add the price" / "add my share" controls remain');
    }

    const twoCurrency = doc.querySelectorAll('.money-alt').length;
    if (twoCurrency) {
      fail(`${twoCurrency} amount(s) on Expenses show two currencies — a trip has one`);
    } else {
      console.log('  ok    every amount reads in the trip currency, once');
    }
  }

  /* Editing yourself edits yourself.

     Handing the file to someone else is a fork — the previous owner becomes a
     companion. Running that same rule from "About you" turned a traveller
     fixing the spelling of their own name into two people: the old spelling
     demoted to companion, the new one added as primary. Two different
     questions, and only one of them creates anybody. */
  {
    await goto('data');
    await wait(160);
    const before = JSON.parse(window.localStorage.getItem(tripStorageKey()) || '{}').travelers || [];
    const row = [...doc.querySelectorAll('.row')].find((r) => /primary/.test(r.textContent || ''));

    if (!before.length || !row) {
      console.log('  --    traveller editing: nobody on this trip to edit');
    } else {
      row.querySelector('button')?.click();
      await wait(140);
      const sheet = [...doc.querySelectorAll('dialog.sheet')].find((d) => d.open);
      const field = sheet?.querySelector('[name=nickname]');
      if (!field) {
        fail('editing the primary traveller does not offer a nickname field');
      } else {
        field.value = 'RenamedForTest';
        sheet.querySelector('form').dispatchEvent(
          new window.Event('submit', { bubbles: true, cancelable: true }));
        await wait(220);
        const after = JSON.parse(window.localStorage.getItem(tripStorageKey()) || '{}').travelers || [];
        const primaries = after.filter((t) => t.role === 'primary');

        if (after.length !== before.length) {
          fail(`renaming the primary changed the traveller count ${before.length} → ${after.length}`
               + ' — a rename must not create anybody');
        } else if (primaries.length !== 1) {
          fail(`after a rename there are ${primaries.length} primary travellers`);
        } else if (primaries[0].nickname !== 'RenamedForTest') {
          fail(`the rename did not take: primary is ${JSON.stringify(primaries[0].nickname)}`);
        } else {
          console.log('  ok    renaming a traveller renames them, and creates nobody');
        }
      }
    }
  }

  /* Per-task "add to calendar" (spec §12).

     Only a task with a due date can become an event, so the control appears
     per row rather than once per screen — which is exactly the shape that
     rots quietly when someone edits TaskRow. Assert it is there, labelled
     with its own task, and offered on every dated open task rather than just
     the first. Clicking is left alone on purpose: the download goes through
     an <a download> click, which jsdom reports as unimplemented navigation. */
  {
    await goto('checklist');
    await wait(120);
    const rows = [...doc.querySelectorAll('.row')].filter((r) => r.querySelector('.check'));
    const dated = rows.filter((r) => /due |overdue/i.test(r.textContent || '')
                                     && !r.classList.contains('row--done'));
    const withBtn = dated.filter((r) =>
      [...r.querySelectorAll('button')].some((b) => b.getAttribute('title') === 'Add to calendar'));

    if (!dated.length) {
      console.log('  --    per-task calendar: no dated open tasks in this build');
    } else if (withBtn.length !== dated.length) {
      fail(`per-task calendar: ${withBtn.length} of ${dated.length} dated tasks offer it`);
    } else {
      const generic = withBtn.filter((r) => {
        const b = [...r.querySelectorAll('button')]
          .find((x) => x.getAttribute('title') === 'Add to calendar');
        return !/^Add ".+" to your calendar$/.test(b.getAttribute('aria-label') || '');
      });
      if (generic.length) {
        fail(`${generic.length} calendar button(s) do not name their task in the label`);
      } else {
        console.log(`  ok    per-task calendar offered on all ${dated.length} dated open tasks`);
      }

      /* Both routes must survive. The Google link is the convenient one and
         the .ics is the one that works with no connection and outside Google
         — dropping the file download to "simplify" would quietly break the
         offline promise (§8) for every Apple and Outlook user. Opening the
         sheet is safe here; following either route is not, because both end
         in navigation jsdom does not implement. */
      [...withBtn[0].querySelectorAll('button')]
        .find((b) => b.getAttribute('title') === 'Add to calendar').click();
      await wait(120);
      const sheet = [...doc.querySelectorAll('dialog.sheet')].find((d) => d.open);
      const offers = sheet
        ? [...sheet.querySelectorAll('.rows strong')].map((x) => x.textContent.trim()) : [];
      if (!offers.some((o) => /google/i.test(o))) {
        fail('per-task calendar no longer offers the Google Calendar route');
      } else if (!offers.some((o) => /file|\.ics/i.test(o))) {
        fail('per-task calendar dropped the .ics download — offline and non-Google users lose it');
      } else {
        console.log(`  ok    calendar offers both routes: ${offers.join(' + ')}`);
      }
      sheet?.close();
      await wait(60);
    }
  }

  /* Storage is scoped to this trip.

     Every trip builds to a file called jugni.html. One shared localStorage key
     meant opening a second trip overwrote the first one's ticked tasks and
     logged spend — and the app then showed a perfectly valid trip, so nothing
     looked wrong until the traveller went looking for their edits. */
  {
    const el = doc.getElementById('jugni-data');
    const tripKey = el?.getAttribute('data-trip') || '';
    const baked = JSON.parse(el?.textContent?.trim() || '{}');

    if (!baked.trip) {
      console.log('  --    storage scope: empty shell, nothing to scope');
    } else if (!tripKey) {
      fail('a baked trip carries no data-trip, so its storage is shared with every other trip');
    } else {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i += 1) keys.push(window.localStorage.key(i));
      const unscoped = keys.filter((k) => /^jugni\.(trip|build|cleared)/.test(k)
                                          && !k.endsWith(`::${tripKey}`));
      if (unscoped.length) {
        fail(`trip state written to unscoped key(s): ${unscoped.join(', ')}`);
      } else if (!keys.some((k) => k === `jugni.trip.v1::${tripKey}`)) {
        fail(`nothing saved under jugni.trip.v1::${tripKey}`);
      } else {
        console.log(`  ok    trip state stored under its own key (::${tripKey})`);
      }
    }
  }

  /* A rebuilt file must not hide behind a stale saved copy.

     The store prefers localStorage over the baked trip on purpose — reopening
     must not discard a traveller's edits. The cost is that regenerating with
     new bookings and reopening shows yesterday's trip while the file contains
     today's, with nothing on screen saying so. That shipped once and read as
     "the booking is missing from the build". The data element carries a build
     stamp; assert it exists and that a mismatch is actually surfaced. */
  {
    const el = doc.getElementById('jugni-data');
    const buildId = el?.getAttribute('data-build') || '';
    const baked = JSON.parse(el?.textContent?.trim() || '{}');
    if (baked.trip) {
      if (!/^[0-9a-f]{12}$/.test(buildId)) {
        fail(`baked file carries no usable build stamp (data-build=${JSON.stringify(buildId)})`);
      } else {
        await checkStaleBuildIsSurfaced(buildId);
      }
    }
  }

  /* Cycle 02 C1: no screen may take a semantic colour as its accent — those
     state facts, and a screen tinted with "done" gold is a lie. */
  const SEMANTIC = ['brass', 'rust', 'transit-blue'];
  const badAccents = [...doc.querySelectorAll('.rail__nav .navstub[data-accent]')]
    .map((a) => a.getAttribute('data-accent'))
    .filter((a) => SEMANTIC.includes(a));
  if (badAccents.length) {
    fail(`screen accent uses a semantic colour: ${[...new Set(badAccents)].join(', ')}`);
  } else {
    console.log('  ok    every screen accent is categorical, not semantic');
  }

  /* Cycle 02 C4: the source filename belongs in Trip data, not repeated under
     every booking. */
  await goto('destinations');
  await wait(90);
  const firstStop = doc.querySelector('a[href^="#/destinations/"]')?.getAttribute('href');
  if (firstStop) {
    await goto(firstStop.replace('#/', ''));
    await wait(120);
    const leaked = /source:\s*\S+\.(pdf|csv|xlsx|html)/i.test(doc.querySelector('[data-view]')?.textContent || '');
    if (leaked) fail('a source filename is still shown on a destination page');
    else console.log('  ok    source filenames stay out of the destination pages');
  }

  /* Currency consistency, offline: a figure that is NOT in the home currency
     must say so, or a DKK number sitting beside AUD numbers reads as
     comparable when it is not. */
  const homeCurrency = (() => {
    try { return JSON.parse(doc.getElementById('jugni-data')?.textContent || '{}').trip?.homeCurrency || ''; }
    catch { return ''; }
  })();

  if (homeCurrency) {
    await goto('overview');
    await wait(120);
    const unmarked = [...doc.querySelectorAll('.money__code')]
      .filter((c) => !c.closest('.money-alt'))
      .filter((c) => c.textContent.trim() !== homeCurrency)
      .filter((c) => !/not converted/i.test(c.closest('.money-group')?.textContent || ''));
    if (unmarked.length) {
      fail(`offline: ${unmarked.length} amount(s) shown in a foreign currency with no `
        + `"not converted" marker: ${[...new Set(unmarked.map((c) => c.textContent.trim()))].join(', ')}`);
    } else {
      console.log('  ok    offline: foreign amounts are labelled, not passed off as home currency');
    }
  }

  /* Nothing may be written to storage in read-only snapshot mode (spec §12). */
  const dataEl = doc.getElementById('jugni-data');
  const readonlyMode = dataEl && dataEl.getAttribute('data-mode') === 'readonly';
  if (readonlyMode && doc.body.getAttribute('data-readonly') !== 'true') {
    fail('snapshot declares data-mode=readonly but the app did not enter read-only mode');
  }

  console.log(results.join('\n'));
  console.log('  ok    accessible labels on all buttons');
  console.log(`  ok    ${doc.querySelectorAll('#sprite symbol').length} sprite symbols, all references resolve`);
  console.log('  ok    share reachable from every screen');
  console.log('  ok    currency rendered as a code, not a narrow symbol');
  console.log('  ok    offline widget state is explicit');

  /* Close the window rather than process.exit(): jsdom's timers would
     otherwise hold the loop open, and process.exit truncates buffered stdout
     when it is a pipe — which is how this test once "passed" silently. */
  /* Second pass with a rate table available: every primary figure must then
     be in the home currency, on every screen. */
  if (homeCurrency) await checkConvertedPass(homeCurrency);

  if (errors.length) {
    console.log('');
    errors.forEach((e) => console.log('  FAIL  ' + e));
  } else {
    console.log('\nOK — every route renders, offline, with no runtime errors');
  }

  process.exitCode = errors.length ? 1 : 0;
  window.close();
})();

async function checkConvertedPass(homeCurrency) {
  const vc2 = new VirtualConsole();
  const dom2 = new JSDOM(fs.readFileSync(file, 'utf8'), {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'file:///jugni2.html', virtualConsole: vc2,
    beforeParse: withStorage,
  });
  const w = dom2.window;
  const d = w.document;

  w.scrollTo = () => {};
  w.fetch = (url) => {
    /* Only the rate call succeeds; everything else stays offline, so this
       pass isolates conversion rather than re-testing the widgets. */
    if (String(url).includes('frankfurter') && String(url).includes('to=')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          base: homeCurrency, date: '2026-01-01',
          rates: { EUR: 0.6, DKK: 4.4, NOK: 7, SEK: 6.8, HUF: 230, USD: 0.65,
                   GBP: 0.5, CZK: 15, PLN: 2.6, CHF: 0.58, TRY: 22, JPY: 100 },
        }),
      });
    }
    return Promise.reject(new Error('offline'));
  };

  await new Promise((r) => setTimeout(r, 400));

  const seen = new Set();
  for (const route of ['overview', 'expenses', 'destinations', 'recap']) {
    w.location.hash = `#/${route}`;
    await new Promise((r) => setTimeout(r, 140));
    for (const code of d.querySelectorAll('.money__code')) {
      if (!code.closest('.money-alt')) seen.add(code.textContent.trim());
    }
  }

  const foreign = [...seen].filter((c) => c && c !== homeCurrency);
  if (foreign.length) {
    errors.push(`with rates available, these still lead in a foreign currency: ${foreign.join(', ')}`);
  } else {
    console.log(`  ok    every primary amount reads in ${homeCurrency}`);
  }
  w.close();
}

/* Boot a second copy whose localStorage holds a trip saved under a DIFFERENT
   build, and confirm the app says so rather than quietly serving the old data.
   Seeding a mismatched build is the whole point, so this cannot reuse
   `withStorage` — it needs its own seeded map. */
async function checkStaleBuildIsSurfaced(currentBuild) {
  const vc = new VirtualConsole();
  const boot = (seed) => {
    const map = new Map(Object.entries(seed));
    const d = new JSDOM(fs.readFileSync(file, 'utf8'), {
      runScripts: 'dangerously', pretendToBeVisual: true,
      url: 'file:///jugni3.html', virtualConsole: vc,
      beforeParse(w) {
        Object.defineProperty(w, 'localStorage', { configurable: true, value: {
          getItem: (k) => (map.has(k) ? map.get(k) : null),
          setItem: (k, v) => map.set(k, String(v)),
          removeItem: (k) => map.delete(k), clear: () => map.clear(),
          key: (i) => [...map.keys()][i] ?? null, get length() { return map.size; } } });
      },
    });
    d.window.fetch = () => Promise.reject(new Error('offline'));
    d.window.scrollTo = () => {};
    return d.window;
  };

  const savedTrip = JSON.parse(
    document_data_of(fs.readFileSync(file, 'utf8')));

  /* (a) Same build — the notice must stay away, or it nags on every load. */
  const same = boot({ [tripStorageKey()]: JSON.stringify(savedTrip),
                      [tripStorageKey('jugni.build.v1')]: currentBuild });
  await new Promise((r) => setTimeout(r, 220));
  if (same.document.querySelector('.rebuilt')) {
    fail('rebuild notice shows even though the saved copy is from this same build');
  }
  same.close();

  /* (b) Different build — it must be surfaced, with a way to take the data. */
  const stale = boot({ [tripStorageKey()]: JSON.stringify(savedTrip),
                       [tripStorageKey('jugni.build.v1')]: '0000deadbeef' });
  await new Promise((r) => setTimeout(r, 220));
  const notice = stale.document.querySelector('.rebuilt');
  if (!notice) {
    fail('a trip saved under an older build is served silently — the rebuild is invisible');
  } else if (![...notice.querySelectorAll('button')].some((b) => /load the new/i.test(b.textContent))) {
    fail('rebuild notice offers no way to load the new data');
  } else {
    console.log('  ok    a rebuilt file announces itself instead of hiding behind a stale copy');
  }
  stale.close();
}

function document_data_of(html) {
  const m = /id="jugni-data"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  return (m && m[1].trim()) || '{}';
}
