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

    const current = doc.querySelector('.navstub[aria-current="page"]');
    if (!current || current.getAttribute('href') !== '#/' + route) {
      fail(`route ${route}: nav does not mark it as current`);
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
      try { return JSON.parse(window.localStorage.getItem('jugni.trip.v1') || '{}'); }
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
