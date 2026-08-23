# Cycle 01 — review

**Received:** 2026-08-23 · **Items:** 17 · **Status:** awaiting decisions

Item numbers below (F1–F17) are mine; the original file numbers restart and
repeat 15, so a stable key is needed to track what shipped against what. The
mapping is in the table.

Every observation in this cycle checks out against the code. Nothing here was
a misreading of the app — F3, F8, F15 and F16 in particular describe real
defects I should have caught before handing it over.

| Key | Original | Item | Verdict |
|---|---|---|---|
| F1 | ¶1 | Dark theme too monotonous | Conflicts with spec §11 — needs a decision |
| F2 | 2 | Checked items vanish instantly | Confirmed defect, architecture-bound |
| F3 | 3 | No delete on checklist | Confirmed omission |
| F4 | 4 | `default.json` of standard data | Architectural — needs decisions |
| F5 | 5 | Share should be global | Straightforward |
| F6 | 6 | Date picker on Today | Straightforward, one behaviour question |
| F7 | 7 | Route summary box poorly designed | Confirmed, agreed |
| F8 | 8 | Cities missing the spent column | Confirmed — but the cause is deeper |
| F9 | 9 | Add/delete task on city page | Straightforward |
| F10 | 10 | TripAdvisor / things happening | Blocked by the no-key rule — options below |
| F11 | 11 | Swipe carousel for Good to know | Straightforward |
| F12 | 12 | Collapsible sections (opinion asked) | Opinion below |
| F13 | 13 | Worth knowing feels like a dead end | Suggestion below |
| F14 | 14 | Icon and flag sets (resources asked) | Recommendations below |
| F15 | 15a | Expense block design, `A$` vs `AUD` | Confirmed defect |
| F16 | 15b | Wrapped text hurts readability | Confirmed defect |
| F17 | ¶last | Modern JS, ultra professional level | Gates most of the rest |

---

## F17 — "Use modern JS interface" (read this first)

This one decides how expensive everything else is, so it goes first.

**Why the current code produces the symptoms you're reporting.** The app
renders by rebuilding `innerHTML` for the whole view on every state change.
That single choice causes F2 directly: when you tick an item, the DOM node you
ticked is destroyed and replaced, so there is nothing left to animate. It also
makes F11 (carousel scroll position), F12 (which sections are open), and F6
(date-driven view) each need their own manual state-preservation hack. Four
symptoms, one root cause.

Patching them individually means four hacks that fight each other. Fixing the
root cause makes all four fall out naturally.

**What "modern" can mean here, given spec §8** — still one self-contained
file, still no CDN, still opens from `file://` offline:

- **Preact + htm, bundled** (~5 KB gzipped). Real components, keyed diffing,
  hooks. Ticking an item updates one node instead of rebuilding the page, so
  exit animations, open/closed state and scroll position all survive for free.
  Layer the View Transitions API on top and route changes get the genuine
  page-navigation feel spec §1 asks for.
- **Modern vanilla** — ES2022 modules, a small signals store, targeted DOM
  updates. No runtime dependency, but we write and maintain the diffing
  ourselves, which is the part that is easy to get subtly wrong.
- **Lit** (~6 KB) — web components. Good fit, slightly more ceremony.
- **Patch in place** — cheapest now, most expensive by cycle 3.

**My recommendation: Preact + htm.** 5 KB inside a 122 KB file is not a real
cost, and it is the option where F2, F6, F11 and F12 stop being special cases.
It needs `esbuild` added to the tooling image (a single binary — the Docker
rule is unaffected) and a rewrite of the 12 screen modules. The data layer,
build pipeline, skills and verification harness are untouched.

**Cost:** roughly a day of work, and every screen gets re-verified through the
existing `make check` smoke test, so regressions surface immediately.

---

## F1 — Dark theme too monotonous

**The conflict, stated plainly.** Spec §11 deliberately fixes three colour
roles — brass = progress/done/CTA, transit-blue = links and "you are here",
rust = alerts only — and says switching theme must never change what a colour
*means*. I implemented that faithfully, which is exactly why it reads as
monotonous: three hues, all doing semantic work, none doing identity work.

**This is a real gap in the spec, not a mistake in either direction.** The spec
never said how a user tells Checklist from Expenses at a glance.

**The professional resolution** is not to loosen the semantic roles — that is
how you end up with a red button that means nothing. It is to add a *second,
separate* palette that carries identity rather than meaning:

- **Semantic colours stay untouched and rare.** Brass still means progress.
  Rust still means "this is overdue", and appears nowhere else.
- **A categorical palette gets added** for section identity: each screen and
  each checklist category gets its own hue, used on the section header rule,
  the icon, and the category chip — never on a control that does something.

That gives you a colourful, navigable app where colour still tells the truth.
Deeper surfaces and real elevation in dark mode help as much as hue does — the
current dark theme is flat, which reads as cheap regardless of palette.

**Needs your call** on how far to go — see the questions.

---

## F2 — Checked items vanish instantly

Confirmed. Cause is F17. Once diffing is in place: tick → the row strikes
through, holds ~400 ms so the change registers, then collapses its own height
and fades out. An **Undo** appears in the toast for a few seconds, because the
tap target is small and mis-taps happen on a phone.

