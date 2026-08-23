/* Reusable render helpers. Screens compose these rather than reinventing
   markup, so one visual decision changes in one place. */

const UI = {
  toast(msg) {
    let host = U.$('.toasts');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toasts';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  },

  empty(title, body, action) {
    return '<div class="empty">' +
      '<p class="empty__title">' + U.esc(title) + '</p>' +
      (body ? '<p class="small">' + U.esc(body) + '</p>' : '') +
      (action || '') +
      '</div>';
  },

  meter(pct, over) {
    return '<div class="meter" role="presentation">' +
      '<div class="meter__fill' + (over ? ' meter__fill--over' : '') +
      '" style="width:' + Math.max(0, Math.min(100, pct)) + '%"></div></div>';
  },

  stat(value, label) {
    return '<div class="stat"><span class="stat__value tkt">' + U.esc(value) +
      '</span><span class="stat__label">' + U.esc(label) + '</span></div>';
  },

  modeIcon(mode) {
    const map = { flight: 'plane', train: 'train', ferry: 'ferry', car: 'car', bus: 'bus' };
    return U.icon(map[mode] || 'other', 15);
  },

  badge(text, kind) {
    return '<span class="badge' + (kind ? ' badge--' + kind : '') + '">' + U.esc(text) + '</span>';
  },

  /* A modal sheet. Quick-capture and every edit form uses this one. */
  sheet(opts) {
    const old = U.$('dialog.sheet');
    if (old) old.remove();

    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML =
      '<form method="dialog" class="sheet__form">' +
        '<div class="sheet__head">' +
          '<h2 class="card__title">' + U.esc(opts.title) + '</h2>' +
          '<button class="btn btn--ghost" value="cancel" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="sheet__body">' + opts.body + '</div>' +
        '<div class="sheet__foot">' +
          '<button class="btn" value="cancel">Cancel</button>' +
          '<button class="btn btn--primary" value="ok">' + U.esc(opts.confirm || 'Save') + '</button>' +
        '</div>' +
      '</form>';

    document.body.appendChild(dlg);

    dlg.addEventListener('close', function () {
      if (dlg.returnValue === 'ok' && opts.onSave) {
        const data = {};
        U.$$('[name]', dlg).forEach(function (f) {
          data[f.name] = f.type === 'checkbox' ? f.checked : f.value;
        });
        opts.onSave(data);
      }
      dlg.remove();
    });

    dlg.showModal();
    const first = U.$('[data-autofocus]', dlg) || U.$('input,select,textarea', dlg);
    if (first) first.focus();
    return dlg;
  },

  confirm(message, onYes) {
    UI.sheet({
      title: 'Are you sure?',
      body: '<p>' + U.esc(message) + '</p>',
      confirm: 'Yes, do it',
      onSave: onYes
    });
  },

  field(label, name, opts) {
    opts = opts || {};
    const id = 'f_' + name;
    let control;
    if (opts.type === 'select') {
      control = '<select class="select" id="' + id + '" name="' + name + '">' +
        (opts.options || []).map(function (o) {
          const val = o.value !== undefined ? o.value : o;
          const lbl = o.label !== undefined ? o.label : o;
          return '<option value="' + U.esc(val) + '"' +
            (String(val) === String(opts.value) ? ' selected' : '') + '>' + U.esc(lbl) + '</option>';
        }).join('') + '</select>';
    } else if (opts.type === 'textarea') {
      control = '<textarea class="textarea" id="' + id + '" name="' + name + '" rows="' +
        (opts.rows || 4) + '">' + U.esc(opts.value || '') + '</textarea>';
    } else {
      control = '<input class="input' + (opts.type === 'number' ? ' input--num' : '') +
        '" id="' + id + '" name="' + name + '" type="' + (opts.type || 'text') + '"' +
        (opts.step ? ' step="' + opts.step + '"' : '') +
        (opts.min !== undefined ? ' min="' + opts.min + '"' : '') +
        (opts.placeholder ? ' placeholder="' + U.esc(opts.placeholder) + '"' : '') +
        (opts.autofocus ? ' data-autofocus' : '') +
        ' value="' + U.esc(opts.value === 0 ? '0' : (opts.value || '')) + '">';
    }
    return '<div class="field"><label for="' + id + '">' + U.esc(label) + '</label>' + control + '</div>';
  },

  /* Renders an `extras` record through its displayHint (spec §4) so
     unmodeled data still looks native rather than a dumped text block. */
  extra(rec) {
    const hint = rec.displayHint === 'auto' || !rec.displayHint
      ? UI.inferHint(rec.content) : rec.displayHint;
    let body;

    if (hint === 'list') {
      const items = String(rec.content).split(/\r?\n/).filter(Boolean);
      body = '<ul class="rows">' + items.map(function (i) {
        return '<li class="row"><div class="row__body">' +
          U.esc(i.replace(/^[-*•]\s*/, '')) + '</div></li>';
      }).join('') + '</ul>';
    } else if (hint === 'table') {
      const rows = String(rec.content).split(/\r?\n/).filter(Boolean).map(function (l) {
        return l.split(/\s*[:|]\s*/);
      });
      body = '<div class="scroll-x"><table class="table"><tbody>' + rows.map(function (cells) {
        return '<tr>' + cells.map(function (c, i) {
          return i === 0 ? '<th scope="row">' + U.esc(c) + '</th>' : '<td>' + U.esc(c) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
    } else if (hint === 'link') {
      const url = String(rec.content).trim();
      body = '<a class="btn" href="' + U.esc(url) + '" target="_blank" rel="noopener noreferrer">' +
             U.esc(url.replace(/^https?:\/\//, '').slice(0, 48)) + ' ↗</a>';
    } else {
      body = '<p class="note-body">' + U.esc(rec.content) + '</p>';
    }

    return '<article class="card notecard">' +
      '<h3 class="card__title">' + U.esc(rec.title) + '</h3>' + body + '</article>';
  },

  inferHint(content) {
    const s = String(content || '').trim();
    if (/^https?:\/\/\S+$/.test(s)) return 'link';
    const lines = s.split(/\r?\n/).filter(Boolean);
    if (lines.length > 1 && lines.every(function (l) { return /^[^:|]+[:|]/.test(l); })) return 'table';
    if (lines.length > 1) return 'list';
    return 'text';
  }
};
