---
name: jugni-convert
description: Turn intake material into Jugni's internal schema and write it to input.json — including the judgement calls that are the whole reason a human-written parser cannot do this: name canonicalization, confirmed-vs-candidate bookings, timezone-correct datetimes, and where unmodeled facts go. Read after 01-intake.md.
---

# Convert

Write `trips/<slug>/candidate.json` in the schema below, then:

```
make run CMD="python scripts/generate.py --trip <slug> --candidate trips/<slug>/candidate.json"
make validate TRIP=<slug>
make build TRIP=<slug>
```

The merge is non-destructive: on a re-run, new facts get added, conflicts get
reported for a human to resolve, and nothing is silently overwritten in either
direction. Never hand-edit an existing `input.json` to force a change through.

## The schema

See `docs/jugni-spec.md` §4 for the authoritative shape. `make validate` checks
it mechanically — run it, and read the warnings, which are usually real.

## The judgement calls

These are why Convert is a Skill and not a parser.

### Canonicalize traveller names

The same person shows up as "Muhammad Sameer", "Sameer Muhammad" and
"SAMEER/MUHAMMAD" across three booking platforms. That is **one**
`travelers[]` entry, not three. Use matching email or phone across sources as
the tie-breaker when the names alone are ambiguous. Ask if still unsure.

Store a **nickname**, not a legal name (spec §6). Ticket-format strings belong
in the booking record, not in the traveller's identity.

### Confirmed booking vs. candidate

A raw folder contains both. Three hotel links for one city, one of which was
actually booked, plus the actual reservation.

- **Only confirmed bookings** — a confirmation number, a paid/booked status, a
  ticket — populate `stays[]` and `transport[]`.
- Everything else is either dropped or logged in `extras[]` as *"considered but
  not booked"*. Never give a candidate the same structural weight as a
  reservation. Someone will read this at a check-in desk.

### Datetimes carry their offset

`transport[].departDateTime`, `arriveDateTime`, `stays[].checkIn`, `checkOut`:
ISO 8601 with an explicit UTC offset in the **local time of that location**:

```
2026-09-13T15:20:00+02:00     ✓
2026-09-13T15:20               ✗  ambiguous
2026-09-13T13:20:00Z           ✗  correct instant, wrong local reading
```

A 12-city multi-timezone trip is exactly where this bites. `make validate`
rejects a bare datetime, on purpose.

### Currency authority

Booking documents often show both an actual charge in the property's currency
*and* a home-currency estimate labelled as an estimate.

Store the **actual charged amount and currency** as `amount` / `currency`. Never
store the document's home-currency estimate — it is a snapshot from whenever
that document was generated, and it will not match what the card was billed.
`homeAmount` is computed by the app under the snapshot rule (spec §4).

### One itinerary, not a branching tree

`cities[]` / `transport[]` / `stays[]` represent **the primary traveller's
actual itinerary** — the single source of truth. When part of a group diverges
mid-trip (a companion's hostel in one city while the primary's flights show
them elsewhere), log that as an `extras[]` note tied to the relevant city.
Do not model a second official itinerary. Per-traveller itineraries are Phase 3.

### Where unmodeled facts go

Try the closest existing category **first**:

| Fact | Goes to |
|---|---|
| A scheduling detail, something to do by a date | `checklist` |
| A place fact — emergency number, plug type, custom | `destinationNotes` |
| A festival date, a visa quirk, a packing tip that isn't a task | `extras` |

Only when nothing genuinely fits does it become an `extras[]` record. Set
`displayHint` to how the UI should render it — `list`, `table`, `text`, `link`,
or `auto` when you are not sure. The app renders each hint through a real
component, so a good hint is the difference between a native-looking card and a
dumped text block.

### IDs are permanent

Generate an id once — `city_berlin`, `stay_a1b2`, or a UUID, either is fine.
**A regeneration must never remint an existing id.** `cityId` and `relatedId`
cross-references depend on it, and `make validate` checks them.

### Keep a pointer back to the source

Put the original filename in the record's `notes` — `"from Berlin_
Confirmation.pdf"`. At a check-in desk, a traveller needs to know which email or
downloads-folder file to open for the real document. Costs one string; saves a
bad ten minutes.

## Pre-fill the destination essentials

Every city gets a starter set of `destinationNotes`: emergency number, plug type
and voltage, visa reminder, tipping norm, transit-from-airport. These are normal
editable records, not locked defaults. The priority is that the traveller spends
less time in the app and gets more out of it — pre-fill first, let them correct
what is wrong for their trip.

## Before you call it done

- [ ] `make validate TRIP=<slug>` passes, and you have read the warnings
- [ ] Every stay and leg traces back to a real confirmed document
- [ ] One `travelers[]` entry per human being
- [ ] Every datetime has an offset
- [ ] Gaps you found are stated to the user, not filled with guesses
- [ ] `05-quality-bar.md` checked against the built file