`prefers-reduced-motion` will cut the motion and keep the delay, so the item
still visibly changes state before leaving.

---

## F3 — No delete on the checklist

Correct, and an omission on my part — add and edit exist, delete does not.
Landing: delete inside the edit sheet (destructive actions belong behind the
edit affordance, not on the row where a mis-tap is one pixel away), plus swipe-
to-delete on mobile. Confirmation as described in F9.

---

## F4 — `default.json`

Good idea, and it fixes something real: right now every trip's checklist is
invented from scratch by the agent, so "pack a shaver" is remembered only if
the agent happens to think of it. A standard base makes the floor consistent.

**Model I'd propose.** `default.json` is a *catalogue*, not a trip:

```
categories[]      id, label, icon, colour, order
checklistDefaults[]  category, task, appliesTo (always | persona | climate | ...)
```

At build time: defaults are instantiated into the trip, tagged
`source: "default"`, then `input.json` is merged on top. `input.json` can add
and can mark a default as not-applicable, but cannot redefine a category or
silently rewrite a default's text — which is the "not editable by input.json"
property you asked for.

In the running app the user can tick, edit or delete any instantiated item.
That is a local edit to *their* copy, not a change to the catalogue — so the
catalogue stays authoritative while their list stays theirs.

**Three things I need decided** — see questions. In short: whether defaults are
filtered by persona; whether a user can delete a default *category*; and where
the catalogue lives in the repo.

**Icons: do not embed images.** You suggested putting icon images in
`default.json`. I'd push back — base64 PNGs would add hundreds of KB, look
wrong at some sizes and cannot follow the theme. The right approach is an
**inline SVG sprite**: every icon defined once as a `<symbol>` in a hidden
`<svg>` at the top of the document, referenced by `<use href="#icon-name">`.
About 300–600 bytes per icon, sharp at every size, inherits `currentColor`, and
still fully self-contained and offline. `default.json` then stores an icon
*name* per category, never image data. See F14 for which set.

---

## F5 — Share should be global

Agreed. Landing: a share control in the nav rail footer on desktop and in the
header on mobile, available from every screen, opening one sheet with all three
paths — read-only snapshot, forkable export, and `.ics`. Web Share API where
the browser supports it (that gives you the native WhatsApp/AirDrop sheet on a
phone), with download as the fallback.

---

## F6 — Date picker on Today

Agreed and easy once F17 lands. A compact date strip — a week of dates,
scrollable, today marked — plus a picker for jumping further. Landing on the
app always starts at the real today.

One behaviour question in the list below: whether logging an expense while
viewing another date should use the viewed date or today's.

---

## F7 — Route summary box

Agreed, and the specific mistake is visible in the code: I put two unrelated
numbers into one stat as `"11 · 9"` with the label `"cities · legs"`. That is
not a stat, it is two stats jammed together to save space. It will be rebuilt
as separate, properly weighted figures with the budget meter given real room.

---

## F8 — Cities missing the spent column

You are right that the column disappears, and right that it should show `$0`
rather than vanish — that is a one-line fix.

**But the deeper cause is worth stating, because it affects the numbers you
see.** Accommodation cost is not missing; it is stored on the booking
(`stays[].cost`) and not in `expenses[]`, and only `expenses[]` feeds "Spent".
That is deliberate: your Berlin, Copenhagen and Budapest bookings are **group
totals for 5 people**, and adding AUD 687 to your personal spend against a
personal AUD 2,282 budget would be wrong by roughly 5×.

So the honest fix is two things, not one: always render the column, *and* give
you a way to turn a group booking into your share. Options in the questions.

Right now, for your trip, "Spent" correctly shows only the three flights you
personally paid for (AUD 513 of AUD 2,282).

---

## F9 — Add and delete task on the city page

Agreed. Add button in the section header, pre-filled with that city. Delete via
the edit sheet, with a confirmation naming the task — *"Delete 'Book the fjord
day trip'? This can't be undone."* — never a bare "Are you sure?". Undo in the
toast afterwards.

---

## F10 — TripAdvisor / things happening in the city

**TripAdvisor is not possible here, and I'd rather say so than half-build it.**
Their API needs a key, and a Jugni file is designed to be forwarded to friends —
any key baked into it is a published key, revoked within days. Spec §8's
"free, no-key APIs" rule exists for exactly this.

What *is* possible without a key:

- **Wikivoyage** — an actual travel guide, CORS-enabled, no key. Has See / Do /
  Eat / Drink / Stay sections per city, openly licensed. Best fit by far.
- **Wikipedia geosearch** — landmarks near a coordinate, no key.
- **OpenStreetMap / Overpass** — POIs by category near you. No key, but raw
  data that needs presenting carefully.
- **Dated events** (concerts, festivals) — realistically needs Ticketmaster or
  similar, all keyed. No good keyless source exists. What we *can* do is have
  the Convert Skill research festivals and seasonal events at build time and
  write them into `extras[]` — which is how "aurora season starts mid-September"
  got into your Abisko notes already.

