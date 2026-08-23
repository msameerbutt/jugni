#!/usr/bin/env python3
"""`make update` — re-apply reviewed-and-locked Skills without a full rebuild.

Skills are instruction files, so "pulling an update" means: report which Skills
changed since this trip was last generated, and rebuild the app shell. Data is
never silently regenerated — that would violate the stable-ID rule (spec §4)
and could overwrite the traveller's own edits. Re-running Convert is an
explicit `make generate --candidate` step.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib import paths


def fingerprint() -> dict:
    out = {}
    for skill in sorted(paths.SKILLS.glob("*.md")):
        out[skill.name] = hashlib.sha256(skill.read_bytes()).hexdigest()[:12]
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--trip", default="default")
    args = ap.parse_args()

    trip_dir = paths.trip_dir(args.trip)
    trip_dir.mkdir(parents=True, exist_ok=True)
    lock_path = trip_dir / "skills.lock.json"

    current = fingerprint()
    previous = {}
    if lock_path.exists():
        previous = json.loads(lock_path.read_text(encoding="utf-8"))

    changed = [name for name, digest in current.items() if previous.get(name) != digest]
    removed = [name for name in previous if name not in current]

    if not previous:
        print(f"update: first run for trip '{args.trip}' — recording {len(current)} skill(s).")
    elif changed or removed:
        print(f"update: {len(changed)} skill(s) changed since this trip was generated:")
        for name in changed:
            print(f"  * {name}")
        for name in removed:
            print(f"  - {name} (removed)")
        print("\nThe app shell rebuilds now. Trip *data* is not regenerated — re-running")
        print("Convert is deliberate, so existing ids and your own edits stay intact:")
        print(f'  make generate TRIP={args.trip}')
    else:
        print("update: skills unchanged — rebuilding the app shell only.")

    lock_path.write_text(json.dumps(current, indent=2), encoding="utf-8")

    import subprocess
    out = trip_dir / "jugni.html"
    src = paths.trip_input(args.trip)
    return subprocess.call([
        sys.executable, str(paths.ROOT / "scripts" / "build.py"),
        "--input", str(src.relative_to(paths.ROOT)),
        "--out", str(out.relative_to(paths.ROOT)),
    ])


if __name__ == "__main__":
    raise SystemExit(main())
