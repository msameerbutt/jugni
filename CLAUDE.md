# CLAUDE.md

Operating instructions for Claude Code working on Jugni. Read this first, then
[AGENTS.md](AGENTS.md) for the full folder taxonomy and spec mapping.

**Jugni** turns messy pre-trip research into a living trip app. The user never
edits a schema — they talk, the agent structures. Spec:
[docs/jugni-spec.md](docs/jugni-spec.md); section references below (§4, §8, §11)
point there.

---

## The one rule that has no exceptions

**Never run Python, pip, node, or any project command on the host.** Docker is
the only thing installed there. Everything goes through `make`:

```
make build TRIP=x     make check TRIP=x     make validate TRIP=x
make generate TRIP=x  make icons            make shell
make run CMD="..."
```

`make shell` and `make run CMD="..."` are the sanctioned escape hatches. If you
are about to type `python scripts/...` at a host prompt, stop — use
`make run CMD="python scripts/..."` instead. This includes one-off scripts: to
run a throwaway script, write it into the repo root, `make run` it, then delete
it. The repo is bind-mounted; the scratchpad directory is not.

The image rebuilds automatically as a dependency of every target. Never trigger
a build by hand except `make rebuild` for a forced cacheless rebuild.

---

## Verify, don't assume

`make check` is not optional and not a formality. It:

1. parses the minified bundle with `node --check`;
2. **runs the built file in jsdom with `fetch` stubbed to reject** — so the
   offline path is what gets tested, not the happy path;
3. walks all nine routes asserting each renders, marks itself current in the
   nav, and sets a document title;
4. asserts every button has an accessible label;
5. asserts no remote asset and no unreplaced template placeholder.

This has already caught real bugs that reading the code did not: a nav link
missing `aria-current`, leg-matching comparing `OSL` to `Oslo` by name, per-day
spend dividing by total trip days mid-trip. **Never report work as done on the
strength of a successful build.** A build proves the file was written. `make
check` proves it runs.

When you change rendering, also read the rendered text back — write a temporary
jsdom script, `make run` it, delete it. Numbers and labels that look right in
source have been wrong on screen.

---

## Non-negotiables

**The schema stays hidden (§2).** Users never edit `input.json` or answer a
question phrased in schema terms. If a design step ends with "the user fills in
this field", it is wrong.

**"Looks amateur" is a defect class (§2).** Check the built file against
`skills/05-quality-bar.md` before calling anything ready. Cycle 01 confirmed
this is not theoretical — a two-number stat labelled `"cities · legs"` shipped
because nobody looked at the rendered output.

**Offline-first, assets embedded (§8).** CSS, JS, fonts and icons are inlined at
build time. Never a CDN, never a remote font, never a hosted asset. Live widgets
call free, **no-key** APIs only — a key baked into a file designed to be
forwarded to friends is a published key. Every widget caches its last success
and shows it with a "last updated" stamp when offline; a first run with no
network shows an explicit "not yet available", never a blank or a spinner.

**Privacy (§4, §6).** `raw/` and `trips/` hold real PII — names, emails, GPS
coordinates, confirmation numbers. Both are gitignored by default, not opt-in.
Never paste their contents into a commit message, a doc, or a shared artifact.
Identity is exactly three fields: email, nickname, age. Age is sensitive.

**Data conventions (§4).** IDs are minted once and never reminted —
cross-references depend on it. Datetimes are ISO-8601 with a real UTC offset in
the local time of the place. Expense conversion is snapshotted at entry, never
live at display. Only *confirmed* bookings become `stays[]`/`transport[]`;
candidates go to `extras[]`.

**Accessibility (§8)** is for everyone, not one persona: keyboard reachable,
labelled controls, visible focus, `prefers-reduced-motion` respected, contrast
holding in both themes.

**Single-responsibility files.** One Skill, one concern. `src/css` and `src/js`
are numbered — the number *is* the load order, so a new file's number is a
decision. Bundling into one file is `make build`'s job, never how source is
organised.

---

## Working with feedback

Feedback lives in [feedback/](feedback/), one folder per cycle, `original.md`
kept verbatim and never edited. The process is in
[feedback/README.md](feedback/README.md).

**Ask before implementing.** This is a standing instruction from cycle 01, not
a one-off. Read every item, write the analysis into `cycle-NN/review.md`, and
ask about anything that could reasonably be read two ways — especially where
feedback conflicts with the spec. Record answers in `decisions.md` before
touching code, and what shipped in `changelog.md` after.

Name conflicts explicitly rather than resolving them silently in code. Cycle
01's colour request contradicts §11's fixed colour roles; the right move was to
say so and offer a resolution, not to quietly loosen the palette.

---

## Landmines already hit

Recorded so they are not rediscovered:

- **`process.exit()` truncates piped stdout in Node.** A smoke test once
  "passed" silently with zero output. Set `process.exitCode` and let the
  process end, or `window.close()` a jsdom window.
- **Setting `location.hash` to its current value fires no `hashchange`** — an
  await on that event hangs forever and the process exits 0 with no output.
- **jsdom has no layout**, so `window.scrollTo` throws. Stub it in tests; it is
  an environment gap, not an app bug.