**Recommendation:** pull Wikivoyage See/Do at **build time** into each city, so
it works offline and needs no runtime call; add Overpass "what's near me" as a
live widget only if you want it.

---

## F11 — Swipe carousel for Good to know

Agreed. Built as a scroll-snap carousel — real horizontal scrolling, so it
works with touch, trackpad, arrow keys and visible prev/next buttons, with dot
indicators. Not a touch-only widget; those strand desktop users.

---

## F12 — Collapsible sections (you asked my opinion)

**Yes, with three conditions.** The city page is genuinely too long and
collapsing is the right instinct.

1. **Open what matters, not just the first one.** During the trip, the section
   relevant *today* should be the one that's open. Mechanically opening section
   one means a traveller standing at a station opens the app and sees "dates".
2. **Remember per section, per city**, in `localStorage`. Re-collapsing the
   same section every visit is worse than no collapsing.
3. **Never collapse an alert.** An overdue task or a cancellation deadline
   inside a collapsed section is a section that hid the one thing that mattered.

Expand-all / collapse-all in the page header, as you suggested. Section headers
become real `<button>`s with `aria-expanded`, so keyboard and screen-reader
users get it too.

---

## F13 — "Worth knowing" is a dead end (you asked for suggestions)

Agreed, and the diagnosis is right: it presents facts and offers nothing to do
with them. Three fixes, cheapest first:

1. **Give extras links.** Add an optional `links[]` to the `extras` schema, and
   have the Convert Skill fill it at build time — official site, Wikivoyage
   page, a maps deep link. Your "Oslo to Flåm road trip" note should link the
   Flåm Railway timetable; "Helsinki to Tallinn ferry" should link Tallink.
2. **Make them actionable.** Every extra gets a "turn this into a task" button.
   Your ferry note becomes a checklist item in one tap instead of being read
   and forgotten. This is the one I'd prioritise — it converts reading into
   doing, which is the actual dead end.
3. **Put them where they're needed.** A note tied to a city currently only
   appears on that city's page. The ferry note should surface on Today on
   21 September, not wait to be looked for.

---

## F14 — Icon and flag sets

**Icons — recommendation: [Lucide](https://lucide.dev).** ISC licence (do
anything, no attribution in-product), ~1,600 icons, consistent 24px grid and
1.5–2px stroke that matches what's already drawn by hand in `src/js/01-util.js`.
Swapping in Lucide is close to a drop-in.

Alternatives, all genuinely good: **Phosphor** (MIT, six weights — the "thin"
weight is elegant in dark mode), **Tabler** (MIT, ~5,700, the widest coverage),
**Remix Icon** (Apache-2.0, filled and outline pairs), **Heroicons** (MIT,
small and clean but only ~300).

**Flags — recommendation: [circle-flags](https://github.com/HatScripts/circle-flags).**
MIT, circular SVG, reads well at 16–24px next to a city name. Rectangular flags
look wrong at small sizes in a list.
Alternative: **flag-icons** (MIT, 1×1 and 4×3 ratios). Avoid emoji flags —
Windows renders them as letter pairs.

**What to download:** grab the SVG set, drop the folder in `src/icons/`, and
`make build` will assemble the sprite with only the icons actually referenced,
so an unused 1,600-icon set costs nothing. Licence file goes in the same folder.

---

## F15 — Expense block design, and `A$` vs `AUD`

Both confirmed. The `A$` is `Intl.NumberFormat`'s doing — with
`style: "currency"` it picks the *narrow* symbol for a non-local currency, which
is right for a receipt and wrong for a dashboard where the reader needs to know
unambiguously which dollar. Fix: format the number and place the code
explicitly.

The block itself will be rebuilt: spent and remaining given clear visual
weight, the meter given room, over-budget shown as a real state rather than a
colour change, and the currency stated once and consistently.

One question below on the exact format you prefer.

---

## F16 — Wrapped text

Confirmed. `September climate averages (not a forecast)` is a long title in a
narrow card and it wraps badly. The fix is a system, not one edit:

- Card titles get `text-wrap: balance` so a two-line title splits evenly
  instead of leaving one orphaned word.
- Body text gets `text-wrap: pretty` to kill orphans.
- Long, unbroken strings — booking references, addresses, URLs — get explicit
  overflow handling instead of forcing the card wider.
- Grid minimums go up so cards stop being narrower than their content.
- The Convert Skill gets a length guidance note, since `extras[].title` is
  agent-written: that title should have been "September climate averages" with
  "not a forecast" as the first line of the body.

I'll sweep every screen for this rather than fixing the one you spotted.

---

## What I'd do first

If the answers land as recommended, the order is:

1. **F17** — the architecture, since F2/F6/F11/F12 depend on it
2. **F1, F7, F15, F16** — the visual pass, all touching the same design layer
3. **F3, F9, F5, F6** — the interaction gaps
4. **F4 + F14** — `default.json` and the icon sprite together, since categories
   need icons
5. **F8, F11, F12, F13** — route and city page work
6. **F10** — Wikivoyage at build time, last because it needs a Skill change too

Every step verified with `make check` before the next starts.
