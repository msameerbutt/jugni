/* Every mutation and flow the UI can trigger. Screens stay declarative;
   anything that changes data or opens a sheet lives here. */
import { html } from './lib/html.js';
import { Field } from './ui/components.js';
import { Icon } from './lib/icons.js';
import { openSheet, closeSheet, toast, confirmDestructive } from './ui/overlay.js';
import * as Store from './state/store.js';
import * as D from './state/derive.js';
/* No rate lookup here any more: the trip has one currency, so an amount the
   traveller types is already the home figure. Conversion survives only in
   `ui/components.js`, for records written before that was true. */
import { uid, todayISO, moneyText, titleCase, day, addDays, fmtDate, plural } from './lib/util.js';
import { save, pick } from './lib/files.js';
import { buildICS } from './lib/ics.js';
import { buildSnapshot } from './lib/snapshot.js';

const s = () => Store.getState();

/* Categories come from the catalogue so a new one needs no code change
   (feedback F4). */
export function categories() {
  const fromCatalogue = Store.getCatalogue().categories || [];
  const used = new Set(s().checklist.map((c) => c.category).filter(Boolean));
  const known = new Set(fromCatalogue.map((c) => c.id));
  return [
    ...fromCatalogue,
    ...[...used].filter((id) => !known.has(id))
      .map((id) => ({ id, label: titleCase(id.replace(/-/g, ' ')), icon: 'circle-dot', accent: 'slate' })),
  ];
}
export const categoryById = (id) => categories().find((c) => c.id === id)
  || { id, label: titleCase(String(id || 'general').replace(/-/g, ' ')), icon: 'circle-dot', accent: 'slate' };

/* The categories an expense can carry. Deliberately a short, closed list: a
   category the traveller has to invent is a category nothing else on the trip
   shares, and the breakdown stops being comparable. Category is optional —
   "— none —" is a real answer, and rolls up as Uncategorised. */
export const EXPENSE_CATEGORIES =
  ['food', 'transport', 'stay', 'activity', 'shopping', 'fees', 'other'];

export const cityOptions = () => [
  { value: '', label: '— none —' },
  ...D.citiesInOrder(s()).map((c) => ({ value: c.id, label: c.name })),
];

/* The trip's own currencies first: a traveller in Oslo should not scroll 150
   codes to reach NOK. */
export function currencyOptions() {
  const seen = new Set();
  const add = (c) => c && seen.add(c);
  add(s().trip.homeCurrency);
  s().expenses.forEach((e) => add(e.currency));
  s().stays.forEach((x) => add(x.currency));
  s().transport.forEach((t) => add(t.currency));
  ['EUR', 'USD', 'GBP', 'AUD', 'NOK', 'SEK', 'DKK', 'HUF', 'PLN', 'CZK', 'CHF', 'TRY', 'JPY']
    .forEach(add);
  return [...seen];
}

const lastCurrency = () => { try { return localStorage.getItem('jugni.lastCurrency') || ''; } catch { return ''; } };
const rememberCurrency = (c) => { try { localStorage.setItem('jugni.lastCurrency', c); } catch { /* ignore */ } };

/* ---------------------------------------------------------------- checklist */

export function toggleTask(id) {
  Store.mutate((d) => {
    const item = d.checklist.find((c) => c.id === id);
    if (!item) return;
    item.done = !item.done;
    item.completedDate = item.done ? todayISO() : null;
    Store.logEvent(d, 'task', 'checklist', id, `${item.done ? 'Done' : 'Reopened'}: ${item.task}`);
  });
}

function taskForm(item = {}, presetCity) {
  return () => html`
    <${Field} label="Task" name="task" value=${item.task} autofocus
              placeholder="e.g. Renew travel insurance" />
    <div class="formgrid">
      <${Field} label="Category" name="category" type="select"
                value=${item.category || 'general'}
                options=${categories().map((c) => ({ value: c.id, label: c.label }))} />
      <${Field} label="Due date" name="dueDate" type="date" value=${day(item.dueDate)} />
    </div>
    <${Field} label="City" name="cityId" type="select"
              value=${item.cityId ?? presetCity ?? ''} options=${cityOptions()} />`;
}

