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

### The whole thing, in four commands

```
make generate TRIP=mytrip          # 1. make the folders
                                   # 2. put your files in trips/mytrip/raw/
make generate TRIP=mytrip          # 3. read them  → then ask Claude to build the trip
make build    TRIP=mytrip          # 4. open trips/mytrip/jugni.html
```

Anything you change later is the same two lines: put the new file in `raw/`,
run `make generate TRIP=mytrip` again, ask Claude to fold it in.

| I want to… | Command |
|---|---|
| Start a trip | `make generate TRIP=mytrip` |
| Read new files I just added | `make generate TRIP=mytrip` |
| Use one plain-text summary instead of a folder | `make generate TRIP=mytrip FROM=my-summary.txt` |
| Rebuild the app after a data change | `make build TRIP=mytrip` |
| Rebuild from an export someone sent me | `make build TRIP=mytrip NAME=output-nazia` |
| Check the trip data is sound | `make validate TRIP=mytrip` |
| Prove the built file actually runs | `make check TRIP=mytrip` |
| See every target | `make help` |

The long version follows.

**1. Make the trip.** This is always the first command. It creates the folders
and tells you what to do next; it does not need anything to exist first.

```
make generate TRIP=mytrip
```

```
trips/mytrip/
  raw/      ← put your files here
  intake/   ← what the agent read out of them
  input/    ← your trip, as data
```

**2. Put your material in `trips/mytrip/raw/`** — booking PDFs, photos of
tickets, spreadsheets, a `.csv`, screenshots, scribbled notes. Mixed formats are
the expected case, not a problem.

*Not comfortable with that?* Run your material through any AI tool yourself, get
a plain-text summary back, and hand Jugni that one file instead
(`make generate TRIP=mytrip FROM=my-summary.txt`). Both paths are supported
equally.

**3. Ask Claude to build your Jugni.** It reads
[`skills/01-intake.md`](skills/01-intake.md), runs the same command again to
extract everything, asks you whatever the files did not answer, then follows
[`skills/02-convert.md`](skills/02-convert.md) to write your trip.

```
make generate TRIP=mytrip
```

**4. Open `trips/mytrip/jugni.html`.** That is your app — one file, no server,
no account, no login. Put it on your phone, open it on a plane.

### After the first run, `raw/` is an inbox

Once a file has been read, its text lives in `trips/mytrip/intake/` and **the
agent works from there, not from your original**. So you can move consumed files
out of `raw/` to keep it clear — nothing is lost, and the next run is faster
because unchanged files are not read twice.

- **New details later?** Drop the new file into `raw/` and run
  `make generate TRIP=mytrip` again. Only the new file is read; everything
  already extracted stays.
- **A booking changed?** Replace the file with the updated one. Intake notices
  the contents differ and re-reads just that file.
- Files you take out are marked `archived` in the extracts, so the agent knows
  the text is all that is left of them.

**Keep your originals somewhere.** The extract is text only — a boarding pass
barcode, a QR code and the page layout do not survive it, and each booking in
your trip names the document it came from. Move them to a folder of your own
rather than deleting them.

### Rebuilding from an export

Everything you do in the app is stored in your browser. Export any time from
**Trip data** — you get `output-<yournickname>.json`. That is also how you
share: a friend imports it and gets their own independent copy.

Drop an export back into `trips/mytrip/input/` to rebuild the app with that
state baked in, instead of going back to the original trip:

```
trips/mytrip/input/
  default.json          the trip itself — what `make generate` writes, and what builds by default
  output-nazia.json     an export someone sent back
  input1.json           another one
```

```
make build TRIP=mytrip                        # builds input/default.json
make build TRIP=mytrip NAME=output-nazia      # builds input/output-nazia.json instead
```

`NAME=` is the filename without `.json` — leave it off and you get
`default.json`. Both write to `trips/mytrip/jugni.html`, so add
`OUT=trips/mytrip/other.html` if you want to keep the two side by side.

**To make an export the trip from now on,** hand it to Claude rather than
renaming it yourself. It is not a copy job: an export carries ticked tasks,
logged spend and deleted items, and folding new bookings into that without
trampling any of it is the whole point of
[`skills/02-convert.md`](skills/02-convert.md). Say *"update TRIP=mytrip from
output-nazia.json"* and it becomes `default.json` with your edits intact.

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
