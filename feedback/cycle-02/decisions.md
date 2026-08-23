# Cycle 02 — decisions

**Decided:** 2026-08-23 · Answers to [review.md](review.md).

## Answered directly

| Key | Decision |
|---|---|
| **C10 / C9 / C8** | **Merge Cities and Guide into one Destinations screen.** "Guide" leaves the nav; country facts and notes fold into the destination detail page, which already carries stay, transport, tasks, extras and spending. Renaming alone would have left the duplication that made C8 and C9 feel awkward. The trip-wide *concept* stays in the schema — a genuinely global fact (a visa rule covering the whole route) needs somewhere to live — but this trip's four trip-wide extras are redistributed, so the section renders nothing. |
| **C5** | **Red flag, no fake rows.** A "Missing prices" block in rust on Expenses and on the affected destination, each with one-tap *Add the price*. Six real bookings qualify. Literal `AUD 0.00` records were rejected: the reminder is right, but six placeholder rows would make "All expenses: 9" untrue and put empty slices in the category chart. |
| **C1** | **Match the checklist's section-and-rows structure; accent becomes clay.** Today was using `brass` — a *semantic* colour meaning done/progress — which contradicts the two-palette rule set in cycle 01. Clay is retuned browner so it cannot be read as rust, which stays alert-only and always carries an icon and a word. |
| **C3** | **Split into two confirmed actions.** *Reset to the trip as built* (discards local edits, restores the baked data — the common case) and *Clear everything* (empties the browser copy). Each names what it destroys. |

## Taken as recommended in review.md

| Key | Decision |
|---|---|
| C2 | Compare against `trip.startDate`, not `todayISO()`. Any date **before** the start shows Upcoming; the start date itself shows Day 1. |
| C4 | Promote the source filename out of `notes` into a real `sourceFile` field on `stays[]` and `transport[]` (schema 1.3). Stripped from displayed notes; collected in one collapsible **Source documents** section under Trip data. 13 records in this trip carry one. |
| C6 | Group upcoming tasks by due date from the selected date forward. One collapsible per day, empty days not rendered, labels relative to the selection (*Today*, *Tomorrow*, then weekday + date). First day with tasks opens by default. **Overdue items stay in their own block above the groups** — folding an overdue item away is the failure cycle 01 already ruled against. |
| C7 | Delete `extra_group_totals`. Nothing is lost: the individual-vs-group split is the Budget figure, and per-booking group totals are on each stay. |
| C8 | Split `extra_food` into four destination-scoped records: Berlin, Copenhagen, Oslo, Kiruna/Abisko. |

## Redistribution of this trip's trip-wide extras (C9)

| Record | Goes to |
|---|---|
| `extra_food` | Split across Berlin, Copenhagen, Oslo, Kiruna/Abisko (C8) |
| `extra_tipping` | Split per destination — tipping is per country anyway |
| `extra_weather_brief` | The Weather screen, where a climate average belongs beside the live forecast |
| `extra_warsaw_options` | Trip data, under a "Considered but not booked" section — Warsaw is not on the route, so it is research history rather than a guide entry |
| `extra_group_totals` | Deleted (C7) |

## Defaults taken where no answer was needed

- **C10 · wording.** Nav label and headings become **Destinations**; the schema
  collection stays `cities[]`. Renaming the collection would break every
  existing `cityId` cross-reference for no user-visible gain, and spec §4's
  stable-ID rule exists precisely to stop that kind of churn.
- **C1 · what stays distinct.** Today keeps the large current-city line and the
  countdown; only the surrounding blocks adopt the checklist's section rhythm.
  Uniform structure, not uniform content.
- **C6 · how far ahead.** Fourteen days from the selected date, matching the
  existing "due in the next two weeks" window.

## Spec changes this cycle requires

1. **§1 / §12** — Destinations replaces Cities + Guide as one screen; Today's
   date behaviour keyed to `startDate`.
2. **§4** — `sourceFile` on `stays[]` / `transport[]` (schema 1.3); note that
   trip-wide extras remain valid but are the exception.
3. **§11** — Today's accent corrected to a categorical hue; record explicitly
   that no screen may take a semantic colour as its accent.

To be written once implementation confirms the shapes.

## Carried forward from cycle 01

**F10 — Wikivoyage See/Do at build time**, replacing the TripAdvisor request
that needs an API key. Still outstanding. The Destinations merge is the natural
home for it, so it is sequenced after C10 rather than before.