export function addTask(presetCity) {
  openSheet({
    title: 'Add a task',
    confirmLabel: 'Add task',
    render: taskForm({}, presetCity),
    onSubmit(v) {
      if (!v.task?.trim()) return;
      Store.mutate((d) => d.checklist.push({
        id: uid('task'), task: v.task.trim(), category: v.category || 'general',
        cityId: v.cityId || '', dueDate: v.dueDate || '', done: false, completedDate: null,
      }));
      toast('Task added');
    },
  });
}

export function editTask(id) {
  const item = s().checklist.find((c) => c.id === id);
  if (!item) return;
  openSheet({
    title: 'Edit task',
    render: taskForm(item),
    secondary: { label: 'Delete', icon: 'trash-2', onClick: () => deleteTask(id) },
    onSubmit(v) {
      Store.mutate((d) => {
        const rec = d.checklist.find((c) => c.id === id);
        if (!rec) return;
        Object.assign(rec, {
          task: v.task, category: v.category, cityId: v.cityId || '', dueDate: v.dueDate || '',
        });
      });
    },
  });
}

/* F3/F9: deletion names its subject, and stays undoable afterwards. */
export function deleteTask(id) {
  const item = s().checklist.find((c) => c.id === id);
  if (!item) return;
  confirmDestructive({
    title: 'Delete this task?',
    what: item.task,
    detail: item.source === 'default'
      ? 'This came from the standard checklist. Deleting it here removes it from this trip only.'
      : 'It will be removed from this trip.',
    onConfirm() {
      const undo = Store.mutateUndoable((d) => {
        d.checklist = d.checklist.filter((c) => c.id !== id);
        if (item.source === 'default') d.suppressed.push(id);
      });
      if (undo) toast('Task deleted', { label: 'Undo', onClick: undo });
    },
  });
}

/* ---------------------------------------------------------------- expenses */

/* An expense is one entity, with one shape, everywhere in the app.

   There is exactly one form and one table. A flight, a hotel room, a coffee
   and a museum ticket are all expenses — they differ in what is written in
   them, never in how they are recorded or how they are drawn. Anything that
   takes an amount and is not this form is a bug: three separate sheets is how
   a traveller ended up meeting three different ways to write down what
   something cost.

   The fields, in order, are the whole contract:

     Amount · Currency (stated, never asked) · Category · Where ·
     Whose cost · What for · Comment

   Date is here too. It is not on the traveller's list, but every expense
   already carries one, the table sorts on it and Today's log needs it — a
   form that cannot set it would leave a field only a rebuild could fix. */
function expenseForm(e = {}, presetDate) {
  const state = s();
  const home = state.trip.homeCurrency;
  const people = D.headcount(state);
  const split = Number(e.splitBetween) > 1 ? Number(e.splitBetween) : '';

  return () => html`
    <div class="formgrid formgrid--amount">
      <${Field} label="Amount" name="amount" type="number"
                step="0.01" min="0" inputmode="decimal" placeholder="0.00"
                value=${e.amount ?? 0} autofocus big
                hint="0 is fine — an expense with no figure yet is still an expense" />
      ${/* One trip, one currency (Trip data → Edit trip). Stated so the amount
            beside it has a unit, never asked, because a second currency on the
            screen is how the rows stopped adding up to the total. */ ''}
      <${Field} label="Currency" name="currency" type="static" value=${home || '—'}
                hint="from Trip data" />
    </div>

    <div class="formgrid">
      <${Field} label="Category" name="category" type="select"
                value=${e.category || ''}
                options=${[{ value: '', label: '— none —' },
                           ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: titleCase(c) }))]} />
      <${Field} label="Where" name="cityId" type="select"
                value=${e.cityId ?? (presetDate ? D.cityOn(state, presetDate)?.id : '') ?? ''}
                options=${cityOptions()} />
    </div>

    <div class="formgrid">
      <${Field} label="Whose cost" name="mine" type="select"
                value=${split ? 'split' : 'mine'}
                options=${[{ value: 'mine', label: 'All mine' },
                           { value: 'split', label: 'Split share' }]} />
      ${/* Defaults to the number of people on the trip, and can be overridden
            per expense: a room booked for two out of a party of five is a real
            case, and a fixed divisor reports a share that is simply wrong. */ ''}
      <${Field} label="Split between" name="splitBetween" type="number" min="1"
                value=${split || people}
                hint=${`${plural(people, 'traveller')} on this trip · ignored unless "Split share"`} />
    </div>

    <${Field} label="What for" name="label" value=${e.label}
              placeholder="dinner, taxi, museum tickets" />

    <div class="formgrid">
      <${Field} label="Date" name="date" type="date"
                value=${day(e.date) || presetDate || todayISO()} />
      <${Field} label="Comment" name="note" value=${e.note}
                placeholder="e.g. paid SEK 1,595 at the desk"
                hint="anything the fields above cannot hold" />
    </div>`;
}

