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

See `docs/jugni-spec.md` §4 for the authoritative shape (currently **1.5**).
`make validate` checks it mechanically — run it, and read the warnings, which
are usually real.

### What 1.5 asks of you

- **`cities[].countryCode`** — ISO 3166-1 alpha-2, lowercase. Set it. The flag
  lookup falls back to matching the country *name*, and booking platforms spell
  the same country six different ways.
- **`extras[].links`** — `[{ label, url }]`. Fill these in while you have the
  raw material open. A fact with nowhere to go is a dead end: a ferry note
  should link the operator, a scenic-railway note should link the timetable.
  This is the single highest-value thing you can add to an `extras` record.
- **`expenses[].relatedStayId`** — leave it alone. The app sets it when the
  traveller splits a group booking into their own share.
- **`stays[].sourceFile` / `transport[].sourceFile`** — the filename the record
  was read from, as its own field. Do **not** append "source: X.pdf" to
  `notes`: that put it on screen under every booking, which is noise. The app
  collects these in one place under Trip data.
- **`stays[].guests`** — how many people the room was booked for, straight off
  the confirmation ("Number of guests: 3 adults"). A trip is not one party
  size: the same group can take a five-person apartment in one city and a
  three-bed room in another. Without it the app divides every bill by the
  traveller count, which understates a share on any booking that was not the
  whole group — and the wrong number looks just as plausible as the right one.
- **`extras[].kind`** — `food`, `free`, `nightlife`, `event`, or `note`. This
  is what turns the destination page from one pile of notes into the panels
  someone actually opens a phone for on a street corner. Default is `note`;
  filling it in is most of the value of a destination page.
- **`extras[].startDate` / `endDate`** — only for `kind: "event"`, and only
  when the date is a **fact**. See "Events are dated only when you know" below.
- **`trip.rateHints`** — see "Record the document's own exchange rate" below.

### Do not restate the standard catalogue

`default.json` already supplies the checklist items every trip wants —
passport validity, insurance, adapters, medicine, chargers, offline maps. They
are merged in automatically and filtered by persona and destination.

Write only what the **raw data** tells you: the bookings that need chasing, the
gaps you found, the deadlines that are real for this trip. "Book accommodation
in Kiruna (17–20 Sep) — nothing booked" is yours. "Pack a shaver" is not.

The merge skips a default whose meaningful words are already covered by one of
your items, so a near-duplicate is usually harmless — but writing a generic item
the catalogue already owns is still noise, and it hides the specific one.

### Titles are short

`extras[].title` and `destinationNotes[].title` render as card headings in
narrow columns. Keep them to about **four words**. "September climate averages
(not a forecast)" wrapped badly and should have been "September climate
averages", with "not a forecast" as the first line of the body. Detail belongs
in the body, where it has room.

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

**A bed that was never booked is not a candidate.** Staying at a relative's
house has no confirmation number and no rate, but it is certain, and the
address is exactly what you want on screen at midnight in an arrivals hall. It
belongs in `stays[]` with no `confirmationNumber` and no `cost`, and a `notes`
line saying it is family accommodation. `make validate` will suggest moving it
to `extras[]` — that warning is aimed at the three-hotel-links case, so say why
you kept it rather than silently ignoring it.

### The last leg lands somewhere, on some day

A return ticket states its arrival, and it is usually the one datetime people
leave blank — the eye stops at the departure. Fill `arriveDateTime` on the
final leg like any other, and set `trip.endDate` to the day the traveller is
**home**, not the day they took off. A long-haul return crosses midnight often
enough that these differ, and when they do, the trip silently loses its last
day: the route ends a day early and the recap counts wrong.

The document will tell you if you read past the departure time. A journey
duration (*"1d 2h 25m"*) plus the local arrival time is enough on its own —
cross-check it in UTC, because the offsets are what make it look wrong. Never
ask the traveller for a date their own ticket already states.

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

