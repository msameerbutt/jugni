# Jugni — Project Spec (v0.2, pre-build)

## 1. What Jugni is

A trip command center: one place that turns messy pre-trip research into a
living plan (checklist, cities, expenses, weather, destination info, a
day-by-day log) and stays useful throughout the trip and after it. The
defining principle from this round: **it must be simple to manage from the
user's side.** The user never edits a schema or a JSON file. All of that
complexity is pushed onto Claude, guided by instruction files (Skills)
Jugni ships with. The user talks; the agent structures.

**It must feel like a complete app, not a single scrolling page.** Screens
(Overview, Checklist, Cities, Expenses, Weather, Destination) are navigated
between like real pages — distinct views, a persistent nav, transitions —
even though under the hood it's client-side routing with no server. This
is also what makes a later Android/iOS wrap (section 7) a packaging change
rather than a rebuild: app-style screen navigation now avoids a rewrite
later.

## 2. Core architecture: agent-mediated, schema hidden

- Jugni has an internal data schema (below) — but it's an implementation
  detail. Nobody using Jugni edits it directly.
- Jugni ships a set of **Skills** (instruction files for Claude) that teach
  an agent how to:
  1. **Intake** — decide, per user, whether to ask questions (destination,
     dates, budget, traveler type, **and light/dark theme preference**) or
     parse raw files/notes the user provides, or both. Two supported
     intake paths:
     - **Raw-folder path:** an Engineer/Contributor (or a comfortable
       Technical Traveler) drops whatever they have into a `raw/` folder —
       mixed formats: `.txt`, photos, PDFs, `.csv`, `.xlsx`, screenshots,
       booking confirmations, notes. The Skill knows how to handle each
       type (OCR/read photos, extract PDF text, parse tabular files, read
       free-form notes) and pulls the important details out of all of them.
     - **Pre-digested path:** a user who isn't comfortable with the raw
       folder can run their material through any AI tool themselves first,
       get back a plain text summary, and hand that single text file to
       Jugni instead. The Intake Skill accepts either path.
     - **Fork-customization path:** when the file being imported is
       recognized as someone else's `output.json` (section 8/12's
       role-based naming and forking chain) rather than a fresh raw-data
       generation, Intake asks the new user for their own `email`,
       `nickname`, and `age` (section 6's minimal identity fields) before
       treating them as the trip's primary traveler in their own fork.
       If the person doesn't have a nickname ready, the agent suggests a
       few playful options rather than blocking on it — matches the
       relaxing tone from section 11, and keeps friction low for a friend
       who just wants to see the trip, not fill out a form.
     Either way, the output is the same: a fully prefilled `input.json`,
     not a pile of source files the user has to reconcile themselves.
  2. **Convert** — turn whatever the user gave it (answers, notes, raw
     folder contents, or a pre-digested text file) into Jugni's internal
     schema, written to `input.json`.
  3. **Persona-adapt** — pick from a set of traveler-need profiles (below)
     to decide which follow-up questions to ask and what to emphasize on
     the destination page.
- This means "using Jugni" = talking to an agent that has these Skills
  loaded, not filling out a form against a schema.
- **Quality bar, stated explicitly for the Skills:** the generated app must
  read as professionally built — deliberate typography and palette, real
  page-transition feel, no generic templated-dashboard look. This is an
  instruction the Skills carry, not a hope — "looks amateur" is a defect
  the agent should be checking its own output against, the same way it
  checks the data is correct.

### Contributor tooling (Phase 1)

Building/maintaining Jugni itself uses Python as the tooling language, with
a Makefile as the standard interface so operations are consistent and
repeatable across contributors. **All of it runs inside Docker via
`docker-compose` — the host machine stays clean, and no app-related
command ever runs on the host, full stop.** Docker itself is the *only*
thing installed on the host; Python, pip packages, and any system-level
dependencies the Skills need (e.g. OCR/PDF-extraction libraries for the
raw-folder Intake path, section 2) live inside the container image, never
on the host. This isn't "a server" in the sense section 8 avoids — it's
local process isolation on the Contributor's own machine, not a
remote/hosted dependency.

- A `docker-compose.yml` at repo root defines the service (built from a
  `Dockerfile` alongside it): Python + every system dependency the Skills
  need, with the repo directory mounted as a volume so `raw/`, generated
  `trips/`, and `input.json`/`output.json` land on the host filesystem
  normally even though nothing actually executed on the host.
- **`make` targets stay the ergonomic interface (unchanged from a
  Contributor's or agent's perspective) but are thin wrappers around
  `docker-compose run`** — typing `make build` still works exactly as
  before; internally it runs inside the container.
- The image builds (or rebuilds, if `Dockerfile`/`docker-compose.yml`
  changed) automatically as a dependency of every other `make` target —
  nobody manually triggers an image build.
- **Common-operation targets**, so there's never a reason to reach for a
  raw `docker`/`docker-compose` command directly:
  - `make shell` — drops into an interactive shell *inside* the container
    (`docker-compose run --rm jugni bash`) for anything exploratory —
    checking a package version, poking at a file, debugging.
  - `make run CMD="..."` — runs an arbitrary one-off command inside the
    container (`docker-compose run --rm jugni $(CMD)`) — the sanctioned
    escape hatch for anything not covered by a named target below, so
    there's never a reason to fall back to running something on the host.
  - `make down` — stops and removes any running containers/volumes.
  - `make rebuild` — forces the image to rebuild from a clean state
    (`docker-compose build --no-cache`), for when the `Dockerfile` changes
    in a way the normal cache-aware rebuild might miss.

- `make build` — assemble the app shell (styles, JS, page templates) into
  the deployable static output. **Source stays multi-file for
  Contributors** (separate CSS/JS/template files — readable, diffable,
  lintable); `make build` bundles and minifies everything, including
  fonts, into the single self-contained output file. "Single file" and
  "no server" describe the *generated output* a Technical Traveler runs,
  never the development source.
- `make generate` — run the Intake/Convert Skills against the `raw/`
  folder (or a pre-digested text file) to produce that trip's `input.json`,
  then build that user's personalized Jugni instance from it. **If
  `input.json` already exists with manual edits and the raw data has since
  changed, `make generate` merges rather than overwrites:** fields the raw
  data newly supplies get added, fields that conflict with an existing
  manually-edited value are flagged in a warning summary (not silently
  overwritten either direction) and left for the user to resolve. A record
  the raw data no longer shows (e.g. a cancelled booking) is flagged for
  removal, not auto-deleted.
- `make update` — pull newly reviewed-and-locked Skills (section 6) and
  regenerate the affected parts without a full rebuild.
- `make validate` — check a generated `input.json` against the schema
  shape (section 4) before `make build` runs, so schema drift gets caught
  mechanically instead of only showing up when the rendered app breaks.

This tooling is a Contributor-side concern. What a Technical Traveler
(Phase 2) actually runs stays simple — see section 8.

## 3. Real travel pain points, and what addresses each

*(unchanged from v0.1 — still the justification for every feature)*

| Pain point | What actually goes wrong | Feature that fixes it |
|---|---|---|
| Info is scattered | Flights in email, hotel in an app, visa rules in a PDF, packing list in your head | Agent-driven intake consolidates it into one structured trip |
| "Did I already do that?" | Tasks get done then forgotten or re-checked | Checklist with due dates + a completion log |
| Budget creep | Spending tracked nowhere until the bill arrives | Running expense tracker vs. budget, multi-currency |
| Weather surprises plans | Wrong-season packing, no rain backup | Live forecast per city, tied to actual travel dates |
| Destination unfamiliarity | Don't know essentials until you land | Destination page: static essentials + live widgets |
| Multi-city logistics blur | Hard to picture "where am I on day 6" | Timeline view across cities and dates |
| Data fragility | Browser data, no account, no sync | Explicit export/import as a text file |
| Generic plans ignore who's traveling | A backpacker and a family get the same checklist | Persona-adapted intake (section 5) |

## 4. Internal schema (agent-facing only) — `input.json`

```json
{
  "trip": { "schemaVersion": "1.0", "name": "", "startDate": "", "endDate": "", "homeCurrency": "", "budget": 0, "notes": "", "theme": "light|dark" },
  "travelers": [
    { "id": "", "role": "primary|companion", "personaProfiles": [], "nickname": "", "email": "", "age": 0 }
  ],
  "cities": [
    { "id": "", "name": "", "country": "", "lat": 0, "lon": 0, "arriveDate": "", "departDate": "", "notes": "" }
  ],
  "transport": [
    { "id": "", "mode": "flight|train|ferry|car|bus|other", "from": "", "to": "", "departDateTime": "", "arriveDateTime": "", "bookingRef": "", "cost": 0, "currency": "", "notes": "" }
  ],
  "stays": [
    { "id": "", "cityId": "", "name": "", "address": "", "checkIn": "", "checkOut": "", "confirmationNumber": "", "cost": 0, "currency": "", "cancellationDeadline": "", "notes": "" }
  ],
  "checklist": [
    { "id": "", "task": "", "category": "", "cityId": "", "dueDate": "", "done": false, "completedDate": null }
  ],
  "expenses": [
    { "id": "", "label": "", "category": "", "amount": 0, "currency": "", "homeAmount": 0, "homeCurrency": "", "rateSnapshotDate": "", "date": "", "cityId": "" }
  ],
  "destinationNotes": [
    { "id": "", "cityId": "", "title": "", "body": "" }
  ],
  "log": [
    { "id": "", "date": "", "relatedType": "checklist|expense|stay|transport|extra", "relatedId": "", "type": "task|expense|note", "text": "" }
  ]
}
```

`travelers[].role: companion` is a stub for future multi-user linking —
schema supports it now, linking/sharing logic is not built in v1.
`travelers[].personaProfiles` is an array — a trip can combine profiles
(section 5), so a single traveler can too.

**Data conventions (engineering review addition):**
- **IDs** are generated once at creation (Contributor tooling can use
  short prefixed slugs — `city_berlin`, `stay_a1b2` — or UUIDs, either is
  fine) and must stay stable across `make update` regenerations. A Skill
  update must never regenerate existing IDs, only add new records or edit
  fields on existing ones — cross-references (`cityId`, `relatedId`)
  depend on this.
- **Datetimes** (`transport[].departDateTime`/`arriveDateTime`,
  `stays[].checkIn`/`checkOut`) are stored as ISO 8601 with an explicit
  UTC offset (e.g. `2026-09-13T15:20:00+02:00`) — the local time and
  offset of the relevant location, never a bare/ambiguous time string.
  This matters concretely here: a 12-city, multi-timezone trip is exactly
  where "what timezone is this?" bugs happen.
- **`schemaVersion`** on `trip` lets the app (and future Skill updates)
  know which schema shape a given `input.json` was generated against, so
  a schema change can be detected and migrated rather than silently
  misread.

**Security boundary (engineering review addition):** the `raw/` folder and
any generated per-trip `input.json` contain real PII — names, contact
details, GPS coordinates, confirmation numbers. These must never reach
the public Contributor repo: `raw/*` and any generated trip output are
`.gitignore`'d by default in the repo template, not an opt-in the
Contributor has to remember.

**Transport and stays — added from real-data testing.** The first real
trip run through the schema (section 10) was dominated by flight/train
legs and hotel bookings — structured, recurring data types the original
schema had nowhere proper to put. `transport[]` and `stays[]` above cover
these as first-class entities rather than forcing them into `expenses`
(losing itinerary meaning) or `extras` (losing structure for something
that isn't actually an edge case).

**Traveler name canonicalization.** The same real trip surfaced the same
person appearing as "Muhammad Sameer," "Sameer Muhammad," and
"SAMEER/MUHAMMAD" across three different booking platforms. The Convert
Skill must canonicalize name variants (last/first order, ticket-format
strings, casing) into a single `travelers[]` entry per person — using
matching email/phone across sources as the tie-breaker when names alone
are ambiguous — rather than creating duplicate traveler records.

**Confirmed vs. candidate data.** Raw folders don't only contain confirmed
bookings — the same trip's data included live-considered options (several
hotel links for one city, only one of which was actually booked)
alongside confirmed reservations. The Convert Skill must tell these apart:
only confirmed bookings (a confirmation number, a paid/booked status, a
ticket) populate `stays[]`/`transport[]`. Unconfirmed candidates are
either dropped or logged in `extras` as "considered but not booked" —
never given the same structural weight as an actual reservation.

**Incomplete raw data is normal, not an error.** The same trip's raw
folder covered most but not all legs (e.g., city-to-city transport was
implied by bookings on either side but not always documented directly).
The Intake Skill should build the city/transport list from what's
actually booked, note the gaps it finds rather than inventing dates to
fill them, and use the ask-questions path (section 2) to resolve gaps
with the user instead of silently guessing.

**Group trips that split — CONFIRMED (from real-data testing).** The same
trip showed part of the group diverging mid-trip (a companion's hostel
stay in one city while the primary traveler's flights show them elsewhere
on the same dates). Resolution: `cities`/`transport`/`stays` represent
**the primary traveler's actual itinerary** — the single source of truth
for the trip — not a branching per-traveler structure. A companion's
divergent booking gets logged as a note (via `extras`, tied to the
relevant city) rather than modeled as a second official itinerary.
Full per-traveler itineraries stay a Phase 3 concern, once companions are
real linked accounts rather than a local stub (section 7) — consistent
with Jugni being single-active-user-perspective for now (section 1).

**Unmodeled data — `extras[]`:** raw material almost never maps perfectly
onto a fixed schema — a festival date, a visa quirk, a packing tip that
doesn't fit "checklist," a local custom worth noting. Rather than drop
these or force them into the wrong bucket, the Convert Skill tries the
closest existing category first (a scheduling detail → `checklist`, a
place fact → `destinationNotes`), and only when nothing genuinely fits
does it fall into `extras`:

```json
"extras": [
  { "id": "", "cityId": "", "title": "", "displayHint": "list|table|text|link|auto", "content": "" }
]
```

`displayHint` is the Skill's best guess at how the *UI* should render it
(a bulleted list, a key-value table, a plain note, a link card) — the app
renders `extras` through a small set of adaptive components keyed off
that hint, so unmodeled data still looks like a native part of the page
rather than a dumped text block. `auto` lets the UI infer the shape from
the content's structure when the Skill isn't sure.

**Destination essentials — CONFIRMED:** `destinationNotes` gets a starter
set of agent-filled entries per city (emergency numbers, plug type, visa
reminder, and similar always-useful basics) so the user isn't starting
from a blank page — but every entry is a normal editable/overwritable
record, not a locked default. Priority stated plainly: the user should
spend less time in the app and get more out of it, so pre-fill first,
let them correct only what's wrong for their trip.

**Home currency — CONFIRMED:** `trip.homeCurrency` is set from direct user
input at intake (the agent asks, doesn't infer it). **Conversion is
snapshotted at entry time, not live at display** (revised from the
original live-only design): when an expense is added, the app fetches the
day's rate once, stores both the original `amount`/`currency` and the
converted `homeAmount`/`homeCurrency`/`rateSnapshotDate`. This keeps
budget totals stable and historically accurate — matching what was
actually paid — rather than shifting as exchange rates move after the
fact. Live conversion is still used for informational-only display (e.g.
a destination page showing "roughly what things cost here" before
anything is booked) — the snapshot rule applies specifically to recorded
expenses. If a rate can't be fetched at entry time (offline), the entry
is saved with `amount`/`currency` only and `homeAmount` filled in the next
time the app is online, still snapshotting the rate at that point rather
than leaving it perpetually live. **Currency authority rule (engineering
review addition):** several real booking docs show both an actual charge
in the property's local currency and a same-day home-currency estimate
labeled as an estimate. The Convert Skill stores the actual charged
amount and currency as `amount`/`currency` (with `homeAmount` computed via
the snapshot rule above) — never the raw home-currency estimate from the
document, which is itself just an unstable snapshot from whenever that
document was generated.

## 5. Traveler-need persona skills (reframed from identity → need) — CONFIRMED

This section **is a Skill** — a persona instruction file the agent reads
during Intake and Persona-adapt (section 2), not just spec prose. It ships
seeded with the 10 candidates below and evolves over time the same way
every other Skill does: an agent researches/observes patterns across real
trips' raw data and `input.json` files, proposes additions or edits to the
persona list, and a human Engineer reviews and locks the change (section
6) — no separate process for this Skill.

Instead of labeling profiles by identity, each profile is a need/style
axis. This gets the same benefit (relevant questions, relevant destination
emphasis) without assuming who someone is from a label — and each profile
is useful to anyone who shares the need, regardless of why they have it.
Confirmed direction: religion-driven needs (halal, kosher, prayer/observance
timing, etc.) stay in scope, under a need-based name rather than a religion
label — profile 1 below is the example.

Seed set (10, to start with — expected to grow/change via the process above):

1. **Dietary/practice-conscious** — halal, kosher, vegetarian/vegan, prayer
   or observance spaces, fasting-period timing
2. **Nightlife-focused** — bars, clubs, late-night food, safety-at-night info
3. **Adventure/outdoor** — hiking, permits, gear, physical difficulty
4. **Slow/cultural** — museums, history, pace, fewer stops per day
5. **Luxury/comfort** — higher-end stays, minimal logistics friction
6. **Budget/backpacker** — hostels, transit passes, cost-per-day tracking
7. **Family with kids** — kid-friendly pacing, nap/meal timing, safety
8. **Accessibility needs** — mobility, sensory, medical access considerations
9. **Solo traveler** — safety info, meeting-people options, single-friendly costs
10. **Wellness/retreat** — spas, quiet, minimal itinerary density

A trip can combine profiles (e.g., budget + adventure). The agent asks
which apply, rather than guessing from identity.

## 6. Skill maintenance and evolution — CONFIRMED

- Skills are not self-editing. An agent can **research and propose**
  updates to a Skill based on current information. A human Engineer
  reviews the proposal and **locks** the skill once approved. This
  propose → review → lock process is the same for every skill in Jugni —
  no per-skill exceptions.
- **Data for pattern-finding (confirmed scope):** Jugni stores email,
  **nickname**, and age as the only identity fields — kept deliberately
  minimal, and a nickname rather than a full legal name by design (also
  doubles as the export filename component, section 8) — plus
  the fuller travel data (checklist, expenses, destinations, log) that
  patterns are actually mined from. One refinement worth building in now
  rather than retrofitting later: keep the account fields (email/name/age)
  in a separate table/record from whatever feeds the pattern-mining
  process, so patterns get computed on travel data without the account
  identity attached to each record. Age in particular deserves care once
  companions can include children — treat it as sensitive even though it's
  in the minimal-field list. Same Phase-3 timing as before: this matters
  once there are real accounts, not for the Phase 1/2 single-file app.

## 7. Roadmap / user types

**Phase 1 — Contributor.** Builds and maintains the Skills, schema, and
reference app. Lives in a repo.

**Phase 2 — Technical Traveler.** Clones the repo, tells Claude "build my
Jugni," gets a single-file app generated from their own trip via the
Skills. Only host dependency is Docker (section 2) — no Python, no manual
install of anything else. No login, no database, no server — matches the
v0.1 constraints (localStorage + export/import). Includes the read-only snapshot and
forkable-instance sharing described in section 12 — group trips get
real per-person usability without waiting for Phase 3 accounts.

**Phase 3 — Customer/product.** Login, hosted database, real accounts,
eventually a phone app. Monthly fee is a far-future consideration, not a
v1/v2 concern. This phase is where the privacy-by-design requirement in
section 6 becomes mandatory rather than a note. **Shared/group expense
splitting** (who owes whom) is a natural fit here too, once `travelers[]`
companions are actually linked between accounts (section 4) rather than
just stubbed locally — it's one of the most consistently cited group-travel
pain points, so it's worth building once linking exists, not before.
**Shareable travel book (future plan, noted here):** once the native
Android/iOS wrap exists, on-device photo timestamps (primary signal)
and EXIF geotags (secondary, refines which city on overlapping travel
days) can be matched against `cities[]`'s existing `arriveDate`/
`departDate`/`lat`/`lon` — no schema change needed, those fields already
support it. Matching stays strictly on-device and opt-in: the app surfaces
candidate photos, the traveler chooses what actually goes into the shared
book, nothing is auto-uploaded or auto-included. Natural home for the
output is section 12's Trip Recap, extended with photos once this exists.

## 8. Non-functional constraints (Phase 1/2)

- Phase 2 output stays simple to run: a client-rendered app with no server
  and no account — but "single file" means *simple to run*, not
  single-page-feel. Client-side routing gives it real page navigation
  (section 1) while remaining something a Technical Traveler can just open
  in a browser. **Two supported build paths, both producing the same
  running app:** (a) `make generate` bakes a specific trip's data directly
  into the build output — one ready-to-open file per trip; (b) `make
  build` alone produces a generic empty shell, and a trip's data is loaded
  afterward via the in-browser Import feature — useful for the
  forking/sharing flows in section 12. All state in `localStorage` once
  running. **Import/export naming is role-based, not fixed-type:**
  `input.json` is whatever file a Jugni instance is built *from* —
  whether that's freshly agent-generated from raw data, or someone else's
  exported file. What a running Jugni exports is named
  **`output-<nickname>.json`** — using the traveler's own `nickname`
  (section 4/6) rather than a flat generic `output.json`, since a shared
  folder or chat thread can easily end up with several companions'
  exports side by side and a bare `output.json` would collide. The two
  share the exact same schema (section 4); the name just reflects which
  direction the file is moving in *right now*, plus whose it is. This is
  what makes chained sharing work: export `output-sam.json`, a friend
  imports it as their `input.json`, gets asked for their own
  email/nickname/age (section 2's fork-customization path), and their own
  later export (e.g. `output-jetlagged-koala.json`, section 2's playful
  nickname suggestion) can become the next person's `input.json` in turn.
  Both are plain JSON, not SQLite. JSON was chosen over SQLite for
  this phase: it already matches the internal schema, stays readable and
  diffable for Contributors, and needs no binary/database tooling for a
  single trip at a time. Phase 3's real backend can layer SQLite (or
  Postgres) under the same schema later without a redesign — that decision
  doesn't need to be made now.
- Live widgets (weather, currency, local time, country facts) call free,
  no-key APIs directly from the browser. Each caches its last-successful
  result; if a live call fails (offline, API down), the widget shows the
  cached value with a clearly labeled "last updated [date/time]" badge
  instead of breaking or showing nothing — validated by real-traveler
  feedback that connectivity drops are one of the most common failure
  points for travel apps.
- Baseline accessibility is a non-functional requirement for everyone, not
  just the accessibility persona (section 5): full keyboard navigation,
  screen-reader labels, visible focus states, and respecting
  reduced-motion preferences apply across the whole app by default.
- Built with Android/iOS in mind from the start (section 1's app-style
  navigation, responsive layout, no browser-specific hacks) so a future
  mobile wrap doesn't force a redesign — the wrap itself is out of scope
  for now.
- Future integrations (Google Calendar, social media, Booking.com, etc.)
  are noted but out of scope until Phase 3 has a backend to hold tokens
  properly.
- **Assets are embedded, never externally hosted, for the Phase 2
  output — expert recommendation.** CSS, JS, and fonts (section 11's
  type system) are all bundled into the single generated file at build
  time (section 2), never loaded from a remote host/CDN at runtime. A
  free-tier host reintroduces a server dependency the whole Phase 2 design
  exists to avoid, and risks the file quietly breaking years later if the
  host lapses — directly against section 12's Trip Recap / keepsake use
  case. Externally-hosted assets are the right call for Phase 3's actual
  hosted product (section 7), where a server already exists — just not
  for the portable per-trip file.

## 9. Success criteria

Seamless, easy interface; more integration over time; one place to handle
a trip end-to-end; genuinely AI-assisted rather than a static form. The bar
isn't "another travel app" — it's solving *easy to use* and *easy to
integrate* better than what's already out there.

## 10. Open decisions before build

All open items from this round are resolved:
- Persona profile(s) for the real test trip (section 4's real-data testing):
  **Budget/backpacker, Adventure/outdoor, Nightlife-focused** — confirmed
  by the user, not inferred from traveler identity, per section 5's
  need-based principle.
- Home currency for the test trip: **AUD**, matching the raw data throughout.

See section 11 for the design-token direction, decided next.

## 11. Design tokens (v1 direction)

Worked against the actual subject — a group backpacking trip with real
transit data (flights, layovers, confirmation numbers) — rather than
generic travel-app defaults. Explicitly avoids the two common AI-default
looks (warm cream + terracotta-serif; near-black + single acid accent).

**Palette** — cool stone paper, two working accents rather than one
decorative pop, since Jugni is a wayfinding tool, not a lifestyle blog.
Asked at intake (section 2) as an explicit light/dark choice, not just
inferred from OS preference — stored in `trip.theme`:

*Light:*
- `--bg #EDEEE7` (cool stone paper), `--surface #FFFFFF`,
  `--ink #1B2421` (deep ink), `--ink-soft #5C665F`, `--line #D6D9CD`
- `--brass #A9762C` — primary accent: progress, done-states, CTAs
  (luggage-tag brass)
- `--transit-blue #2C5271` — secondary accent: links, "you are here"
  (timetable-board blue)
- `--rust #A23B2E` — overdue/alerts only

*Dark:*
- `--bg #14181A` (near-black, warmer than pure black), `--surface #1C2123`,
  `--ink #E9E7DD`, `--ink-soft #9CA39A`, `--line #33393A`
- `--brass #C99A4E` — brightened for dark-surface contrast
- `--transit-blue #6FA0C4` — brightened for dark-surface contrast
- `--rust #D46B57` — brightened for dark-surface contrast

Both variants keep the same roles (brass = progress, transit-blue = links/
location, rust = alerts only) so switching theme never changes what a
color *means*, only how it renders — same principle as the accessibility
requirement in section 8.

**Type** — three roles, each earning its job: a condensed grotesk for
headers (departure-board character), a humanist sans for body/UI, and a
mono face reserved for actual ticket data — times, dates, prices,
confirmation numbers — since that data *is* mono-worthy content here, not
a stylistic add-on.

**Signature element — "the manifest thread":** the trip's real subject is
a sequence of cities connected by real transit legs, so the Overview isn't
cards in a grid — it's a single connected route line, stop after stop,
each stop styled like a ticket stub. The same thread reappears in
miniature as the nav's progress indicator. Structural, not decorative — it
only works because a real trip has a real route to show.

**Layout:** persistent nav rail (tab bar on mobile) styled like ticket
stubs, matching section 1's "feels like a real app" requirement. The
route-thread lives on Overview as the anchor view everything else hangs
off.

This direction is proposed, not yet built — build work (Contributor
tooling, `make generate` against the real trip, actual code) starts only
once explicitly requested; this spec stays the focus until then.

## 12. In-trip usability (experienced-traveler review)

Everything above covers *building* a great trip plan. This section covers
whether a traveler would actually keep using it once they're on the road —
jetlagged, on a phone, on patchy hostel wifi. That's where most
trip-tracking apps quietly die by day 2 or 3.

- **The default view is date-aware, not static.** Before the trip starts,
  opening Jugni shows an "Upcoming" summary. During the trip (today falls
  between `trip.startDate` and `endDate`), it opens straight to a **Today**
  view — current city, what's due today, the next transport leg — instead
  of making the traveler hunt through the full city list to figure out
  "where am I, what's next." After `endDate` passes, it opens to Trip
  Recap (below). This is the single highest-value navigation decision for
  actual daily use, not an aesthetic one.
- **Quick-capture, not a form.** Adding an expense from Today should be a
  2-tap flow — amount + category — with today's date and current city
  defaulted automatically. This matters more than it sounds: bringing *new*
  raw data into a live trip (a fresh receipt, a changed booking) normally
  requires re-running `make generate` from a laptop (section 2's Contributor
  tooling), which a traveler on the road with just a phone doesn't have.
  Quick-capture in the running app is the *only* way to add things while
  actually traveling — this is a stated limitation of the no-backend Phase
  2 design, not an oversight, and quick-capture is the mitigation for it.
- **Date-sensitive reminders via `.ics` export.** The real trip data was
  full of cancellation deadlines with hard cutoff times, and there's no
  server in Phase 2 to push a notification before one passes. A
  no-backend fix: any dated item (checklist due dates,
  `stays[].cancellationDeadline`, `transport[]` departure times) can be
  exported as a `.ics` file and added to the phone's own calendar, which
  already knows how to remind — solving the reminder problem without
  needing Phase 3's backend or real Calendar OAuth.
- **Empty/first-run offline state.** If the very first time Jugni opens is
  already offline, the "last updated" badge (section 8) has nothing to
  show yet. Widgets need an explicit "not yet available — connect once to
  fetch" state, not a blank or broken one.
- **Trip Recap.** Section 1 claims Jugni "stays useful... after" the trip
  but never defines what that means. Once `endDate` passes: total spent
  vs. budget, cities visited, checklist completion rate — gives the trip
  an actual close instead of the file just going stale. Also doubles as a
  natural on-ramp to the pattern-mining feedback loop in section 6, and
  the eventual home for the shareable photo travel book (section 7,
  Phase 3, future) once that exists.
- **Keep a pointer back to the source document.** `stays[]`/`transport[]`
  capture facts extracted *from* a PDF/photo, correctly not the document
  itself (no reason to bloat `localStorage` with base64 PDFs). Worth
  keeping the original filename in `notes` during Convert, so a traveler
  at check-in knows which email or downloads-folder file to actually pull
  up if they need the real boarding pass.
- **Weather-informed packing.** Checklist items tagged `category: packing`
  get cross-referenced against that item's `cityId` and the live weather
  widget for that city — a high rain-chance city surfaces a nudge next to
  relevant packing items (e.g. flagging "pack rain shell" when Oslo's live
  forecast shows high rain chance). This is a display-time behavior, not
  stored data — the weather widget already exists (section 8) and the
  checklist already has `category`/`cityId`; this just connects the two
  rather than leaving them as separate, unrelated screens.
- **Shareable and forkable trips — CONFIRMED.** Group trips (the real test
  trip is 5 people) currently mean only the primary traveler can see
  anything. Two levels, both built on the fact that `input.json` is
  already plain portable JSON:
  1. **Read-only snapshot** — a lightweight static export (no login, no
     edit capability, no `localStorage` writes) a companion can open and
     view without setting anything up — sendable via WhatsApp/email.
  2. **Forkable instance** — a companion imports the primary traveler's
     `output-<nickname>.json` as their own `input.json` (section 8's
     role-based naming) to get their **own independent, editable Jugni** —
     starts as a copy of the shared trip data, then Intake's
     fork-customization path (section 2) asks for their own
     email/nickname/age and they diverge immediately from there (their own
     checklist completion, their own expenses). Each companion ends up
     with a standalone Jugni, not a shared login — consistent with Phase 2
     having no accounts. The chain continues naturally: that companion's
     own later `output-<nickname>.json` can become a third person's
     `input.json` in turn, so a friend-of-a-friend can join the same trip
     without ever touching the original raw data. **This is specifically
     for forking the *same* trip.** Starting a genuinely *different* trip
     doesn't need a shared file at all — that's just the normal Phase 2
     flow (clone the repo, ask Claude to build a Jugni from scratch),
     available to anyone regardless of whether they were ever on someone
     else's trip.

## 13. Repo structure & AI-agent compatibility

The project is built by agents (Contributors delegating to Claude) and for
agents (Technical Travelers asking Claude to "build my Jugni"), so the
repo itself needs to be legible to an agent orienting cold, not just
readable by a human skimming it once.

**Root-level agent guide — `AGENTS.md`.** The first thing any agent reads
before touching anything. States the folder taxonomy below, what each
`make` target does, where Skills live and how the propose→review→lock
process works (section 6), and the non-negotiables: schema stays hidden
from users (section 2), the quality bar (section 2), offline-first and
embedded assets (section 8), the privacy boundaries (section 4/6), and
**the Docker-only rule (section 2), stated without exception: an agent
never runs Python, pip, or any app-related command directly on the host
— not even for a quick check. Every command goes through `make
<target>`, and if no named target fits, `make shell` or `make run
CMD="..."` are the only sanctioned ways to execute something inside the
container. There is no scenario where running a project command on the
host is the right call.** This is the single source of truth an agent
orients from — not something it has to reconstruct by exploring the
whole repo first.

**Predictable folder taxonomy:**
```
/skills/         — Skill instruction files: Intake, Convert, Persona-adapt,
                    the persona-profile Skill (section 5)
/src/            — app shell source: css/, js/, templates/, fonts/
                    (bundled + minified by `make build`, section 2)
/scripts/        — Python build tooling
/raw/            — a trip's raw data, gitignored (section 4's security boundary)
/trips/          — generated input.json/output.json + built output per
                    trip, gitignored (section 8's role-based naming)
/docs/           — this spec and related docs
Makefile
Dockerfile
docker-compose.yml
AGENTS.md
```

**Skills follow a self-describing frontmatter convention** — the same
pattern Claude's own Skills use: each Skill file opens with a short
`name`/`description` header so an agent can decide whether to read the
full file without loading the whole thing first. This is progressive
disclosure, not decoration — it's what keeps a growing Skill library (more
Skills, more persona profiles over time per section 5/6) usable inside a
limited context window instead of degrading as the project grows.

**Small, single-responsibility files over monoliths.** One Skill = one
file, one concern. A Skill that's grown to cover multiple unrelated
behaviors gets split, not left to sprawl — an agent should be able to load
only the relevant piece for a task, not read everything to find one
instruction. Same principle applies to `/src/` — no giant catch-all CSS/JS
file in the source (bundling into one file is `make build`'s job at
output time, section 2, not how the source should be organized).
