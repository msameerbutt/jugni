/* The internal schema (spec §4) as the app sees it.
   Users never touch this — it exists so the app can normalise whatever
   input.json it is handed, and detect schema drift instead of misreading it. */

const Schema = {
  VERSION: '1.0',

  COLLECTIONS: ['travelers', 'cities', 'transport', 'stays', 'checklist',
                'expenses', 'destinationNotes', 'log', 'extras'],

  empty() {
    return {
      trip: {
        schemaVersion: Schema.VERSION, name: '', startDate: '', endDate: '',
        homeCurrency: '', budget: 0, notes: '', theme: 'light'
      },
      travelers: [], cities: [], transport: [], stays: [], checklist: [],
      expenses: [], destinationNotes: [], log: [], extras: []
    };
  },

  /* Fill in anything a hand-edited or older file is missing, without
     inventing data. Returns { doc, warnings }. */
  normalize(raw) {
    const warnings = [];
    const doc = Schema.empty();
    if (!raw || typeof raw !== 'object') return { doc: doc, warnings: ['No data — starting empty.'] };

    Object.assign(doc.trip, raw.trip || {});
    if (!doc.trip.schemaVersion) doc.trip.schemaVersion = Schema.VERSION;
    if (doc.trip.schemaVersion !== Schema.VERSION) {
      warnings.push('This trip file was written against schema ' + doc.trip.schemaVersion +
                    '; this app reads ' + Schema.VERSION + '.');
    }
    if (doc.trip.theme !== 'dark') doc.trip.theme = doc.trip.theme === 'light' ? 'light' : 'light';

    Schema.COLLECTIONS.forEach(function (key) {
      const list = Array.isArray(raw[key]) ? raw[key] : [];
      doc[key] = list.map(function (rec, i) {
        const r = Object.assign({}, rec);
        /* IDs are stable once created (spec §4). Only mint one where a record
           genuinely arrived without any. */
        if (!r.id) r.id = U.uid(key.slice(0, 4) + i);
        return r;
      });
    });

    /* Cross-reference integrity: a dangling cityId is a data bug worth
       surfacing, not silently rendering as a blank. */
    const cityIds = {};
    doc.cities.forEach(function (c) { cityIds[c.id] = true; });
    ['stays', 'checklist', 'expenses', 'destinationNotes', 'extras'].forEach(function (key) {
      doc[key].forEach(function (r) {
        if (r.cityId && !cityIds[r.cityId]) {
          warnings.push(key + ' record "' + (r.task || r.label || r.title || r.name || r.id) +
                        '" points at unknown city ' + r.cityId + '.');
          r.cityId = '';
        }
      });
    });

    return { doc: doc, warnings: warnings };
  }
};