/* `presetCity` is passed by a destination page's own table, so an expense
   added from Berlin is tagged Berlin without the traveller having to say so
   twice. Still a field on the form — a preset that cannot be corrected is a
   guess dressed as a fact. */
export function quickExpense(presetDate, presetCity) {
  openSheet({
    title: 'Add expense',
    confirmLabel: 'Save',
    render: expenseForm(presetCity ? { cityId: presetCity } : {}, presetDate),
    onSubmit: (v) => saveExpense(null, v),
  });
}

/* The only way to change an expense, whichever screen it was drawn on and
   whatever it happens to be a record of. A booking's fare is edited here too:
   it is an expense like any other, seeded at 0 when the document did not say
   what it cost. */
export function editExpense(id) {
  const e = s().expenses.find((x) => x.id === id);
  if (!e) return;
  const booking = D.bookingForExpense(s(), e);
  openSheet({
    title: 'Edit expense',
    confirmLabel: 'Save',
    detail: booking ? html`<strong>${booking.label}</strong>${
      booking.ref ? ` · ref ${booking.ref}` : ''}` : '',
    render: expenseForm(e),
    secondary: { label: 'Delete', icon: 'trash-2', onClick: () => deleteExpense(id) },
    onSubmit: (v) => saveExpense(id, v),
  });
}

/* Zero is a legitimate figure, not an empty box.

   Four flights on one ticket have one fare: the total goes on one leg and the
   others genuinely cost nothing. Refusing 0 left those legs asking forever,
   and it is also what every booking starts at before anyone has looked up
   what it cost. Only a blank field is "no answer", and a blank field means 0. */
function saveExpense(id, v) {
  const raw = String(v.amount ?? '').trim();
  const amount = raw === '' ? 0 : parseFloat(raw);
  if (!Number.isFinite(amount) || amount < 0) { toast('Enter an amount, or 0'); return; }

  const home = s().trip.homeCurrency;
  /* `amount` stays the figure that was charged; the share is derived from it.
     Storing the already-divided number instead meant opening an expense to
     edit it showed a division applied once, and saving applied it again. */
  const splitBetween = v.mine === 'split'
    ? Math.max(1, parseInt(v.splitBetween, 10) || 1) : 1;
  const share = Math.round((amount / splitBetween) * 100) / 100;
  const recordId = id || uid('exp');

  Store.mutate((d) => {
    const existing = d.expenses.find((x) => x.id === recordId);
    const base = {
      label: v.label || '', category: v.category || '',
      amount, currency: home, date: v.date || todayISO(), cityId: v.cityId || '',
      splitBetween, note: v.note || '',
      /* Same currency throughout, so the share IS the home figure and there is
         no rate to wait for. A record carrying a foreign currency from an
         older file keeps its own snapshot until it is edited. */
      homeAmount: share, homeCurrency: home,
      rateSnapshotDate: v.date || todayISO(),
    };
    if (existing) Object.assign(existing, base);
    else {
      d.expenses.push({ id: recordId, ...base });
      Store.logEvent(d, 'expense', 'expense', recordId,
        `Logged ${moneyText(share, home)} — ${base.label || base.category || 'expense'}`);
    }
  });
  toast(splitBetween > 1
    ? `Saved — your share is ${moneyText(share, home)} of ${moneyText(amount, home)}`
    : 'Saved');
}

