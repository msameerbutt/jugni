/* Small shared helpers. No dependencies. */

const U = {
  $(sel, root) { return (root || document).querySelector(sel); },
  $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); },

  esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  },

  uid(prefix) {
    return (prefix || 'id') + '_' +
      Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  },

  /* ---- Dates. Trip dates are calendar dates: parse as LOCAL, never UTC,
     so a date never slides a day depending on the reader's timezone. ---- */
  toDate(iso) {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) { const d = new Date(iso); return isNaN(d) ? null : d; }
    return new Date(+m[1], +m[2] - 1, +m[3]);
  },
  todayISO() {
    const d = new Date();
    return [d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, '0'),
            String(d.getDate()).padStart(2, '0')].join('-');
  },
  dayDiff(aISO, bISO) {
    const a = U.toDate(aISO), b = U.toDate(bISO);
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
  },
  inRange(iso, startISO, endISO) {
    if (!iso || !startISO || !endISO) return false;
    return iso >= startISO.slice(0, 10) && iso <= endISO.slice(0, 10);
  },

  fmtDate(iso, opts) {
    const d = U.toDate(iso);
    if (!d) return '';
    return d.toLocaleDateString(undefined, opts || { day: '2-digit', month: 'short' });
  },
  fmtDateLong(iso) {
    return U.fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  },
  fmtRange(aISO, bISO) {
    if (!aISO) return '';
    if (!bISO || aISO === bISO) return U.fmtDate(aISO);
    return U.fmtDate(aISO) + ' – ' + U.fmtDate(bISO);
  },
  /* Datetimes carry an explicit UTC offset (spec §4). Render the time as it
     was written — the local time at that location — not re-zoned to the
     reader's clock, which is what makes multi-timezone trips confusing. */
  fmtLocalTime(dt) {
    if (!dt) return '';
    const m = /T(\d{2}):(\d{2})/.exec(dt);
    return m ? m[1] + ':' + m[2] : '';
  },
  fmtLocalDateTime(dt) {
    if (!dt) return '';
    const t = U.fmtLocalTime(dt);
    return U.fmtDate(dt.slice(0, 10)) + (t ? ' · ' + t : '');
  },
  tzOffsetOf(dt) {
    const m = /([+-]\d{2}:\d{2})$/.exec(dt || '');
    return m ? 'UTC' + m[1].replace(':00', '') : '';
  },

  /* ---- Money ---- */
  money(amount, currency) {
    if (amount === null || amount === undefined || isNaN(amount)) return '—';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency: currency || 'USD',
        maximumFractionDigits: Math.abs(amount) >= 1000 ? 0 : 2
      }).format(amount);
    } catch (e) {
      return (currency ? currency + ' ' : '') + Number(amount).toFixed(2);
    }
  },

  titleCase(s) {
    return String(s || '').replace(/(^|[\s-])([a-z])/g, function (_, p, c) { return p + c.toUpperCase(); });
  },

  sortBy(arr, keyFn) {
    return arr.slice().sort(function (a, b) {
      const ka = keyFn(a), kb = keyFn(b);
      if (ka === kb) return 0;
      if (ka === null || ka === undefined || ka === '') return 1;
      if (kb === null || kb === undefined || kb === '') return -1;
      return ka < kb ? -1 : 1;
    });
  },

  /* Icons: inline so nothing is fetched at runtime (spec §8). */
  icon(name, size) {
    const p = U.ICONS[name] || U.ICONS.dot;
    return '<svg class="navstub__icon" width="' + (size || 18) + '" height="' + (size || 18) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      p + '</svg>';
  },

  ICONS: {
    dot: '<circle cx="12" cy="12" r="3"/>',
    today: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    route: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v5a4 4 0 0 0 4 4h5.5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    city:  '<path d="M3 21h18M5 21V8l6-4v17M11 21V11h8v10M14 15h2M14 18h2"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4"/>',
    cloud: '<path d="M6.5 18a4.5 4.5 0 0 1 .6-8.96 6 6 0 0 1 11.4 2.2A3.8 3.8 0 0 1 18 18Z"/>',
    info:  '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    recap: '<path d="M4 19V5M4 19h16M8 15V9M12 15V6M16 15v-4"/>',
    data:  '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    plane: '<path d="M17.8 19.8 15 13l4.5-4.5a2.1 2.1 0 0 0-3-3L12 10 5.2 7.2l-1.4 1.4 5.3 3.9-2.5 2.5-2.4-.5-1 1 3 1.8 1.8 3 1-1-.5-2.4 2.5-2.5 3.9 5.3z"/>',
    train: '<rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 10h14M8.5 20l-2 2M15.5 20l2 2M9 13h.01M15 13h.01M5 16h14"/>',
    ferry: '<path d="M3 18a3 3 0 0 0 3-2 3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 3 2M5 15l1.5-5h11L19 15M9 10V6h6v4M12 3v3"/>',
    car:   '<path d="M5 17h14M6.5 17v2M17.5 17v2M4 13l1.6-4.4A2 2 0 0 1 7.5 7h9a2 2 0 0 1 1.9 1.6L20 13v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M7 13h.01M17 13h.01"/>',
    bus:   '<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M4 11h16M7 20v-2M17 20v-2M8 14h.01M16 14h.01"/>',
    other: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>',
    plus:  '<path d="M12 5v14M5 12h14"/>',
    down:  '<path d="M12 4v12M6 12l6 6 6-6M4 20h16"/>',
    up:    '<path d="M12 20V8M6 12l6-6 6 6M4 4h16"/>',
    warn:  '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
    bed:   '<path d="M3 18v-8M3 14h18v4M7 10h3a3 3 0 0 1 3 3v1M21 18v-4a3 3 0 0 0-3-3h-3"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  }
};
