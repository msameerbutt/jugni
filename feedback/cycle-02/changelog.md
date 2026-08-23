# Cycle 02 — changelog

**Implemented:** 2026-08-23 · 9 of 10 items shipped · `make check` green on all
three builds. C10's merge carried C8 and C9 with it.

---

## The structural change

**C10 + C9 + C8 — Cities and Guide merged into Destinations.**

Guide had become a duplicate of the city detail page's lower half: same country
facts, same notes, same extras. That duplication is *why* C8's food card felt
homeless and C9's trip-wide section felt unnecessary — three complaints, one
cause.

- `screens/Cities.js` + `screens/Destination.js` → `screens/Destinations.js`
- Nav: 8 entries → **7**. Route `#/destinations`, with `#/cities` and
  `#/destination` kept as aliases so an existing bookmark still lands correctly.
- `ForecastDay` and `Extra` moved to `ui/parts.js`, since both screens used them.
- Schema collection stays `cities[]` — renaming it would break every `cityId`
  cross-reference for no visible gain.

## Item by item

| Key | What shipped |
|---|---|
| **C1** | Today rebuilt on the checklist's section-and-rows rhythm, and its accent moved from `brass` to **clay**. Cycle 01 had given Today a *semantic* colour — the gold that means "done" — which broke that cycle's own two-palette rule. `make check` now fails if any screen takes a semantic accent. |
| **C2** | Fixed. The condition compared against `todayISO()` instead of `trip.startDate`, so any pre-departure date fell through to the day view and said "Outside the trip dates". Now: before the start date → countdown; start date onward → that day. Departure day, which sits before the first arrival, reads **"In transit · Melbourne (MEL) → Istanbul (IST)"** rather than an em dash. |
| **C3** | Split into two named actions under **Start over**: *Reset to the trip as built* (the common case — the old button already did this but sounded like deletion) and *Clear everything*. Each confirmation states what it destroys, including the count of completed tasks and expenses about to go. |
| **C4** | `sourceFile` promoted from prose in `notes` to a real field (schema 1.3) and lifted off 13 records. Destination pages no longer repeat it; Trip data gains a collapsed **Where this came from** section listing all 10 documents and what each produced. |
| **C5** | **Missing prices** block in rust on Expenses and on the affected destination — 6 real bookings qualify. Each offers *Add the price*, which writes the fare onto the booking and creates a genuine expense, optionally split by headcount. No placeholder zero rows. |
| **C6** | Upcoming tasks grouped by due date, one collapsible per day, empty days not rendered, first day open. The window re-anchors on the selected date. Overdue items sit in their own rust block above the folds and are never folded away. |
| **C7** | `extra_group_totals` deleted. |
| **C8** | `extra_food` split into four destination records — Berlin, Copenhagen, Oslo, Kiruna/Abisko. |
| **C9** | Trip-wide extras redistributed: food and tipping per destination, climate averages per destination beside the live forecast. Only the Warsaw research leftover remains trip-wide, and trip-wide notes now render under **Trip data**, so the guide is purely per-destination. |

## Two deviations from decisions.md

Both deliberate, both smaller than they sound:

1. **Climate averages went per destination, not to the Weather screen.** The
   Weather screen already shows a live forecast per city; a static climate
   table beside it would be two answers to the same question. Per destination,
   the average sits under "Worth knowing" with the live forecast directly
   above — which is where you would compare them.

2. **Day labels are relative to the real today, not to the selected date.** The
   original asked for the selected day to read as "today's task". Labelling
   4 September "Today" while standing on the 2nd is a plain untruth, and the
   page header already states which day is in view. So: real *Today* and
   *Tomorrow* keep their names, everything else shows its date, and the
   **window** starts at the selected date — which is the part that actually
   makes it re-anchor as described.

## Verification

Three assertions added, all of which would have caught a regression I could
otherwise only find by looking:

```
ok  legacy #/cities and #/destination still resolve
ok  every screen accent is categorical, not semantic
ok  source filenames stay out of the destination pages
```

The accent check is the interesting one — it encodes cycle 01's colour rule as
a test, so the mistake C1 reported cannot recur silently.

## Follow-up: "Clear everything" was a one-way door

Reported immediately after shipping, and a real design fault in C3. Clearing
wrote an empty state to `localStorage`, and on every later load that empty
state won over the trip baked into the file — so the data was sitting inside
the HTML with no way to reach it. Reloading did not help.

**Fixed:** the baked trip is kept in memory and offered back. *Restore the trip
built into this file* now appears in Trip data whenever the file carries a
baked trip, and as the primary action on the empty state — which is where
somebody who just cleared actually lands. The clear confirmation now says so up
front instead of calling itself irreversible.

Proving the recovery turned up a second, larger problem:

- **`structuredClone` gated every write.** The store cloned state through it on
  every mutation. It is fine in current browsers but absent in older webviews —
  and absent in the smoke test's context, which is how it surfaced. Now a
  guarded helper falling back to a JSON round-trip, which is equivalent for
  plain trip data.
- **No write path was tested at all.** jsdom refuses `localStorage` on an
  opaque origin, and `file://` is one — so every `persist()` no-opped behind
  the store's `try/catch` and the entire persistence layer went uncovered while
  the suite reported green. The harness now installs a storage shim (real
  browsers *do* give a `file://` page its own storage, so this restores reality
  rather than faking it) and ticks a real task end to end:

```
ok  writes commit and persist (ticked a task)
```

The full cycle is verified: clear → reload → still empty → restore → trip back →
reload → still there.

## Not done

**F10 — Wikivoyage See/Do at build time** (carried from cycle 01). Still
blocked, and now for a demonstrated reason: outbound HTTP returns **403 from
this build environment**, the same block that made the live currency API
unusable. I can write the fetch, but I cannot run it, cannot see a real
response, and cannot verify the parsing — so shipping it would be shipping
unverified network code.

The way to unblock it: run one request on your machine and paste the response,
and I will write the extractor against real data rather than against a guess.

## Trip data

`trips/euro2026/input.json` migrated to schema 1.3. Extras went 9 → 23 as
trip-wide content was split per destination; `sourceFile` lifted off 13
records. Validates with **0 errors**; the 10 warnings are the same real gaps in
the raw data, each already tracked as a task.