export function deleteExpense(id) {
  const e = s().expenses.find((x) => x.id === id);
  if (!e) return;
  confirmDestructive({
    title: 'Delete this expense?',
    what: `${moneyText(e.amount, e.currency)}${e.label ? ` — ${e.label}` : ''}`,
    detail: D.bookingForExpense(s(), e)
      ? 'The booking itself stays on your itinerary — only this expense line goes.'
      : '',
    onConfirm() {
      const undo = Store.mutateUndoable((d) => { d.expenses = d.expenses.filter((x) => x.id !== id); });
      if (undo) toast('Expense deleted', { label: 'Undo', onClick: undo });
    },
  });
}
/* ------------------------------------------------------------------- notes */

const noteForm = (note = {}, presetCity) => () => html`
  <${Field} label="Title" name="title" value=${note.title} autofocus
            placeholder="e.g. Emergency numbers" />
  <${Field} label="Note" name="body" type="textarea" rows="5" value=${note.body} />
  <${Field} label="City" name="cityId" type="select"
            value=${note.cityId ?? presetCity ?? ''} options=${cityOptions()} />`;

export function addNote(presetCity) {
  openSheet({
    title: 'Add a note', confirmLabel: 'Add note', render: noteForm({}, presetCity),
    onSubmit(v) {
      if (!v.title?.trim()) return;
      Store.mutate((d) => d.destinationNotes.push({
        id: uid('note'), cityId: v.cityId || '', title: v.title.trim(), body: v.body || '',
      }));
      toast('Note added');
    },
  });
}

export function editNote(id) {
  const note = s().destinationNotes.find((n) => n.id === id);
  if (!note) return;
  openSheet({
    title: 'Edit note', render: noteForm(note),
    secondary: { label: 'Delete', icon: 'trash-2', onClick: () => deleteNote(id) },
    onSubmit(v) {
      Store.mutate((d) => {
        const rec = d.destinationNotes.find((n) => n.id === id);
        if (rec) Object.assign(rec, { title: v.title, body: v.body, cityId: v.cityId || '' });
      });
    },
  });
}

export function deleteNote(id) {
  const note = s().destinationNotes.find((n) => n.id === id);
  if (!note) return;
  confirmDestructive({
    title: 'Delete this note?', what: note.title,
    onConfirm() {
      const undo = Store.mutateUndoable((d) => {
        d.destinationNotes = d.destinationNotes.filter((n) => n.id !== id);
      });
      if (undo) toast('Note deleted', { label: 'Undo', onClick: undo });
    },
  });
}

/* F13: the fix for "worth knowing feels like a dead end" — turn a fact into
   something you are actually going to do. */
export function extraToTask(extraId) {
  const extra = s().extras.find((x) => x.id === extraId);
  if (!extra) return;
  openSheet({
    title: 'Turn this into a task',
    confirmLabel: 'Add task',
    render: () => html`
      <${Field} label="Task" name="task" value=${extra.title} autofocus />
      <div class="formgrid">
        <${Field} label="Category" name="category" type="select" value="booking"
                  options=${categories().map((c) => ({ value: c.id, label: c.label }))} />
        <${Field} label="Due date" name="dueDate" type="date" value="" />
      </div>
      <${Field} label="City" name="cityId" type="select" value=${extra.cityId || ''} options=${cityOptions()} />`,
    onSubmit(v) {
      if (!v.task?.trim()) return;
      Store.mutate((d) => d.checklist.push({
        id: uid('task'), task: v.task.trim(), category: v.category || 'booking',
        cityId: v.cityId || '', dueDate: v.dueDate || '', done: false, completedDate: null,
        note: `From "${extra.title}"`,
      }));
      toast('Added to your checklist');
    },
  });
}

/* -------------------------------------------------------------- trip / you */

