#!/usr/bin/env python3
"""`make generate` — Intake, then Convert, then build (spec §2).

Intake is split deliberately:

  * this script does the mechanical half — walk the raw folder, read every
    format (OCR photos, extract PDF text, parse spreadsheets, strip saved
    pages) and write one readable extract per file;
  * the Convert Skill does the interpretive half — an agent reads those
    extracts and writes input.json. Deciding that "SAMEER/MUHAMMAD" and
    "Muhammad Sameer" are one person, or that only one of three hotel links
    was actually booked, is judgement, and judgement does not belong in a
    regex here.

So a first run produces the extracts and stops with instructions. Once a
candidate conversion exists it is merged non-destructively into input.json.
"""

import argparse
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib import paths
from scripts.lib.extract import extract, meaningful_chars
from scripts.lib.merge import merge

SKIP = {".gitkeep", ".DS_Store", "Thumbs.db"}


def _droppable(folder: Path) -> list[Path]:
    """Files a traveller actually dropped in, ignoring the `.gitkeep` that
    keeps an empty inbox in git and the noise macOS and Windows leave behind."""
    if not folder.is_dir():
        return []
    return [p for p in folder.iterdir()
            if p.is_file() and p.name not in SKIP and not p.name.startswith(".")]


def gather(source: Path) -> list[Path]:
    if source.is_file():
        return [source]
    return sorted(
        p for p in source.rglob("*")
        if p.is_file() and p.name not in SKIP and not p.name.startswith(".")
    )


