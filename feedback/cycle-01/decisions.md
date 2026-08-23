# Cycle 01 — decisions

**Decided:** 2026-08-23 · Answers to [review.md](review.md). One line per item;
reasoning kept so it survives past the conversation.

## Answered directly

| Key | Decision | Note |
|---|---|---|
| **F17** | **Preact + htm, bundled** | Adds `esbuild` to the tooling image. Rewrites the 12 screen modules; data layer, build pipeline, skills and verification harness untouched. Root-cause fix for F2/F6/F11/F12. |
| **F1** | **Categorical accents, semantics untouched** | Two palettes with different jobs: brass/blue/rust keep their fixed meanings and stay rare; a new per-section/per-category hue set carries identity only — section rules, icons, chips, never a control. Plus real elevation in dark mode. Spec §11 gets **amended**, not overridden. |
| **F4** | **Persona- and destination-filtered defaults** | `default.json` is a catalogue; each item declares `appliesTo` (`always`, `persona:*`, `climate:*`, `country:*`). Catalogue can grow without bloating every trip. |
| **F8** | **Show both columns, add "my share"** | Stay and Spent always render, `$0` when empty. Each group booking gets a one-tap split-by-headcount that creates a real personal expense under the snapshot rule. Nothing auto-assumed. |

## Taken as recommended in review.md

| Key | Decision |
|---|---|
| F2 | Strike through → hold ~400 ms → collapse height and fade. Undo in the toast. `prefers-reduced-motion` keeps the delay, drops the motion. |
| F3 | Delete lives in the edit sheet, plus swipe-to-delete on mobile. Named confirmation. |
| F5 | Share control in the rail footer (desktop) and header (mobile), on every screen. One sheet: snapshot, forkable export, `.ics`. Web Share API where available, download as fallback. |
| F6 | Scrollable week strip plus a jump-to-date picker. App always opens on the real today. |
| F7 | Rebuilt. The `"11 · 9"` / `"cities · legs"` double-stat is deleted outright. |
| F9 | Add button in the city page's task section, pre-filled with that city. Delete behind edit, confirmation names the task. |
| F10 | **Wikivoyage See/Do at build time** into each city — no key, works offline. TripAdvisor is **not viable**: it requires a key, and a key inside a file designed to be forwarded to friends is a published key. Dated events stay a Convert-Skill research job. |
| F11 | Scroll-snap carousel: touch, trackpad, arrow keys, visible prev/next, dot indicators. Not touch-only. |
| F12 | Yes — collapsible, with three conditions: open the section relevant *today* (not mechanically the first); remember state per section per city; never collapse a section holding an alert. Expand/collapse-all in the header. Real `<button>` headers with `aria-expanded`. |
| F13 | Three-part fix. Priority is **"turn this into a task"** on every extra — that is what converts a dead end into an action. Plus optional `links[]` on the `extras` schema filled at Convert time, plus surfacing date-relevant extras on Today. |
| F14 | **Lucide** (ISC) for icons, **circle-flags** (MIT) for flags. Delivered as an **inline SVG sprite** — `<symbol>` defined once, `<use href="#icon">` to reference. Not base64 images: ~300–600 bytes per icon, sharp at any size, follows `currentColor`. `default.json` stores icon *names* only. Build assembles only the icons actually referenced. |
| F15 | Block rebuilt. Currency rendered as an explicit code — `AUD 1,234` — never `Intl`'s narrow `A$`. |
| F16 | Systemic, not a one-off edit: `text-wrap: balance` on titles, `pretty` on body, explicit overflow for refs/addresses/URLs, higher grid minimums, plus length guidance added to the Convert Skill (that title should have been "September climate averages" with "not a forecast" in the body). |

## Defaults taken where no answer was needed

Stated here so they are visible and can be reversed cheaply:

- **F6 · quick-capture date.** Logging an expense while viewing another date
  uses **the viewed date**, with the date shown in the sheet so it is never a
  surprise. Rationale: someone scrolling to yesterday is usually catching up on
  a receipt they forgot.
- **F15 · currency format.** `AUD 1,234` — code first, no decimals above 1,000.
  Foreign amounts show the original with the converted home amount beneath.
- **F12 · default open section.** Before the trip: *Stay*. During: the section
  matching today (transport on a travel day, otherwise Stay). After: *Spending*.
- **F1 · category hues.** Seeded from the checklist categories in `default.json`
  so a new category gets a colour automatically rather than needing a code edit.

## Not doing, and why

- **TripAdvisor integration (part of F10).** Requires an API key. Phase 2 files
  are meant to be forwarded to friends, so any embedded key is published and
  revoked. Revisit in Phase 3 where a backend can hold tokens (spec §7/§8).
- **Base64 icon images in `default.json` (part of F4).** Rejected in favour of
  the SVG sprite for size, sharpness and theming. The intent — icons shipped as
  data, embedded in the HTML, no remote fetch — is fully met.

## Blocked on input

Nothing.

**F14 was unblocked on 2026-08-23.** No manual download is needed after all.
`lucide-static@1.33.0` and `circle-flags@2.8.3` are installed in the tooling
image at pinned versions, and `make icons` vendors the subset named in
`src/icons/icons.txt` and `src/icons/flags.txt` into the repo. First run:
49 icons (21 KB) and 13 flags (6 KB), both with their licence text.

Vendoring rather than reading node_modules at build time is deliberate: a trip
file should still build identically years from now, and an icon set shifting
upstream must never change a built app without a visible diff.

## Spec changes this cycle requires

`docs/jugni-spec.md` is the source of truth and must not rot into history:

1. **§11** — add the categorical palette alongside the semantic roles, stating
   explicitly that the two never mix.
2. **§4** — add `links[]` to `extras`; document `default.json` and its
   `appliesTo` filtering; document `source: "default"` on instantiated items.
3. **§8** — record the icon-sprite approach under the embedded-assets rule.
4. **§12** — add the "turn an extra into a task" behaviour.

To be written once implementation confirms the shapes, not before.