export function editTrip() {
  const t = s().trip;
  openSheet({
    title: 'Trip settings',
    render: () => html`
      <${Field} label="Trip name" name="name" value=${t.name} autofocus />
      <div class="formgrid">
        <${Field} label="Start date" name="startDate" type="date" value=${day(t.startDate)} />
        <${Field} label="End date" name="endDate" type="date" value=${day(t.endDate)} />
      </div>
      <div class="formgrid">
        <${Field} label="Budget" name="budget" type="number" step="1" value=${t.budget} />
        <${Field} label="Home currency" name="homeCurrency" type="select"
                  value=${t.homeCurrency} options=${currencyOptions()} />
      </div>
      <${Field} label="Notes" name="notes" type="textarea" rows="3" value=${t.notes} />`,
    onSubmit(v) {
      Store.mutate((d) => Object.assign(d.trip, {
        name: v.name, startDate: v.startDate, endDate: v.endDate,
        budget: parseFloat(v.budget) || 0, homeCurrency: v.homeCurrency, notes: v.notes,
      }));
    },
  });
}

/* First open of a file, and the reload after Reset.

   Jugni has no account and no login, so this one dialog is the whole of "who
   is using this". It matters because the file is made to be forwarded: the
   same trip lands in five browsers, and each copy should know whose it is.

   Dismissable on purpose. Someone who just wants to look at a friend's trip
   should not have to fill in a form to get past the front door, and the app
   is entirely usable without it. */
export function welcome() {
  const state = s();
  const me = D.primaryTraveler(state) || {};
  const owner = me.nickname ? me.nickname.charAt(0).toUpperCase() + me.nickname.slice(1) : '';
  const tripName = state.trip.name || 'this trip';

  openSheet({
    title: owner ? `${owner}'s ${tripName}` : `Welcome to ${tripName}`,
    what: owner ? `Is that you?` : 'First, who are you?',
    detail: owner
      ? `Jugni put ${owner}'s name on this copy because they built it. If you are `
        + 'someone they sent it to, put your own details in — your copy becomes yours, '
        + `and ${owner} stays on the trip as a companion.`
      : 'Jugni keeps a nickname rather than a legal name, and these three fields '
        + 'are the only things it ever stores about a person.',
    confirmLabel: owner ? 'Save' : 'Start',
    render: () => html`
      <${Field} label="Nickname" name="nickname" value=${me.nickname} autofocus
                placeholder="what you want to be called" />
      <${Field} label="Email" name="email" type="email" value=${me.email}
                placeholder="so a shared copy knows whose it is"
                hint="stays in this file — never sent anywhere" />
      <${Field} label="Age" name="age" type="number" min="0" value=${me.age || ''}
                hint="optional — tailors packing and pace advice" />
      <p class="small muted">
        Everything stays in this browser. There is no account, and nothing leaves
        the file. You can change this any time under Trip data.
      </p>`,
    onSubmit(v) { applyIdentity(v, { fork: true }); },
  });
}

/* Shared by the welcome dialog and "About you".

   A blank field means "leave it alone", never "erase it" — the dialog opens
   pre-filled, so treating an untouched box as a deletion would quietly wipe
   details on any dismissal that submits.

   A genuinely different nickname means this is a fork (spec §12): the person
   who built the trip is demoted to companion rather than overwritten, or the
   trip would lose the one traveller who knows how it was put together. */
function applyIdentity(v, { fork = false } = {}) {
  const nickname = (v.nickname || '').trim();
  const email = (v.email || '').trim();
  const age = v.age === '' || v.age === undefined ? null : parseInt(v.age, 10);

  Store.mutate((d) => {
    let me = d.travelers.find((t) => t.role === 'primary');

    /* Handing the file to someone else is a fork: the person who built the
       trip becomes a companion rather than being overwritten (spec §12).

       This must only happen when the app has actually asked "who are you?" —
       on a first open or an import. Running it from "About you" turned a
       traveller correcting the spelling of their own name into two people:
       the old spelling demoted to companion, the new one added as primary.
       Editing yourself edits yourself. */
    const isSomeoneElse = fork && me?.nickname && nickname
      && me.nickname.trim().toLowerCase() !== nickname.toLowerCase();

    if (me && isSomeoneElse) {
      me.role = 'companion';
      me = null;
    }
    if (!me) {
      me = { id: uid('trav'), role: 'primary', personaProfiles: [], nickname: '', email: '', age: 0 };
      d.travelers.unshift(me);
    }

    if (nickname) me.nickname = nickname;
    if (email) me.email = email;
    if (age !== null && !Number.isNaN(age)) me.age = age;
  });
}

