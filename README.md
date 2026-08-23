# Jugni

A trip command centre: one place that turns messy pre-trip research into a
living plan — checklist, cities, expenses, weather, destination guide, a
day-by-day view — and stays useful during the trip and after it.

The defining principle: **it is simple to manage from your side.** You never
edit a schema or a JSON file. That complexity is pushed onto Claude, guided by
the instruction files in [`skills/`](skills/). You talk; the agent structures.

Full spec: [`docs/jugni-spec.md`](docs/jugni-spec.md).
Agents start at [`AGENTS.md`](AGENTS.md).

---

## If you want a Jugni for your own trip

You need **Docker**. Nothing else — no Python, no installs.

1. Drop whatever you have into `raw/` — booking PDFs, photos of tickets,
   spreadsheets, a `.csv`, screenshots, scribbled notes. Mixed formats are the
   expected case, not a problem.
   *Not comfortable with that?* Run your material through any AI tool yourself,
   get a plain-text summary back, and hand Jugni that one file instead
   (`FROM=my-summary.txt`). Both paths are supported equally.

2. Ask Claude to build your Jugni. It reads `skills/01-intake.md`, runs the
   extractors, asks you whatever the files did not answer, and writes your trip.

   ```
   make generate TRIP=mytrip
   ```

3. Open `trips/mytrip/jugni.html`. That is your app — one file, no server, no
   account, no login. Put it on your phone, open it on a plane.

Everything you do in it is stored in the browser. Export any time from **Trip
data** — you get `output-<yournickname>.json`, which is also how you share:
a friend imports it and gets their own independent copy of the same trip.

## If you are working on Jugni itself

Every command runs inside Docker. Nothing app-related ever runs on your host —
that is a project rule, not a preference. See AGENTS.md.

```
make help                 # all targets
make build                # bundle src/ into one self-contained file
make check                # verify it: JS parses, runs offline in jsdom, no remote assets
make validate TRIP=x      # check a trip's input.json against the schema
make shell                # a shell inside the container
make run CMD="..."        # anything else, inside the container
```

Source stays multi-file and readable (`src/css`, `src/js`, numbered by load
order). "Single file" describes the build *output*, never the source.

```
skills/    instruction files for the agent — intake, convert, personas, quality bar
src/       app shell source: css/ js/ templates/ fonts/
scripts/   Python build tooling
raw/       your trip's raw data — gitignored, contains real PII
trips/     generated trips and built apps — gitignored
docs/      the spec
```

## What it does that a notes app does not

| Problem | What Jugni does |
|---|---|
| Info scattered across email, apps, PDFs, and your head | One structured trip, assembled by an agent from whatever you have |
| "Did I already do that?" | Checklist with due dates and a completion log |
| Budget creep | Running expenses vs. budget, multi-currency, rates snapshotted when you spend so totals never drift |
| Weather surprises | Live forecast per city tied to your actual dates — and packing items get flagged against it |
| "Where am I on day 6?" | Opens on **Today** during the trip; the route is one connected thread of stops |
| Cancellation deadlines with no server to remind you | Export dated items as `.ics`; your phone already knows how to remind you |
| Patchy hostel wifi | Every live widget caches; offline it shows the cached value with a "last updated" stamp |
| Browser data disappears | Explicit export/import as plain JSON |
| Group trips where only one person can see anything | Read-only snapshot to send, or a forkable copy anyone can make their own |

## Status

Phase 1 (contributor tooling, Skills, reference app) and Phase 2 (a technical
traveller generating their own single-file app) are built. Phase 3 — accounts,
a hosted database, expense splitting between linked travellers, a native mobile
wrap — is deliberately out of scope, though the schema already leaves room for
it.
