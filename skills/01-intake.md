---
name: jugni-intake
description: Gather a trip's material — by asking, by reading a raw/ folder of mixed files, or by accepting a pre-digested summary or someone else's exported Jugni file — and end with everything needed to write input.json. Read this first when someone says "build my Jugni".
---

# Intake

Your goal: end with enough material to write `input.json`, and with the user
having answered as few questions as possible. **The user never edits a schema
or a JSON file.** They talk; you structure.

## Pick the path from what they have

**Raw-folder path.** They dropped files into `raw/` — `.txt`, photos, PDFs,
`.csv`, `.xlsx`, screenshots, booking confirmations, notes.

```
make generate TRIP=<slug>
```

Run it once to create the trip's folders, then again once files are in
`trips/<slug>/raw/`. It runs the extractors (OCR, PDF text, spreadsheets, saved
pages) and writes `trips/<slug>/intake/extracts.md`. Read that, not the
originals. Then follow `02-convert.md`.

**Intake accumulates.** Each file is read once, keyed by its contents, and its
extract is kept — so the traveller may empty `raw/` afterwards, and a re-run
only reads what is new or has changed. A section marked `archived` means the
original is gone and the extract is all that survives of it; treat it as the
source of truth, but do not tell the traveller to open a file they no longer
have.

Check the run's own report before reading the extracts. A file listed as
`unhandled`, `empty`, or with a suspiciously small character count did not
survive extraction, and its facts are simply absent from `extracts.md` — that
is a gap to raise, not a file to quietly skip.

**Pre-digested path.** They ran their material through some other AI tool and
have one plain-text summary. Same command, `FROM=path/to/summary.txt`. Do not
make them feel this is the lesser path — it is a supported route, not a
fallback.

**Fork-customization path.** The file they handed you is someone else's
`output-<nickname>.json` — recognisable because it already matches the schema
and already has a `travelers[]` entry with `role: primary`. This is a fork of a
shared trip (spec §12), so:

- Keep the trip data as-is. It is the same trip.
- Ask the new user for **their own** `email`, `nickname` and `age` — the three
  identity fields Jugni keeps (spec §6) — and make them the `primary`, moving
  the previous owner to `companion`.
- If they have no nickname ready, **suggest three playful ones and move on.**
  Do not block on it. This is a friend who wants to see the trip, not fill in a
  form.

**Questions path.** They have nothing prepared. Ask — but ask well (below).

The paths combine. A raw folder with gaps plus four questions is the normal case.

## What you always need

Ask for these directly; never infer them:

1. **Destination(s)** and rough shape of the route
2. **Dates** — start and end
3. **Home currency** — ask. Do not guess it from their location or their
   bookings. (spec §4)
4. **Budget** — a number in the home currency, or "no budget set"
5. **Theme** — light or dark, as an explicit choice, not read off the OS (spec §11)
6. **Traveller needs** — see `03-persona-adapt.md`; ask which profiles apply
7. **Their nickname, email, age** — the only identity fields Jugni stores

## Asking well

- Batch questions. One message with six short questions beats six messages.
- Offer a default with every question so "sounds right" is a valid answer.
- Never ask for something the raw data already answers. Reading the extracts
  first is what earns you the right to ask fewer questions.
- Say what you found before you ask: *"I've got 6 cities and 9 bookings from
  your folder. Three things I couldn't work out: …"*

## Gaps are normal, not errors

Real raw folders are incomplete (spec §4). A city-to-city hop is often implied
by bookings on either side without ever being documented.

**Build from what is actually booked, list the gaps, and ask.** Never invent a
date, a price, or a leg to make the itinerary look complete. A visible gap is
useful information; a plausible fabrication is a trap the traveller finds out
about at a station.

## Then

Hand off to `02-convert.md`. Do not write `input.json` from this file.