/* Edit anyone on the trip.

   Companions were read-only, which meant a name taken from a booking
   platform — often a legal name, sometimes misspelled by the platform —
   could never be corrected. They are people on the trip, not a derived list.

   Deleting is offered for companions only: removing the primary would leave
   the file with no owner and no way back. */
export function editTraveler(id) {
  const t = s().travelers.find((x) => x.id === id);
  if (!t) return;
  const isPrimary = t.role === 'primary';

  openSheet({
    title: isPrimary ? 'About you' : `About ${t.nickname || 'this traveller'}`,
    detail: isPrimary
      ? 'Jugni keeps a nickname rather than a legal name, and these three fields are the only things it stores about a person.'
      : 'A companion on this trip. Their own itinerary lives in their own copy — this is just what to call them here.',
    render: () => html`
      <${Field} label="Nickname" name="nickname" value=${t.nickname} autofocus
                placeholder="what they want to be called" />
      <${Field} label="Email" name="email" type="email" value=${t.email}
                hint="optional — stays in this file" />
      <${Field} label="Age" name="age" type="number" min="0" value=${t.age || ''}
                hint="optional" />`,
    secondary: isPrimary ? undefined
      : { label: 'Remove', icon: 'trash-2', onClick: () => removeTraveler(id) },
    onSubmit(v) {
      const nickname = (v.nickname || '').trim();
      const email = (v.email || '').trim();
      const age = v.age === '' || v.age === undefined ? null : parseInt(v.age, 10);
      Store.mutate((d) => {
        const rec = d.travelers.find((x) => x.id === id);
        if (!rec) return;
        /* A blank field leaves the value alone rather than erasing it — the
           form opens pre-filled, so an untouched box is not a deletion. */
        if (nickname) rec.nickname = nickname;
        if (email) rec.email = email;
        if (age !== null && !Number.isNaN(age)) rec.age = age;
      });
    },
  });
}

export function removeTraveler(id) {
  const t = s().travelers.find((x) => x.id === id);
  if (!t || t.role === 'primary') return;
  confirmDestructive({
    title: 'Remove this traveller?',
    what: t.nickname || 'This companion',
    detail: 'They are removed from this trip only. Anything booked in their name keeps '
      + 'their name on it — this does not touch bookings.',
    onConfirm() {
      const undo = Store.mutateUndoable((d) => {
        d.travelers = d.travelers.filter((x) => x.id !== id);
      });
      if (undo) toast(`${t.nickname || 'Traveller'} removed`, { label: 'Undo', onClick: undo });
    },
  });
}

export function addTraveler() {
  openSheet({
    title: 'Add a traveller',
    confirmLabel: 'Add',
    detail: 'Someone else on this trip. The itinerary stays yours — a companion gets '
      + 'their own editable copy by importing your exported file.',
    render: () => html`
      <${Field} label="Nickname" name="nickname" autofocus placeholder="what to call them" />
      <${Field} label="Email" name="email" type="email" hint="optional" />
      <${Field} label="Age" name="age" type="number" min="0" hint="optional" />`,
    onSubmit(v) {
      const nickname = (v.nickname || '').trim();
      if (!nickname) { toast('Give them a name'); return; }
      Store.mutate((d) => d.travelers.push({
        id: uid('trav'), role: 'companion', personaProfiles: [],
        nickname, email: (v.email || '').trim(),
        age: parseInt(v.age, 10) || 0,
      }));
      toast(`${nickname} added`);
    },
  });
}

export function editMe() {
  const me = D.primaryTraveler(s());
  if (me) { editTraveler(me.id); return; }
  /* No primary yet — that is the welcome dialog's job, not an edit. */
  welcome();
}

/* --------------------------------------------------------------- share (F5) */