### Record the document's own exchange rate

Booking confirmations routinely print both the local charge and a
home-currency equivalent — *"Price AUD 576 … (for 5 guests) DKK 2,628"*. Do not
store that estimate as `amount`/`currency` (see below), but **do** capture what
it implies:

- `stays[].homeAmount` / `homeCurrency` / `rateSnapshotDate` when a document
  states the equivalent outright.
- `trip.rateHints` — `{ "EUR": 1.63813, "DKK": 0.21918 }`, home-currency units
  per one foreign unit — with `rateHintsDate` and a `rateHintsSource` naming
  the documents it came from.

This is what makes every figure readable in the home currency with **no network
at all**, which is the normal condition for a file opened from `file://`.
Cross-check the implied rates against each other: two documents from the same
provider in the same period should agree closely, and a large discrepancy means
you have misread one of them.

### Currency authority

Booking documents often show both an actual charge in the property's currency
*and* a home-currency estimate labelled as an estimate.

Store the **actual charged amount and currency** as `amount` / `currency`. Never
store the document's home-currency estimate — it is a snapshot from whenever
that document was generated, and it will not match what the card was billed.
`homeAmount` is computed by the app under the snapshot rule (spec §4).

The document usually tells you outright which is which, and two confirmations
from the same platform can differ. Look for a *"Currency & Exchange Rate Info"*
block: *"you'll pay in SEK … the amount displayed in AUD is just an estimate"*
means SEK is the charge and the AUD figure is a dated snapshot for
`homeAmount`. Where there is no such block and the price is itemised in the
home currency instead — base, VAT, city tax, all in AUD — the home currency is
what the card sees, and the foreign total marked *approx.* is the estimate.
Read the block, not the platform's name.

### One itinerary, not a branching tree

`cities[]` / `transport[]` / `stays[]` represent **the primary traveller's
actual itinerary** — the single source of truth. When part of a group diverges
mid-trip (a companion's hostel in one city while the primary's flights show
them elsewhere), log that as an `extras[]` note tied to the relevant city.
Do not model a second official itinerary. Per-traveller itineraries are Phase 3.

**A booking that looks impossible is usually someone else's.** Two airport
transfers on one morning, the second arriving after the primary traveller's
flight has already left, is not a double-booking — it is the rest of the party
leaving later. Before calling anything a clash, check whether it fits a
*different* traveller. Say what you found and let the traveller decide; do not
recommend cancelling a confirmed booking on a timing inference, because the
group's other flights are usually not in the raw folder at all.

### A booking with no price is a gap, not a zero

If a ticket or confirmation never states a fare — this reference trip's Turkish
Airlines ticket does not — leave `cost` unset. **Never write `0`, and never
create a zero-value expense to stand in for it.** The app surfaces those
bookings in red and offers to record the price. A fabricated zero would make
the expense count and the category breakdown quietly untrue, which is worse
than a visible gap.

**One ticket covering several legs is priced once.** Melbourne to Lahore is
four flights on one reference and one receipt that never splits the fare by
hop. Put the booking total on the first leg with a `notes` line saying what it
covers, and leave the siblings unset — the app reads the shared `bookingRef`
and stops asking about the rest. Do not spread an invented per-leg share.

**`cost: 0` and no `cost` are different answers.** Absent means nobody has
recorded a fare yet, and the app keeps asking. Zero means someone looked and
the answer was nothing — a leg on a ticket already paid for elsewhere, a room a
relative is not charging for. Never write `0` to silence a prompt about a fare
you simply do not know: that is the fabricated-zero trap two paragraphs up,
and it makes the spend total quietly wrong. Leave it out instead.

### A reused spreadsheet carries last year's answers

Planning sheets get copied forward. The giveaway is a date whose weekday does
not match: *"15 Dec Mon"* is a Monday in one year and a Tuesday in the next, so
check the pair before trusting either. Ticked items are the same trap — a list
that arrives mostly complete, for a trip that has not started, is usually the
previous trip's state rather than this one's.