- **Full-`innerHTML` re-rendering** was the root cause of four cycle-01
  complaints — no exit animations, lost scroll and open/closed state. Replaced
  with Preact + htm in cycle 01. Do not reintroduce it.
- **A `sed`-style `.replace()` on an import line silently no-ops if an
  earlier edit already changed that exact string** — and an unimported htm
  component (`<${Foo}` with no `Foo` binding) compiles cleanly and only throws
  at runtime, in whichever branch happens to render it. This shipped twice in
  one sitting (copy-to-clipboard feature): once caught immediately by
  `make check`, once missed because the euro2026 fixture's trip hadn't started
  yet on the real system date, so the branch that crashed was never rendered
  during the walk. The second one was luck, not coverage. `make check` now
  runs `scripts/lint_components.py` first, which statically resolves every
  `<${Component}>` against that file's imports and local declarations —
  independent of which trip's data is loaded, so it can't depend on the
  calendar the way the route walk does. When editing an import line, prefer
  `Edit`'s exact-match semantics (which fails loudly) over a broad `sed`
  replace against remembered-but-unverified source text.
- **`matchMedia` is a bare identifier**, so `matchMedia?.()` still throws a
  ReferenceError where it is undefined (jsdom). Use `globalThis.matchMedia?.()`.
  The same applies to any browser global the smoke test host may lack.
- **Icon-name scanning must intersect with what is on disk.** A regex that
  required a hyphen silently missed five single-word icons, which shipped as
  empty boxes. Over-collect and intersect; never under-collect.
- **Two nested `.app` grids collapsed the whole layout.** The template's mount
  point was `<div class="app" id="app">` and the Shell rendered another `.app`
  inside it, so the content column became one 254px track wide. jsdom has no
  layout engine, so every DOM assertion passed while the page was visibly
  wrecked. `make check` now asserts exactly one `.app` holding `.rail` and
  `.main` — **structural assertions are the only layout coverage available**,
  so add one whenever a container's nesting matters.
- **Outbound HTTP is 403 from this environment.** The currency API and
  Wikivoyage both fail here. Design display paths so a live call is one option
  among several, never the only one — and do not ship network integrations that
  cannot be run and verified.
- **No screen accent may be a semantic colour** (brass / rust / transit-blue).
  Cycle 01 gave Today `brass`; `make check` now asserts against it.
- **circle-flags all define `id="a"`** for their clip mask. Dropped into one
  document unchanged, every flag renders the first one's mask — ids and their
  references are namespaced per symbol in `scripts/lib/sprite.py`.
- **`Intl.NumberFormat` with `style: "currency"`** emits the narrow symbol
  (`A$`), which is wrong for a dashboard. Format the number, place the code.
- **`raw/` PDFs vary wildly.** Some state the charged currency explicitly
  (Copenhagen: DKK, AUD "just an estimate"); some itemise in AUD. Read the
  document, do not pattern-match.
- **localStorage shadows a rebuilt file.** `Store.init` prefers the saved copy
  over the baked trip on purpose, so reopening never discards a traveller's
  edits — but that also means regenerating with new bookings and opening the
  file in the same browser shows the OLD trip, with the new data sitting
  unused in the very file being read. This was reported as "Prague and Vienna
  show no booking at all in the final html" when both were present in the
  build. `make check`ing the file proves nothing here: a fresh jsdom has empty
  storage and always sees the baked copy. The build now stamps
  `data-build="<sha12>"` on `#jugni-data`, the store records it beside the
  trip, and a mismatch raises an offer to load the new data — never an
  automatic swap, which would destroy ticked tasks and logged spend. When a
  regeneration "does not show up", check storage before checking the build.

---

## Quick reference

| Where | What |
|---|---|
| `skills/` | Agent instruction files — intake, convert, personas, quality bar |
| `src/css` | Stylesheets, numbered by load order |
| `src/app` | Preact + htm modules — `lib/ state/ data/ ui/ screens/`, entry `main.js` |
| `feedback/cycle-NN/` | original.md (immutable) · review.md · decisions.md · changelog.md |
| `default.json` | Standard checklist catalogue merged into every trip |
| `src/templates/app.html` | The shell; `{{STYLES}}`, `{{SCRIPTS}}`, `{{DATA}}` |
| `src/icons/` | `icons.txt` / `flags.txt` manifests + vendored SVGs (committed) |
| `scripts/build.py` | Bundler → single self-contained file |
| `scripts/check.py`, `scripts/smoke.js` | The verification harness |
| `scripts/lib/schema.py` | Schema definition + `make validate` |
| `scripts/lib/merge.py` | Non-destructive regeneration |
| `trips/<slug>/` | `input.json`, `jugni.html`, `intake/` — gitignored |
| `feedback/` | Review cycles, verbatim originals |

**Current trip:** `euro2026` — 11 cities, Melbourne → Istanbul → Berlin →
Copenhagen → Oslo → Abisko → Helsinki → Tallinn → Budapest → Vienna → Prague,
9–29 Sep 2026. Primary traveller `sameer`, home currency AUD, dark theme.
Four confirmed stays; Kiruna, Helsinki, Vienna and Prague are genuine gaps
tracked as checklist tasks, not oversights.
