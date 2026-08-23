/* Read-only snapshot (spec §12.1): a companion should be able to open the
   trip and look at it — no setup, no login, no writes. Because the app is
   already one self-contained file, the snapshot is that same file with the
   current data baked in and editing switched off. */

const Snapshot = {
  available() { return !!U.$('#jugni-data'); },

  build() {
    const clone = document.documentElement.cloneNode(true);

    /* Bake the live state in place of whatever was originally embedded. */
    const dataEl = clone.querySelector('#jugni-data');
    if (!dataEl) return null;
    dataEl.textContent = JSON.stringify(Store.state);
    dataEl.setAttribute('data-mode', 'readonly');

    /* Strip anything the running app rendered — the snapshot boots itself. */
    const app = clone.querySelector('#app');
    if (app) app.innerHTML = '';
    Array.prototype.forEach.call(clone.querySelectorAll('dialog.sheet, .toasts'),
      function (n) { n.remove(); });

    return '<!doctype html>\n' + clone.outerHTML;
  },

  download() {
    const html = Snapshot.build();
    if (!html) {
      UI.toast('Snapshots only work from the built single-file app.');
      return;
    }
    const primary = Trip.primaryTraveler();
    const nick = (primary && primary.nickname ? primary.nickname : 'trip')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-');
    Files.save(html, 'jugni-' + nick + '-snapshot.html', 'text/html');
    UI.toast('Snapshot saved — send it to anyone, no setup needed.');
  }
};