When the two readings disagree, **import the items and drop the dates**, and
say so in an `extras[]` note. A task with no due date is a small loss; a task
pre-ticked before departure hides work the traveller still has to do, and a
confidently wrong date sends them somewhere on the wrong day. A mixed list —
some ticked, some not — is the opposite signal, and is worth trusting.

### Destinations, not cities

The user-facing word is **Destination**, because a stop is not always one city:
this trip has "Kiruna / Abisko" and a Helsinki + Tallinn day. The schema
collection is still `cities[]` — do not rename it, every `cityId` depends on it
— but write `name` values that describe the stop honestly rather than forcing
them into a single city name.

### Keep titles short

`extras[].title` and `destinationNotes[].title` render as card headings in
narrow columns, and trip-wide extras are the **exception**, not the norm.
Country-level facts — food, tipping, climate averages — belong to the
destinations they describe, one record each, not one trip-wide card listing
four countries. A record with no `cityId` should be something that genuinely
spans the whole route, like a visa rule.

### Where unmodeled facts go

Try the closest existing category **first**:

| Fact | Goes to |
|---|---|
| A scheduling detail, something to do by a date | `checklist` |
| A place fact — emergency number, plug type, custom | `destinationNotes` |
| A festival or anything with dates | `extras` with `kind: "event"` |
| Where to eat, what is free, where to go after dark | `extras` with the matching `kind` |
| A visa quirk, a packing tip that isn't a task | `extras` with `kind: "note"` |

Only when nothing genuinely fits does it become an `extras[]` record. Set
`displayHint` to how the UI should render it — `list`, `table`, `text`, `link`,
or `auto` when you are not sure. The app renders each hint through a real
component, so a good hint is the difference between a native-looking card and a
dumped text block.

**`table` splits each line on the first `:` or `|` to make key/value rows**, so
it suits `Booking ref: EGP2BY` and ruins `05:00 - ref 174182531`, which renders
as `0500`. If any line carries a time, a ratio or a URL, use `list`. The colon
disappears silently and only shows up when you read the built page.

### IDs are permanent

Generate an id once — `city_berlin`, `stay_a1b2`, or a UUID, either is fine.
**A regeneration must never remint an existing id.** `cityId` and `relatedId`
cross-references depend on it, and `make validate` checks them.

### Keep a pointer back to the source

Put the original filename in the record's `notes` — `"from Berlin_
Confirmation.pdf"`. At a check-in desk, a traveller needs to know which email or
downloads-folder file to open for the real document. Costs one string; saves a
bad ten minutes.

### Every stop gets the same shape

Coverage that depends on how much you happened to know about a city is not a
guide — the traveller opens Vienna after Berlin and finds half a page. Decide
the shape once and fill it everywhere.

**Every stop, without exception, gets the same five facts** in
`destinationNotes`: `Emergency`, `Power`, `Money`, `Tipping`, `<Month>
weather`. Same five titles on the one-night stopover and the four-night stay
alike. Two neighbouring countries sharing a plug type is not a reason to omit
it from one of them — the reader does not know that yet, and a missing row
reads as an oversight rather than as sameness.

**Every stop you sleep in** gets `food`, `free` and `nightlife`, plus an
`event` where there is something real to point at.

**A transit stop still gets a page.** A four-hour ferry visit or a lunchtime
stop between two cities gets food and free sized to the hours it has, and a
nightlife card that says plainly there is no evening here and what to do if the
plan slips. That is more useful than an absent section.

Aim for roughly the same weight per city. If one stop carries four times the
content of another, the thin one is under-researched, not simpler.

### What makes one of these worth reading

A list of neighbourhoods is not worth opening an app for. Each card should
carry, in about five lines:

- **a name you can walk to**, not a category — "Konnopke's, under the U2 tracks
  at Eberswalder Straße", not "try a currywurst"
