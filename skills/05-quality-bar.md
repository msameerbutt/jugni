---
name: jugni-quality-bar
description: The check to run against a generated Jugni before handing it over — "looks amateur" is a defect, checked the same way the data being correct is checked. Read before telling anyone their app is ready.
---

# Quality bar

The generated app must read as **professionally built**. This is an instruction,
not a hope (spec §2). Check your own output against it the same way you check
that the data is right.

## Check the output, not the intention

Open the built file. Actually look at it. Then:

### Run the harness first

```
make check TRIP=<slug>
```

It parses the bundle, then runs the built file in jsdom with `fetch` stubbed to
reject — so the offline path is what gets tested. It has caught a nav link with
no `aria-current`, five icons that would have shipped as empty boxes, and a
crash on a missing `matchMedia`. A green build is not evidence; a green check
is. Everything below is what the harness cannot judge.

### Design
- [ ] Typography does three distinct jobs: condensed grotesk for headers,
      humanist sans for body/UI, mono **only** for real ticket data — times,
      dates, prices, confirmation numbers. Mono on a paragraph of prose is a bug.
- [ ] The palette holds its roles in both themes: brass = progress/done/CTA,
      transit-blue = links and "you are here", rust = **alerts only**. A rust
      element that is not an alert is a bug.
- [ ] **The two palettes never mix (§11).** Categorical hues carry identity —
      section rules, icons, chips. If a categorical hue has landed on a button,
      a meter or anything that acts, that is a bug.
- [ ] **No text wraps badly.** Card titles are short enough not to orphan a
      word; booking refs, addresses and URLs do not widen their container.
      Check at a narrow viewport, not just a wide one.
- [ ] **An expense is one entity.** One form, one table, one row shape,
      everywhere in the app. A flight, a hotel room, a coffee and a museum
      ticket are the same kind of record; they differ in what is written in
      them, never in how they are written or drawn.

      This took **three rounds of the same feedback** to land, because each
      round fixed the forms that were obviously alike and left the one filed
      mentally under a different heading. First there were three sheets; then
      two agreed and "Add the price" kept a currency picker on a one-currency
      trip; then the forms matched but the screen still had five sections
      showing overlapping subsets of the same money — "Flights and travel",
      "Bookings not in your spend", "Your share, not logged yet", "By
      category", "All expenses" — each with a different control on it.

      The rules that settle it:

      - **The field list is the contract.** Amount · Currency (stated, never
        asked) · Category · Where · Whose cost · Split between · What for ·
        Date · Comment. Identical from every entry point. If a field would be
        wrong for one kind of expense, it is wrong for the entity.
      - **0 is a figure, not a blank.** Every booking is seeded as a real
        expense row at build time, at 0 when the document never stated a fare.
        It sits in the table asking to be filled in. There is no "no fare
        recorded" state, no warning panel listing the same rows again, and no
        button that appears only while a field is empty.
      - **Editing a row is the only way to change money.** No "Add the price",
        no "Add my share", no "Save price". A pencil and a bin, on every row,
        with no row exempt.
      - **Bookings are still bookings.** Deleting the expense must not read as
        deleting the flight; say so in the confirmation.
      - **Every total goes through one reduction.** The budget, the category
        breakdown, a destination's headline and the table's own footer are the
        same money — compute them from one function, or two of them will
        disagree and the traveller will not know which to believe.
      - **A column that has to add up keeps its cents.** Rounding a headline
        figure to whole units is good typography; doing it to a total under a
        column of cents makes the table visibly not add up.
      - **Count the doors, and fail when one is unreachable.** Enumerate every
        control that takes an amount — on every screen, including a
        destination page's own table — open each, and compare field lists. A
        door the test cannot reach is a door it cannot vouch for.
- [ ] **Anything a person typed, a person can retype.** Prices, names, dates,
      notes — if the app accepted a value once it must accept a correction,
      and the control cannot appear only while the field is empty. A figure
      entered as an estimate or a placeholder is the normal case, not the
      exception.
