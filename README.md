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

## Try it first

A complete worked trip ships with the repo — eleven stops, real structure,
invented names and bookings. Nothing to set up:

```
open trips/sample/jugni.html
```

That file is the whole app. No server, no account, no network.

---

## Create a trip

You need **Docker**. Nothing else — no Python, no installs.

### Step 1 — Make the trip

Always the first command. It creates the folders and tells you what to do next;
nothing needs to exist beforehand.

```
make generate TRIP=mytrip
```

```
trips/mytrip/
  raw/      ← your files go here
  intake/   ← what the agent read out of them
  input/    ← your trip, as data
```

### Step 2 — Put your material in `trips/mytrip/raw/`

Booking PDFs, photos of tickets, spreadsheets, a `.csv`, screenshots, scribbled
notes. Mixed formats are the expected case, not a problem. Scanned PDFs are
read with OCR.

*Would rather not?* Run your material through any AI tool yourself, get one
plain-text summary back, and hand Jugni that instead — it is a supported route,
not a lesser one:

```
make generate TRIP=mytrip FROM=my-summary.txt
```

### Step 3 — Read it in

```
make generate TRIP=mytrip
```

Every file is extracted to `trips/mytrip/intake/extracts.md`. Read the run's
report: a file listed as `unhandled` or `empty` did not survive extraction, and
its facts are simply absent.

### Step 4 — Ask Claude to build the trip

> "Build my Jugni for TRIP=mytrip"

It reads [`skills/01-intake.md`](skills/01-intake.md) and
[`skills/02-convert.md`](skills/02-convert.md), works through the extracts, asks
you whatever the files did not answer — currency, budget, who is travelling —
and writes `trips/mytrip/input/default.json`.

**You never edit that file.** That is the whole point: you talk, the agent
structures.

### Step 5 — Open it

```
make build TRIP=mytrip
```

Open `trips/mytrip/jugni.html`. One file — put it on your phone, open it on a
plane, mail it to whoever is coming with you.

---

## Update an existing trip

Four kinds of change, four answers.

### A new booking came through

Drop the file into `trips/mytrip/raw/` and read it in:

```
make generate TRIP=mytrip
```

Only the new file is read — everything already extracted stays, so this is fast
even with thirty documents. Then ask Claude to fold it in:

> "Update TRIP=mytrip from the new files in raw"

It merges non-destructively: new facts get added, anything that contradicts what
is already there is **reported rather than overwritten**, and nothing you have
changed by hand is lost.

### A booking changed

Replace the file in `raw/` with the updated one and run the same command.
Intake notices the contents differ and re-reads just that file.

### You have been using the app and want that state baked in

Everything you do in the app lives in your browser. Export any time from
**Trip data** → you get `output-<yournickname>.json`. That is also how you
share: a friend imports it and gets their own independent copy.

Drop the export into `trips/mytrip/input/` and build from it:

```
trips/mytrip/input/
  default.json          the trip itself — what `make generate` writes, and what builds by default
  output-alex.json      an export dropped back in
  input1.json           another one
```

```
make build TRIP=mytrip                       # builds input/default.json
make build TRIP=mytrip NAME=output-alex      # builds input/output-alex.json instead
```

`NAME=` is the filename without `.json`. Both write to
`trips/mytrip/jugni.html`, so add `OUT=trips/mytrip/other.html` to keep the two
side by side.

**To make an export the trip from now on,** hand it to Claude rather than
renaming it yourself:

> "Update TRIP=mytrip from output-alex.json"

It is not a copy job. An export carries ticked tasks, logged spend and items you
deleted, and folding new bookings into that without trampling any of it is
exactly what [`skills/02-convert.md`](skills/02-convert.md) is for.

### Jugni itself got better

The app and your data are separate. Rebuild to get the new app with your trip
unchanged:

```
make build TRIP=mytrip
```

Reopening the file in a browser you have used before will notice the rebuild and
offer to load the new data — it never swaps it out from under you, because your
saved copy holds ticked tasks the rebuild has never seen.

---

## After the first run, `raw/` is an inbox

Once a file has been read, its text lives in `trips/mytrip/intake/` and **the
agent works from there, not from your original**. So you can move consumed files
out of `raw/` to keep it clear — nothing is lost, and files you take out are
marked `archived` in the extracts so the agent knows the text is all that
remains of them.

**Keep your originals somewhere.** The extract is text only: a boarding-pass
barcode, a QR code and the page layout do not survive it, and every booking in
your trip names the document it came from. Move them to a folder of your own
rather than deleting them.

---

## Command reference

| I want to… | Command |
|---|---|
| See the example trip | `open trips/sample/jugni.html` |
| Start a trip | `make generate TRIP=mytrip` |
| Read new files I just added | `make generate TRIP=mytrip` |
| Use one plain-text summary instead of a folder | `make generate TRIP=mytrip FROM=my-summary.txt` |
| Rebuild the app after a data change | `make build TRIP=mytrip` |
| Build from an export instead | `make build TRIP=mytrip NAME=output-alex` |
| Check the trip data is sound | `make validate TRIP=mytrip` |
| Prove the built file actually runs | `make check TRIP=mytrip` |
| Remove build artefacts (never your data) | `make clean TRIP=mytrip` |
| See every target | `make help` |

`TRIP=` defaults to `sample`, so a bare `make check` verifies the example.

---

## If you are working on Jugni itself

Every command runs inside Docker. Nothing app-related ever runs on your host —
that is a project rule, not a preference. See AGENTS.md.

```
make help                 # all targets
make build                # bundle src/ into one self-contained file
make check                # verify it: JS parses, runs offline in jsdom, no remote assets
make test                 # tooling tests: path/input resolution, intake accumulation
make icons                # vendor icon/flag SVGs from the image into src/icons/
make validate TRIP=x      # check a trip's input file against the schema
make sample               # rebuild the committed sample after any schema change
make blank                # the empty shell (build path b)
make shell                # a shell inside the container
make run CMD="..."        # anything else, inside the container
```

`make check` verifies the built app; `make test` verifies the Python that
produces it. Neither is optional before calling something done.

Source stays multi-file and readable — `src/css` numbered by load order,
`src/app` as Preact + htm ES modules bundled by esbuild. "Single file"
describes the build *output*, never the source.

```
skills/       instruction files for the agent — intake, convert, personas, quality bar
src/          app source: css/ app/ templates/ fonts/ icons/
default.json  standard checklist categories and items merged into every trip
feedback/     review cycles, originals kept verbatim
scripts/      Python build tooling
src/icons/ vendored Lucide icons + circle-flags, with their licences
tests/     pytest for the tooling — `make test`
trips/     one folder per trip — gitignored, contains real PII
trips/sample/ the one committed trip: a worked example with invented details
docs/      the spec
```

Each trip owns its whole working set; nothing is shared between trips:

```
trips/<slug>/
  raw/                 inbox — you drop files here, and may empty it once read
  intake/
    text/              one extract per file read
    extracts.md        what the Convert Skill reads
    manifest.json      what has been read, and whether the original is still in raw/
  input/
    default.json       the trip
    input1.json        an export dropped back in
  jugni.html           the built app
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
