# Cycle 01 — changelog

**Implemented:** 2026-08-23 · All 17 items addressed · `make check` green on
all three builds (empty shell, example fixture, `euro2026`).

Keys map to [review.md](review.md); decisions are in [decisions.md](decisions.md).

---

## The root-cause fix

**F17 — Preact + htm, bundled by esbuild.** `src/js/` (25 concatenated files,
string-templated `innerHTML`) became `src/app/` (31 ES modules across
`lib/ state/ data/ ui/ screens/`). Rendering is now diffed rather than
regenerated.

This was not a preference. The old renderer destroyed the DOM node the user was
touching on every state change, which is why F2 had nothing to animate, and why
F11 and F12 would each have needed their own state-preservation hack. Four
complaints, one cause. Bundle cost: **+5 KB**.

| Build | Before | After |
|---|---|---|
| `euro2026` | 122 KB | 191 KB |
| empty shell | 99 KB | 168 KB |

The growth is the icon sprite (15 KB), Preact (5 KB), and considerably more
app: collapsibles, carousel, date strip, split-stay flow, undo, the catalogue.

## Shipped, item by item

| Key | What shipped |
|---|---|
| **F1** | Two palettes with separate jobs. Semantic (brass/blue/rust) untouched and rare; nine new categorical hues (`--hue-indigo` … `--hue-sage`) applied via `data-accent` and inherited by nested components. Never on a control. Dark mode also gained a real elevation ramp — it read cheap because it was *flat*, which no palette fixes. |
| **F2** | Tick → strike through → hold 380 ms → collapse height and fade → commit. Undo in the toast. `prefers-reduced-motion` shortens the hold instead of removing the feedback. |
| **F3** | Delete on the checklist, in the edit sheet. Confirmation names the task; Undo after. |
| **F4** | `default.json` — 8 categories, 38 standard items, each declaring `appliesTo` (`always`, `persona:*`, `country:*`, `lat:>60`, `cities:n`, `nights:n`). Merged at load, tagged `source: "default"`, deletions remembered in `suppressed[]`. |
| **F5** | Share reachable from every screen — rail footer on desktop, header on mobile. One sheet: snapshot, forkable export, `.ics`. Web Share API where available, download otherwise. |
| **F6** | Scrollable week strip with activity dots, plus a jump-to-date input and a "Today" reset. The app always *opens* on the real today. |
| **F7** | Route summary rebuilt. The `"11 · 9"` stat labelled `"cities · legs"` is gone; separate figures, budget meter given real width. |
| **F8** | Every stop shows all five columns, `—`/`0` when empty. Stay cost is shown *separately* from personal spend, and each group booking offers **"Add my share"** (÷ headcount, or a manual figure) which creates a real expense under the snapshot rule. Expenses screen lists bookings not yet in your spend. |
| **F9** | Add-task button inside the city page's task section, pre-filled with that city. Delete with a named confirmation and Undo. |
| **F10** | **TripAdvisor not built** — see below. |
| **F11** | Scroll-snap carousel: touch, trackpad, arrow keys, visible prev/next, dot indicators, live position. Used for city notes and extras. |
| **F12** | Collapsible sections. The section relevant *today* opens by default; state remembered per section per city; a section holding a live alert refuses to collapse. Expand/collapse-all in the header. Real `<button>` headers with `aria-expanded`. |
| **F13** | `extras[].links` added to the schema and filled for your trip (Flåm Railway, Tallink, Viking Line, Reichstag registration). Every extra offers **"Make it a task"**. City-tied extras surface on Today. |
| **F14** | Lucide + circle-flags vendored via `make icons`; build emits one inline SVG sprite (`<symbol>`/`<use>`), only referenced icons, flags only for that trip's countries. |
| **F15++** | Live rates alone were not enough: the API is unreachable from `file://` in practice (and returns 403 from this project's own build environment), so bookings showed "not converted yet". Resolution is now layered — stored snapshot → live rate → `trip.rateHints` implied by the traveller's own booking documents → labelled original. Every figure reads in AUD with the network completely off. |
| **F15+** | Display currency is now the home currency on every screen, not just in totals: `stays[].cost` and `transport[].cost` convert against one trip-wide rate table (a single request covering every currency the trip mentions). The original charge stays as secondary text. Offline with no cached rate, the original is shown marked "not converted yet" — never a guessed number. |
| **F15** | Budget block rebuilt with hero-weight figures and a category bar. Currency renders as `AUD 1,234` — the code, never `Intl`'s ambiguous narrow `A$`. |
| **F16** | Systemic: `text-wrap: balance` on titles, `pretty` on body, `.wrap-anywhere` / `.truncate` for refs and addresses, grid minimums raised, and a four-word title guideline added to the Convert Skill. |

## Bugs the work surfaced

Found by the harness, not by reading:

1. **`matchMedia` crash.** `matchMedia?.()` still throws a ReferenceError for an
   undeclared identifier. Now `globalThis.matchMedia?.()`. Would have broken any
   embedded webview lacking it.
2. **Five icons shipping as empty boxes.** The name scanner required a hyphen,
   so `plane`, `compass`, `settings`, `luggage`, `smartphone` were never put in
   the sprite. Now collects every quoted token and intersects with what is on
   disk — over-collect, never under-collect.
3. **Standard checklist duplicating agent items.** "Buy travel insurance" landed
   beside "Buy travel insurance covering Schengen and the Arctic leg". Matching
   is now word-containment at 0.75, not equality: 51 items → 47.
4. **Defaults born overdue.** `dueOffset: 45` on a trip 17 days out produced 5
   already-overdue tasks. A computed date in the past becomes today.
5. **Nested layout grids collapsed the page** (reported from a screenshot, not
   caught by the harness). The template mounted into `<div class="app" id="app">`
   while the Shell rendered its own `.app` grid inside — so the content column
   was one 254px track wide and everything overflowed a 40px box. jsdom has no
   layout engine, so all DOM assertions passed. `make check` now asserts exactly
   one `.app` holding `.rail` and `.main` directly.
6. **`circle-flags` id collision.** Every flag defines `id="a"` for its clip
   mask; unchanged in one document, all 12 would render Austria's. Ids are now
   namespaced per symbol.

## Verification

`make check` gained four assertions so these stay fixed:

```
ok  58 sprite symbols, all references resolve
ok  share reachable from every screen
ok  currency rendered as a code, not a narrow symbol
ok  4 collapsible sections, 1 open by default
```

Assertion 1 caught bug 2 immediately. The collapsible check also exercises a
real toggle and asserts the body actually renders.

## Not done, and why

**F10 — TripAdvisor.** Their API requires a key, and a Jugni file is designed to
be forwarded to friends: an embedded key is a published key, revoked within
days. Spec §8's no-key rule exists for this. The replacement — Wikivoyage
See/Do pulled at *build* time into each city's notes — is specified in
`decisions.md` but **not yet implemented**; it needs a Convert Skill change and
a build-time fetch step, and is the first item for cycle 02. Dated events
(concerts, festivals) have no keyless source at all and stay a Convert research
job.

**Base64 icon images.** Replaced by the SVG sprite. The intent — icons as data,
embedded in the HTML, never fetched — is fully met, at a fraction of the size
and with theme-following colour.

## Spec updated

`docs/jugni-spec.md` amended so it does not rot into history: §1/§2 (UI runtime,
`make icons`, `make check`), §4 (schema 1.1, `default.json`, `countryCode`,
`links`, `suppressed`, `relatedStayId`), §8 (icon sprite), §11 (categorical
palette, elevation), §12 (date picker, collapsibles, global share, extras as
actions). `skills/02-convert.md` and `skills/05-quality-bar.md` updated to match.

## Trip data

`trips/euro2026/input.json` migrated to schema 1.1: 11 country codes added
(flags now render), 4 extras linked. Validates with **0 errors**; the 10
remaining warnings are the real gaps in your raw data, each already tracked as a
checklist task.

Your checklist went from 20 agent-written items to **47** — the 27 additions are
the standard catalogue, filtered to your trip: thermal layers because the route
crosses latitude 60, a hostel padlock and a daily spending target because of the
budget-backpacker profile, walking boots for adventure-outdoor, last-train
lookups for nightlife-focused.