export function share() {
  const state = s();
  const dated = D.datedItems(state).length;
  openSheet({
    title: 'Share this trip',
    confirmLabel: 'Done',
    render: () => html`
      <div class="rows">
        <div class="row">
          <${Icon} name="share-2" />
          <div class="row__body">
            <strong>Read-only snapshot</strong>
            <p class="small muted">One HTML file anyone can open and browse. Nothing to set up,
            nothing they can change.</p>
          </div>
          <button type="button" class="btn" onClick=${downloadSnapshot}>Save</button>
        </div>
        <div class="row">
          <${Icon} name="download" />
          <div class="row__body">
            <strong>Forkable copy</strong>
            <p class="small muted wrap-anywhere">Exports <span class="tkt">${Store.exportName()}</span>.
            Whoever imports it gets their own independent Jugni for this trip.</p>
          </div>
          <button type="button" class="btn" onClick=${exportTrip}>Export</button>
        </div>
        <div class="row">
          <${Icon} name="calendar-days" />
          <div class="row__body">
            <strong>Calendar reminders</strong>
            <p class="small muted">${dated} dated items — departures, check-ins, cancellation
            deadlines — as an <span class="tkt">.ics</span> your phone can remind you about.</p>
          </div>
          <button type="button" class="btn" onClick=${exportICS} disabled=${!dated}>Export</button>
        </div>
      </div>`,
  });
}

export async function exportTrip() {
  const name = Store.exportName();
  const text = Store.exportJSON();
  if (await shareFile(text, name, 'application/json')) return;
  save(text, name, 'application/json');
  toast(`Exported ${name}`);
}

export function exportICS() {
  const items = D.datedItems(s());
  if (!items.length) { toast('Nothing dated to export yet'); return; }
  const name = `jugni-${(s().trip.name || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
  save(buildICS(items, s().trip.name), name, 'text/calendar');
  toast(`${items.length} items exported — open the file to add them`);
}

/* One task, straight into the phone's calendar (spec §12).

   The whole-trip export is the right tool the week before departure and the
   wrong one for "remind me about this specific thing" — it hands over forty
   events when the traveller wanted one. `buildICS` already takes any list, so
   a single item costs nothing extra.

   Not `hide-readonly`: someone reading a shared snapshot has every reason to
   put a cancellation deadline in their own calendar, and doing so changes
   nothing about the trip. */
export function taskToCalendar(id) {
  const task = s().checklist.find((c) => c.id === id);
  if (!task) return;
  if (!task.dueDate) { toast('That task has no due date to put in a calendar'); return; }

  openSheet({
    title: 'Add to your calendar',
    what: task.task,
    detail: `Due ${fmtDate(task.dueDate)}`,
    confirmLabel: 'Done',
    render: () => html`
      <div class="rows">
        <div class="row">
          <${Icon} name="external-link" />
          <div class="row__body">
            <strong>Google Calendar</strong>
            <p class="small muted">Opens Google with the event already filled in — you just
            press save. Needs a connection, and the task title goes to Google.</p>
          </div>
          <button type="button" class="btn btn--primary"
                  onClick=${() => { closeSheet(); openInGoogleCalendar(task); }}>Open</button>
        </div>
        <div class="row">
          <${Icon} name="download" />
          <div class="row__body">
            <strong>Calendar file</strong>
            <p class="small muted">An <span class="tkt">.ics</span> any calendar understands —
            Apple, Outlook, Google. Works with no connection at all.</p>
          </div>
          <button type="button" class="btn"
                  onClick=${() => { closeSheet(); saveTaskICS(task); }}>Download</button>
        </div>
      </div>`,
  });
}

/* Google's own "create event" template. A link out, not a fetch: nothing is
   loaded from Google to render this app, so the file stays self-contained and
   still opens from file:// with the network off (spec §8). What it does cost
   is a connection at the moment you tap it, and the task title travelling to
   Google — which is why it is offered beside the .ics rather than replacing
   it. Apple and Outlook users, and anyone on hostel wifi, still need that. */
function openInGoogleCalendar(task) {
  const start = day(task.dueDate).replace(/-/g, '');
  /* All-day events take DATE values with an EXCLUSIVE end, so a one-day task
     ends the following morning. Passing the same date twice renders a blank
     event in Google. */
  const end = addDays(day(task.dueDate), 1).replace(/-/g, '');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: task.task || 'Trip task',
    dates: `${start}/${end}`,
    details: [s().trip.name && `From ${s().trip.name}`, task.note]
      .filter(Boolean).join('\n\n'),
  });
  const url = `https://calendar.google.com/calendar/render?${params}`;

  const win = globalThis.open?.(url, '_blank', 'noopener,noreferrer');
  if (!win) toast('Your browser blocked the popup — allow it, or download the file instead');
}

