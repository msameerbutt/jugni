# AGENTS.md

Read this before touching anything in this repo. It is the single source of
truth you orient from — you should not have to explore the whole tree to
reconstruct it.

Jugni is a trip command centre: it turns messy pre-trip research into a living
plan and stays useful during the trip and after it. The full spec is
`docs/jugni-spec.md`; section numbers below refer to it.

---

## The Docker-only rule — no exceptions

**You never run Python, pip, or any app-related command directly on the host.
Not even for a quick check.**

Docker is the only thing installed on the host. Python, every pip package, and
every system dependency the Skills need (OCR, PDF extraction) live inside the
image. Every command goes through `make <target>`. If no named target fits:

```
make shell                  # interactive shell inside the container
make run CMD="..."          # one-off command inside the container
```

Those two are the sanctioned escape hatches. There is no scenario where running
a project command on the host is the right call. If you find yourself typing
`python scripts/...` at a host prompt, stop.

The image rebuilds automatically as a dependency of every target — never
trigger a build by hand. `make rebuild` exists for a forced, cacheless rebuild
when the `Dockerfile` changes in a way the cache might miss.

## Make targets

| Target | What it does |
|---|---|
| `make build` | Bundle `src/` into one self-contained file. `TRIP=<slug>` bakes that trip's data in; without an `input.json` you get the generic empty shell. |
| `make generate` | Run intake over `raw/` (or `FROM=summary.txt`), write extracts, then merge a Convert candidate into `input.json` and build. Intake **accumulates**: a file is extracted once (matched by content hash), and an original taken out of `raw/` keeps its extract, marked `archived`. |
| `make sample` | Rebuild `trips/sample` — the only committed trip — from the reference trip, then validate, build and check it. **Run after any schema or content change.** |
| `make host` | Also emit `trips/<slug>/hosted/` — the same app as an installable PWA (manifest, service worker, icons), then check it. See [`docs/hosting-and-pwa.md`](docs/hosting-and-pwa.md). |
| `make blank` | Build the empty shell (build path (b)) to `dist/jugni.html`. |
| `make icons` | Vendor icon/flag SVGs from the image into `src/icons/`. `FLAGS=all` for every flag. |
| `make check` | **Verify** a built file: parse the bundle, then run it in jsdom with `fetch` rejecting. Not optional. |
| `make validate` | Check an `input.json` against the schema shape (§4) before building. |
| `make update` | Report which Skills changed since a trip was generated, and rebuild the shell. Never regenerates data silently. |
| `make shell` / `make run CMD=` | Anything else, inside the container. |
| `make down` / `make rebuild` / `make clean` | Stop containers / force a clean image / remove build artifacts. |

Variables: `TRIP=<slug>` (default `default`), `INPUT=`, `OUT=`, `FROM=`.

## Folder taxonomy

```
/skills/     Skill instruction files — Intake, Convert, Persona-adapt,
             the persona profiles, the quality bar, skill maintenance
/src/        App shell source:
               css/        numbered — the number IS the load order
               app/        Preact + htm modules (lib/ state/ data/ ui/ screens/)
               templates/  the HTML shell
               fonts/      optional .woff2, embedded at build
               icons/      manifests + vendored SVGs (committed)
default.json The standard checklist catalogue merged into every trip (§4)
/scripts/    Python build tooling
/raw/        A trip's raw data — gitignored (§4 security boundary).
             An inbox, not an archive: intake reads each file once and keeps
             the extract, so a consumed original can be filed away elsewhere.
             Keep the originals somewhere — the extract is text only, so
             barcodes, QR codes and layout do not survive it, and every
             `sourceFile` in input.json points at the document by name.
/trips/      One folder per trip — gitignored, EXCEPT trips/sample, which is
             committed on purpose and contains no real data. Regenerate it with
             `make sample` whenever the schema or the app changes.
/docs/       The spec and related docs
Makefile  Dockerfile  docker-compose.yml  AGENTS.md
```

`src/css` files are numbered: the number **is** the load order, so a new file's
number is a real decision. `src/app` is bundled by esbuild from `main.js`, so
imports carry the ordering there.

