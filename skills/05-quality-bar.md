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
- [ ] **Every column that can be zero still renders.** A figure that disappears
      when it is zero reads as a bug and hides what was never counted.
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