async function saveTaskICS(task) {
  const item = {
    kind: 'checklist', id: task.id, title: task.task,
    date: task.dueDate, allDay: true,
  };
  const text = buildICS([item], s().trip.name);
  const name = `jugni-${(task.task || 'task').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task'}.ics`;

  /* The share sheet is what actually shows "Add to Calendar" on a phone.
     Downloading is the desktop fallback. */
  if (await shareFile(text, name, 'text/calendar')) return;
  save(text, name, 'text/calendar');
  toast('Calendar file saved — open it to add the reminder');
}

export function downloadSnapshot() {
  const htmlText = buildSnapshot(s());
  if (!htmlText) { toast('Snapshots only work from the built single-file app.'); return; }
  const nick = (D.primaryTraveler(s())?.nickname || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  save(htmlText, `jugni-${nick}-snapshot.html`, 'text/html');
  toast('Snapshot saved — send it to anyone, no setup needed.');
}

/* The native share sheet where the browser has one: that is what puts a trip
   into WhatsApp without a download step. */
async function shareFile(text, filename, type) {
  try {
    const file = new File([text], filename, { type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: s().trip.name || 'My trip' });
      return true;
    }
  } catch { /* user dismissed, or sharing unsupported — fall back to download */ }
  return false;
}

export function importTrip() {
  pick('.json,application/json', (text, name) => {
    const res = Store.importJSON(text);
    if (!res.ok) { toast(res.error); return; }
    toast(`Imported ${name}`);
    /* An imported file is somebody else's trip until the person holding it
       says who they are — same question as a first open, so ask it the same
       way rather than in a sheet titled "About you". */
    if (Store.takeForkFlag()) welcome();
  });
}

/* Two things were hiding under one button. "Clear" restored the built version
   on reload — the thing most people actually want — while sounding like it
   deleted everything (feedback cycle 02, C3). */
export function resetToBuilt() {
  const stats = D.checklistStats(s());
  confirmDestructive({
    title: 'Reset to the trip as built?',
    what: s().trip.name || 'This trip',
    detail: `Discards every change made in this browser since the file was generated — `
      + `${stats.done} completed task${stats.done === 1 ? '' : 's'}, `
      + `${s().expenses.length} expense${s().expenses.length === 1 ? '' : 's'}, `
      + `and any edits. The trip returns to exactly how it was built. `
      + `Export first if you want to keep the current version.`,
    confirmLabel: 'Reset it',
    onConfirm: Store.reset,
  });
}

/* The way back from a clear. Always available while the file carries a baked
   trip, so an accidental clear is an inconvenience rather than a loss. */
export function restoreBuilt() {
  confirmDestructive({
    title: 'Restore the trip built into this file?',
    what: 'Replaces whatever is in this browser now',
    detail: 'Loads the trip exactly as it was generated. Anything you have '
      + 'changed since then in this browser is replaced.',
    confirmLabel: 'Restore it',
    onConfirm() {
      if (Store.restoreBuilt()) toast('Trip restored from the built file');
      else toast('This file has no trip baked into it — use Import instead.');
    },
  });
}

export function clearEverything() {
  confirmDestructive({
    title: 'Clear everything?',
    what: s().trip.name || 'This trip',
    detail: Store.hasBaked()
      ? 'Empties this browser copy. The trip stays inside this file, so you can '
        + 'put it back any time with "Restore the trip built into this file".'
      : 'Empties this browser copy completely. This file has no trip baked into '
        + 'it, so nothing can be restored — export first.',
    confirmLabel: 'Clear everything',
    onConfirm: Store.clearAll,
  });
}