- **a time that matters** — the market is Tuesday and Friday, the food yard
  shuts for winter, the last metro is 00:30
- **one thing that is not obvious** — the queue at the famous place is forty
  minutes and the Späti is ninety per cent as good; the aurora looks grey to
  the eye and green to a camera; cycling home drunk is enforced here
- **a price anchor in relative terms** — "roughly double Berlin", "the cheapest
  hot meal in the city". Absolute prices date badly and the file is built
  months ahead of the trip.

Write it for someone standing on a street corner with one hand free.

### Events are dated only when you know

An undated event shows as a standing fixture and always appears; a dated one
only appears when it overlaps the stay, and is badged **on now** or **this
week** against the reader's real clock. That behaviour is only worth having if
the dates are true.

So date the things that are facts — an aurora window is astronomy, a public
holiday is published years ahead. Do **not** date a festival whose next
programme is unannounced. Write what you know, say the dates are not out, and
attach the official link. A guessed date is worse than no date here, because
the app will confidently badge it "on now" and send someone across a city.

### Short facts go in `destinationNotes`, not `extras`

The destination page renders a short `destinationNotes` body — under about 90
characters — as one cell in a facts strip, and anything longer as a card. An
`extras` record is always a card.

So a place fact that fits on a line belongs in `destinationNotes`: emergency
number, plug type, tipping custom. Filed as `extras` they each cost most of a
phone screen to say twenty-five characters, and hid the next one behind a
carousel swipe. Keep them to a line and they all fit on screen at once.

### One fact, one place

Panels make it easy to say the same thing twice: a "Nightlife" note beside an
"After dark" card, an "Aurora" note beside an aurora event, a sights list
beside a free-things list with four entries in common. Each of those costs a
whole card on a phone to repeat what is directly above it.

Before adding a record, read what the city already has. If the new panel says
it better, **move the content and delete the note** rather than leaving both.
Watch for these in particular:

- a climate note under the live forecast widget — keep the numbers, drop the
  caveat about the widget, and let it fall into the facts strip
- a transit-at-night note and a nightlife card — one paragraph, in the card
- a "must-try dishes" list and a "where to eat" list — genuinely different
  questions, so title them **What to eat** and **Where to eat** rather than
  merging them into one long card
- a sights list mis-filed as `free` when a third of it needs a ticket

### Every panel earns a way out

Food, free, nightlife and event records should each carry `links` to a live
source. Baked content is what works on hostel wifi with no signal; the link is
what is current. **Never fetch one to render the page** (spec §8): outbound
HTTP is unavailable in the build environment, so a live call cannot be verified
before it ships, and a destination page that needs the network to show anything
is exactly the failure the offline promise exists to prevent.

Sources worth reaching for, all free and none needing a key or a login:

| For | Source | Shape |
|---|---|---|
| Eat / see / drink | Wikivoyage | `en.wikivoyage.org/wiki/<City>#Eat`, also `#See`, `#Drink` |
| What is on this week | the city's own tourist board | its published events calendar |
| A specific venue or festival | that organisation's own site | its page, not an aggregator's |
| Space weather, tides, sunrise | the national agency | NOAA, the met office |

Keep **the list of source families here and the actual URLs in the trip**. A
per-city link is trip data: it rots, it is worth rechecking each time, and a
Skill that accumulated them would grow into a directory nobody maintains — the
sprawl `06-skill-maintenance.md` warns about. What belongs in a Skill is the
rule that decides them: free, no key, no login, and stable enough that a file
opened in two years still lands somewhere real. Prefer the primary source over
an aggregator for exactly that reason.

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
- [ ] Every datetime has an offset, including the arrival of the last leg
- [ ] `trip.endDate` is the day you get home, not the day you fly
- [ ] Gaps you found are stated to the user, not filled with guesses
- [ ] `05-quality-bar.md` checked against the built file
