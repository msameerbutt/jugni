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
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib import paths
from scripts.lib.extract import extract
from scripts.lib.merge import merge

SKIP = {".gitkeep", ".DS_Store", "Thumbs.db"}


def gather(source: Path) -> list[Path]:
    if source.is_file():
        return [source]
    return sorted(
        p for p in source.rglob("*")
        if p.is_file() and p.name not in SKIP and not p.name.startswith(".")
    )


def run_intake(source: Path, out_dir: Path) -> dict:
    files = gather(source)
    if not files:
        print(f"intake: nothing in {source} — drop your booking PDFs, photos, "
              f"spreadsheets or notes in there, or pass FROM=path/to/summary.txt")
        return {"files": []}

    text_dir = out_dir / "text"
    text_dir.mkdir(parents=True, exist_ok=True)

    manifest = {"generatedOn": date.today().isoformat(), "source": str(source), "files": []}
    print(f"intake: reading {len(files)} file(s) from {source}")

    combined = ["# Raw intake extracts",
                "",
                "One section per source file. The Convert Skill reads this, not the",
                "originals. Keep the filename with each fact — spec §12 wants a pointer",
                "back to the source document in `notes`.",
                ""]

    for path in files:
        kind, text = extract(path)
        rel = path.relative_to(source) if source.is_dir() else path.name
        safe = str(rel).replace("/", "__") + ".txt"
        (text_dir / safe).write_text(text, encoding="utf-8")

        chars = len(text.strip())
        status = "ok" if chars > 40 else ("empty" if kind != "error" else "error")
        manifest["files"].append({
            "file": str(rel), "kind": kind, "characters": chars,
            "extract": str((text_dir / safe).relative_to(paths.ROOT)), "status": status,
        })
        print(f"  {status:5} {kind:11} {rel} ({chars} chars)")

        combined.append(f"\n\n## {rel}  ({kind})\n")
        combined.append(text.strip() or "[no text extracted]")

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (out_dir / "extracts.md").write_text("\n".join(combined), encoding="utf-8")

    thin = [f["file"] for f in manifest["files"] if f["status"] != "ok"]
    if thin:
        print(f"\n  ! {len(thin)} file(s) yielded little or no text: {', '.join(thin)}")
        print("    Incomplete raw data is normal (spec §4) — note the gap, don't invent it.")
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--trip", default="default", help="trip slug under trips/")
    ap.add_argument("--from", dest="source", default="",
                    help="raw folder or a single pre-digested text file (default: raw/)")
    ap.add_argument("--candidate", default="",
                    help="a freshly converted input.json to merge in (written by the Convert Skill)")
    args = ap.parse_args()

    trip_dir = paths.trip_dir(args.trip)
    trip_dir.mkdir(parents=True, exist_ok=True)
    input_path = trip_dir / "input.json"

    source = Path(args.source) if args.source else paths.RAW
    if not source.is_absolute():
        source = paths.ROOT / source

    if not source.exists():
        print(f"error: {source} does not exist")
        return 1

    manifest = run_intake(source, trip_dir / "intake")

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
    if input_path.exists():
        print(f"\ninput.json already exists at {input_path.relative_to(paths.ROOT)}.")
        print("Extracts have been refreshed. To fold new raw data into it without")
        print("losing manual edits, have the Convert Skill write a candidate and re-run:")
        print(f'  make run CMD="python scripts/generate.py --trip {args.trip} '
              f'--candidate trips/{args.trip}/candidate.json"')
        return 0

    if manifest["files"]:
        print(f"\nIntake done. {len(manifest['files'])} file(s) extracted to "
              f"trips/{args.trip}/intake/extracts.md")
        print("\nNext — the Convert step, which is an agent's job, not this script's:")
        print(f"  1. Read skills/02-convert.md and trips/{args.trip}/intake/extracts.md")
        print(f"  2. Write trips/{args.trip}/candidate.json in the schema (spec §4)")
        print(f'  3. make run CMD="python scripts/generate.py --trip {args.trip} '
              f'--candidate trips/{args.trip}/candidate.json"')
        print(f"  4. make validate TRIP={args.trip} && make build TRIP={args.trip}")
    print("\n(No input.json yet — the build below produces the empty shell, which can "
          "still import a trip file in-browser.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