def _digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def run_intake(source: Path, out_dir: Path) -> dict:
    """Intake accumulates; it does not mirror whatever happens to be in `raw/`.

    A rebuild-from-scratch made `raw/` an archive you could never tidy: take a
    consumed booking PDF out of the folder and its extract silently vanished
    from extracts.md on the next run, taking the trip data with it. So the
    manifest is the record, `raw/` is an inbox, and a file that has been read
    once stays read — marked `present: false` once the original is gone.

    That also means a re-run only extracts what is new or has changed, instead
    of re-OCRing every PDF to arrive back where it started.
    """
    text_dir = out_dir / "text"
    text_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.json"

    known: dict[str, dict] = {}
    if manifest_path.exists():
        try:
            for rec in json.loads(manifest_path.read_text(encoding="utf-8")).get("files", []):
                if rec.get("file"):
                    known[rec["file"]] = rec
        except (ValueError, OSError) as exc:
            print(f"  ! manifest unreadable ({exc}) — starting a fresh one")

    files = gather(source) if source.exists() else []
    if not files and not known:
        print(f"intake: nothing in {source} — drop your booking PDFs, photos, "
              f"spreadsheets or notes in there, or pass FROM=path/to/summary.txt")
        return {"files": []}

    print(f"intake: {len(files)} file(s) in {source}, {len(known)} already read")
    seen, fresh, reused = set(), 0, 0

    for path in files:
        rel = str(path.relative_to(source)) if source.is_dir() else path.name
        seen.add(rel)
        safe = rel.replace("/", "__") + ".txt"
        digest = _digest(path)
        prior = known.get(rel)

        # Unchanged and its extract is still on disk: nothing to redo.
        if prior and prior.get("sha256") == digest and (text_dir / safe).exists():
            prior["present"] = True
            prior["lastSeen"] = date.today().isoformat()
            reused += 1
            print(f"  same  {prior.get('kind', '?'):11} {rel}")
            continue

        kind, text = extract(path)
        (text_dir / safe).write_text(text, encoding="utf-8")
        chars = meaningful_chars(text)
        status = "ok" if chars > 40 else ("empty" if kind != "error" else "error")
        known[rel] = {
            "file": rel, "kind": kind, "characters": chars,
            "extract": str((text_dir / safe).relative_to(paths.ROOT)),
            "status": status, "sha256": digest,
            "firstSeen": (prior or {}).get("firstSeen", date.today().isoformat()),
            "lastSeen": date.today().isoformat(), "present": True,
        }
        fresh += 1
        verb = "again" if prior else "new"
        print(f"  {status:5} {kind:11} {rel} ({chars} chars, {verb})")

    # Files read on an earlier run whose originals are no longer in `raw/`.
    archived = []
    for rel, rec in known.items():
        if rel in seen:
            continue
        extract_file = paths.ROOT / rec.get("extract", "")
        if not extract_file.exists():
            print(f"  ! {rel}: gone from {source} and its extract is missing too — dropping it")
            rec["_drop"] = True
            continue
        rec["present"] = False
        archived.append(rel)

    for rel in [r for r, rec in known.items() if rec.get("_drop")]:
        del known[rel]

    ordered = sorted(known.values(), key=lambda r: r["file"].lower())
    manifest = {
        "generatedOn": date.today().isoformat(),
        "source": str(source),
        "files": ordered,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    combined = ["# Raw intake extracts",
                "",
                "One section per source file. The Convert Skill reads this, not the",
                "originals. Keep the filename with each fact — spec §12 wants a pointer",
                "back to the source document in `notes`.",
                "",
                "Sections marked `archived` were read on an earlier run and their",
                "original has since been taken out of `raw/`. The extract below is all",
                "that is left of them, so treat it as the source of truth — but the",
                "traveller no longer has that document in the folder.",
                ""]
    for rec in ordered:
        body = (paths.ROOT / rec["extract"]).read_text(encoding="utf-8").strip()
        flag = "" if rec.get("present", True) else "  · archived"
        combined.append(f"\n\n## {rec['file']}  ({rec['kind']}){flag}\n")
        combined.append(body or "[no text extracted]")
    (out_dir / "extracts.md").write_text("\n".join(combined), encoding="utf-8")

    print(f"\n  {fresh} extracted, {reused} unchanged, {len(archived)} archived "
          f"(read earlier, original no longer in raw/)")
    if archived:
        print(f"    archived: {', '.join(sorted(archived))}")

    thin = [f["file"] for f in ordered if f["status"] != "ok"]
    if thin:
        print(f"\n  ! {len(thin)} file(s) yielded little or no text: {', '.join(thin)}")
        print("    Incomplete raw data is normal (spec §4) — note the gap, don't invent it.")
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--trip", default="default", help="trip slug under trips/")
    ap.add_argument("--from", dest="source", default="",
                    help="raw folder or a single pre-digested text file "
                         "(default: trips/<slug>/raw)")
    ap.add_argument("--name", default=paths.DEFAULT_INPUT,
                    help="which file under input/ to write (default: default)")
    ap.add_argument("--candidate", default="",
                    help="a freshly converted trip file to merge in (written by the Convert Skill)")
    args = ap.parse_args()

    # Step one for a new trip: make the folders. `make generate TRIP=mytrip`
    # used to fail on a raw folder nobody had been told to create, which made
    # the documented first command the one command that could not work.
    made = paths.scaffold(args.trip)
    moved = paths.migrate_legacy_input(args.trip)
    if moved:
        print(f"moved trips/{args.trip}/input.json -> {moved.relative_to(paths.ROOT)}\n")

    trip_dir = paths.trip_dir(args.trip)
    input_path = paths.trip_input(args.trip, args.name)
    raw_dir = paths.trip_raw(args.trip)

    source = Path(args.source) if args.source else raw_dir
    if not source.is_absolute():
        source = paths.ROOT / source

    if made:
        print(f"created {', '.join(str(d.relative_to(paths.ROOT)) for d in made)}")

    # Nothing to read and nothing ever read: this is a brand-new trip, so say
    # what to do next rather than failing. Not an error — it is step one.
    manifest_path = paths.trip_intake(args.trip) / "manifest.json"
    if source == raw_dir and not any(_droppable(raw_dir)) and not manifest_path.exists():
        rel = raw_dir.relative_to(paths.ROOT)
        print(f"\nTrip '{args.trip}' is ready for your files.\n")
        print(f"  1. Put whatever you have into {rel}/ — booking PDFs, photos of")
        print("     tickets, spreadsheets, saved pages, notes. Mixed formats are fine.")
        print(f"  2. Run this again: make generate TRIP={args.trip}")
        print("     Already have one plain-text summary instead? "
              f"make generate TRIP={args.trip} FROM=path/to/summary.txt")
        print(f"\nAlready have an exported trip? Drop it in "
              f"{paths.trip_input_dir(args.trip).relative_to(paths.ROOT)}/default.json "
              f"and run: make build TRIP={args.trip}")
        return 0

    if not source.exists() and not manifest_path.exists():
        print(f"error: {source} does not exist")
        return 1

    manifest = run_intake(source, paths.trip_intake(args.trip))

    # ---- Convert: merge a candidate if the agent has produced one ----
    if args.candidate:
        candidate_path = Path(args.candidate)
        if not candidate_path.is_absolute():
            candidate_path = paths.ROOT / candidate_path
        candidate = json.loads(candidate_path.read_text(encoding="utf-8"))

        if input_path.exists():
            existing = json.loads(input_path.read_text(encoding="utf-8"))
            merged, conflicts, notes = merge(existing, candidate)
            input_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")

            print(f"\nmerged into {input_path.relative_to(paths.ROOT)}")
            for n in notes:
                print(f"  +  {n}")
            if conflicts:
                print(f"\n  {len(conflicts)} conflict(s) — nothing was overwritten in either "
                      f"direction; resolve these yourself:")
                for c in conflicts:
                    print(f"  !  {c}")
        else:
            input_path.write_text(json.dumps(candidate, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"\nwrote {input_path.relative_to(paths.ROOT)}")
        return 0

    # ---- No candidate: hand off to the Convert Skill ----
    rel_input = input_path.relative_to(paths.ROOT)
    if input_path.exists():
        print(f"\n{rel_input} already exists.")
        print("Extracts have been refreshed. To fold new raw data into it without")
        print("losing manual edits, have the Convert Skill write a candidate and re-run:")
        print(f'  make run CMD="python scripts/generate.py --trip {args.trip} '
              f'--candidate trips/{args.trip}/candidate.json"')
        return 0

    if manifest["files"]:
        print(f"\nIntake done. {len(manifest['files'])} file(s) read into "
              f"trips/{args.trip}/intake/extracts.md")
        print("\nFrom here the raw files have been consumed — Convert reads the")
        print("extracts, never the originals. Next step is an agent's, not this script's:")
        print(f"  1. Read skills/02-convert.md and trips/{args.trip}/intake/extracts.md")
        print(f"  2. Write trips/{args.trip}/candidate.json in the schema (spec §4)")
        print(f'  3. make run CMD="python scripts/generate.py --trip {args.trip} '
              f'--candidate trips/{args.trip}/candidate.json"')
        print(f"  4. make validate TRIP={args.trip} && make build TRIP={args.trip}")
    print(f"\n(No {rel_input} yet — the build below produces the empty shell, which "
          "can still import a trip file in-browser.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