- [ ] **Editing a thing edits that thing.** Rename a traveller, a task, a
      booking — the count before and after must match. A rule that belongs to
      one flow (a fork replaces the owner) applied to another (correcting your
      own spelling) turns one person into two, and the app looks right the
      whole time. Share the form; do not share the consequence.
- [ ] **Nothing disappears because it has been answered.** A booking with a
      price, a leg costing nothing, a task ticked off — these are states to
      show, not reasons to remove the row. Twice now a "stop nagging about
      this" fix has been built as "hide it", which also removes the only place
      the traveller could correct it. Quiet it down; do not delete it.
- [ ] **Every column that can be zero still renders.** A figure that disappears
      when it is zero reads as a bug and hides what was never counted.
- [ ] **Two destination pages have the same sections.** Open the shortest stop
      and the longest one side by side. Same five facts, same panels, content
      within the same order of magnitude. A page that is thin because nobody
      researched it looks identical to one that is thin because there is
      nothing there — and only one of those is acceptable.
- [ ] **No section repeats the one above it.** A note and a panel card saying
      the same thing costs two screens on a phone to say it once. Read a whole
      destination page top to bottom before shipping it.
- [ ] **A carousel needs something to scroll.** One or two cards behind a
      horizontal swipe is a gesture for nothing, and it squeezes a list into a
      narrow column. Stack them.
- [ ] **Every screen is reachable on a phone.** Count the tab bar against the
      narrowest width you support. Tabs that overflow into a hidden horizontal
      scroll are tabs nobody finds — the last one especially. Tools that act on
      the file rather than move you around it (share, trip data) belong at the
      top as icons, not as extra rows competing with the screens.
- [ ] **A one-line fact does not get a whole card.** Emergency number, plug
      type, tipping: on a phone these belong in a strip where all of them are
      visible at once. A carousel that spends a screen on "Type C, 230V" and
      hides the next fact behind a swipe is the defect, not the content.
- [ ] It does not look like either AI default: warm cream + terracotta serif, or
      near-black + one acid accent.
- [ ] The Overview is the manifest thread — one connected route line of ticket
      stubs. If it has become a grid of cards, it is wrong.
- [ ] It feels like an app with pages, not one long scroll: persistent nav,
      distinct views, a real transition between them.

### Behaviour
- [ ] Opening it on a trip date lands on **Today**; before the trip, Upcoming;
      after `endDate`, Recap.
- [ ] **Ticking a checklist item is visible.** It should strike through, hold,
      then collapse away — with an Undo. An item that simply vanishes is the
      defect this replaced.
- [ ] **Anything destructive names its subject** and offers Undo afterwards.
      "Are you sure?" with no subject is how people delete the wrong thing.
- [ ] **Share is reachable from every screen**, mobile included.
- [ ] Every live widget shows a "last updated" stamp, and shows cached data
      rather than breaking when offline.
- [ ] A first run with no network shows "not yet available — connect once to
      fetch", never a blank or a spinner forever.
- [ ] Quick-capture an expense is genuinely two taps from Today.
- [ ] Export produces `output-<nickname>.json`; importing it elsewhere produces
      a working independent copy.

### Accessibility — for everyone, not one profile (spec §8)
- [ ] Tab through the whole app. Every control is reachable, focus is visible.
- [ ] Every icon-only button has a label.
- [ ] Route changes are announced.
- [ ] `prefers-reduced-motion` kills the transitions.
- [ ] Contrast holds in **both** themes.

### The file itself
- [ ] Opens from `file://` with the network off.
- [ ] No CDN link, no remote font, no external image anywhere in the output.
- [ ] `grep -c 'https\?://' output.html` finds only the API endpoints the live
      widgets call — nothing that must resolve for the page to *render*.

## Data quality is part of looking professional

- [ ] No placeholder text, no `undefined`, no empty section with a heading.
- [ ] Every screen has a real empty state that says what to do next.
- [ ] Dates render in the local time of the place they refer to.
- [ ] Money shows the currency actually charged.

## If something fails

Fix it. Do not ship it with a note explaining the flaw — that is how a tool
starts feeling like a template.
