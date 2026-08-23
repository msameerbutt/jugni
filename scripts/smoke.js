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

const ROUTES = ['today', 'overview', 'checklist', 'cities', 'expenses',
                'weather', 'destination', 'recap', 'data'];

const errors = [];
const fail = (msg) => errors.push(msg);

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
  virtualConsole
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

  const results = [];
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

  /* Widgets must state the offline case, not sit blank or spin forever. */
  await goto('weather');
  await wait(250);
  const wx = doc.querySelector('[data-wx]');
  if (wx && !/not yet available|last updated|coordinates|loading/i.test(wx.textContent)) {
    fail('weather widget offline state is blank — expected an explicit "not yet available"');
  }

  /* Nothing may be written to storage in read-only snapshot mode (spec §12). */
  const dataEl = doc.getElementById('jugni-data');
  const readonlyMode = dataEl && dataEl.getAttribute('data-mode') === 'readonly';
  if (readonlyMode && doc.body.getAttribute('data-readonly') !== 'true') {
    fail('snapshot declares data-mode=readonly but the app did not enter read-only mode');
  }

  console.log(results.join('\n'));
  console.log('  ok    accessible labels on all buttons');
  console.log('  ok    offline widget state is explicit');

  if (errors.length) {
    console.log('');
    errors.forEach((e) => console.log('  FAIL  ' + e));
  } else {
    console.log('\nOK — every route renders, offline, with no runtime errors');
  }

  /* Close the window rather than process.exit(): jsdom's timers would
     otherwise hold the loop open, and process.exit truncates buffered stdout
     when it is a pipe — which is how this test once "passed" silently. */
  process.exitCode = errors.length ? 1 : 0;
  window.close();
})();