**The UI runs on Preact + htm** (~5 KB, bundled in). Rendering is diffed, not
re-generated — that is what allows exit animations, preserved scroll and
remembered open/closed state. Do not reintroduce full-`innerHTML` rendering.

## Where the Skills live and how they change

`/skills/`, one file per concern, each opening with `name`/`description`
frontmatter so you can decide whether to read the whole file. Start at
`skills/README.md`.

Skills are **not self-editing.** An agent researches and *proposes* a change; a
human Engineer reviews and **locks** it. Same process for every Skill including
the persona list. See `skills/06-skill-maintenance.md`. Do not edit a Skill file
and mention it afterwards.

---

## Non-negotiables

**The schema stays hidden from users (§2).** Nobody using Jugni edits
`input.json` or answers a question phrased in schema terms. They talk; you
structure. If a design step ends with "the user fills in this field", it is wrong.

**The quality bar is a defect class (§2).** "Looks amateur" is a bug, checked
the same way wrong data is checked. Run `skills/05-quality-bar.md` against the
built file before saying it is ready.

**Offline-first, assets embedded (§8).** CSS, JS, fonts and icons are inlined
into the generated file at build time. Icons ship as an inline SVG sprite, never
as base64 images and never from a remote host. Never a CDN, never a remote font, never a
free-tier host — a host that lapses is how a trip keepsake quietly breaks years
later. Live widgets call free, no-key APIs directly and always cache their last
success; a failed call shows cached data with a "last updated" stamp, and a
first run with no network shows an explicit "not yet available" state, never a
blank.

**The single file stays self-contained (§8).** `make host` adds a *second*
output for hosting — manifest, service worker, icons — and the PWA tags live
only in that copy. Never put a `<link rel="manifest">` or a service-worker
registration into `jugni.html`: it would reference siblings that do not exist
in the one artifact whose promise is that nothing it needs lives elsewhere.

**Browser storage is scoped per trip.** Every trip builds to a file named
`jugni.html`, so trip state is keyed `jugni.trip.v1::<tripKey>` from the
`data-trip` stamp the build writes. Anything trip-specific added to
localStorage must be scoped the same way, or two trips open in one browser
overwrite each other. Per-viewer preferences stay unscoped.

**Privacy boundaries (§4, §6).** `raw/` and everything under `trips/` contain
real PII — names, contact details, GPS coordinates, confirmation numbers. Both
are gitignored by default, not opt-in. Identity is three fields: email,
nickname, age. Keep account fields separate from whatever pattern-mining reads.
Age is sensitive, especially once companions include children.

**Data conventions (§4).** IDs are minted once and never reminted — cross
references depend on it. Datetimes are ISO-8601 with a real UTC offset in the
local time of the place. Expense conversion is snapshotted at entry time, never
live at display. Only confirmed bookings become `stays[]`/`transport[]`.

**Baseline accessibility (§8)** applies to the whole app for everyone, not just
the accessibility persona: full keyboard navigation, screen-reader labels,
visible focus, and `prefers-reduced-motion` respected.

**Small, single-responsibility files.** One Skill, one concern; one source file,
one job. Bundling into a single file is `make build`'s job at output time — it
is never how the source is organised.

---

## Two build paths, one running app (§8)

(a) `make generate TRIP=x` bakes a specific trip into the output — one
ready-to-open file per trip.
(b) `make build` alone produces the empty shell; a trip loads afterwards
through the in-browser Import. This is what makes the fork/share flows work.

Import/export naming is **role-based, not fixed-type**: `input.json` is whatever
a Jugni instance is built *from*; a running Jugni exports
`output-<nickname>.json`. Same schema — the name just says which direction the
file is moving and whose it is.

## Phases

- **Phase 1 — Contributor.** This repo: Skills, schema, reference app.
- **Phase 2 — Technical Traveller.** Clones the repo, says "build my Jugni",
  gets a single-file app. Only host dependency is Docker. No login, no server.
- **Phase 3 — Product.** Accounts, hosted DB, mobile app. Out of scope here.

Anything scoped Phase 3 in the spec (real companion linking, expense splitting,
photo travel book, OAuth integrations) is out of scope. Do not build toward it
speculatively — but do not make it impossible either, which is why
`travelers[].role: companion` and the `cities[].lat`/`lon` fields already exist.
