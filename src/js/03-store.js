/* All state lives in localStorage (spec §8). No server, no account. */

const Store = {
  KEY: 'jugni.trip.v1',
  state: Schema.empty(),
  warnings: [],
  readonly: false,
  _subs: [],

  init(baked) {
    /* Precedence: what the traveler has been editing locally wins over the
       data baked into the file at build time — otherwise reopening the file
       would silently discard their trip. */
    let source = null, from = 'empty';
    try {
      const saved = localStorage.getItem(Store.KEY);
      if (saved) { source = JSON.parse(saved); from = 'local'; }
    } catch (e) { /* private mode / corrupt entry — fall through to baked */ }

    if (!source && baked && baked.trip) { source = baked; from = 'baked'; }

    const res = Schema.normalize(source);
    Store.state = res.doc;
    Store.warnings = res.warnings;
    Store.origin = from;

    if (from === 'baked') Store.save();
    Store.applyTheme();
    return from;
  },

  /* Read-only snapshot mode (spec §12.1): view without writing anything. */
  setReadonly(on) {
    Store.readonly = !!on;
    document.body.setAttribute('data-readonly', on ? 'true' : 'false');
  },

  save() {
    if (Store.readonly) return;
    try {
      localStorage.setItem(Store.KEY, JSON.stringify(Store.state));
    } catch (e) {
      UI.toast('Could not save — browser storage is full or blocked.');
    }
  },

  subscribe(fn) { Store._subs.push(fn); },
  emit() { Store._subs.forEach(function (fn) { fn(Store.state); }); },

  /* Every write goes through here: mutate, persist, re-render. */
  mutate(fn) {
    if (Store.readonly) { UI.toast('This is a read-only snapshot.'); return; }
    fn(Store.state);
    Store.save();
    Store.emit();
  },

  /* The completion log (spec §4) — an audit trail of what happened when,
     which is what answers "did I already do that?". */
  logEvent(type, relatedType, relatedId, text) {
    Store.state.log.push({
      id: U.uid('log'), date: U.todayISO(),
      relatedType: relatedType, relatedId: relatedId, type: type, text: text
    });
  },

  applyTheme() {
    const t = Store.state.trip.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  },
  setTheme(t) {
    Store.mutate(function (s) { s.trip.theme = t === 'dark' ? 'dark' : 'light'; });
    Store.applyTheme();
  },

  /* ---- Import / export (spec §8's role-based naming) ---- */

  exportName() {
    const primary = Trip.primaryTraveler();
    const nick = (primary && primary.nickname ? primary.nickname : 'traveler')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'output-' + (nick || 'traveler') + '.json';
  },

  exportJSON() { return JSON.stringify(Store.state, null, 2); },

  /* Importing someone else's export is the fork flow: same schema, the file
     name just reflects which direction it is moving (spec §8/§12). */
  importJSON(text) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { return { ok: false, error: 'That file is not valid JSON.' }; }
    if (!parsed || !parsed.trip) return { ok: false, error: 'That JSON has no "trip" — not a Jugni file.' };

    const res = Schema.normalize(parsed);
    Store.state = res.doc;
    Store.warnings = res.warnings;
    Store.save();
    Store.applyTheme();
    Store.emit();

    /* An imported file is somebody else's export. Whoever imported it is the
       primary traveller of their own fork now, so their identity has to be
       asked for rather than inherited (spec §2's fork-customization path). */
    Store.needsFork = true;
    return { ok: true, warnings: res.warnings };
  },

  reset() {
    try { localStorage.removeItem(Store.KEY); } catch (e) {}
    location.reload();
  }
};
