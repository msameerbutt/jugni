#!/usr/bin/env python3
"""`make clean` — remove build artifacts only.

Never touches raw/ or a trip's input.json: those are the irreplaceable parts.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib import paths


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--trip", default="default")
    args = ap.parse_args()

    trip_dir = paths.trip_dir(args.trip)
    removed = []
    for target in [trip_dir / "jugni.html", trip_dir / "skills.lock.json"]:
        if target.exists():
            target.unlink()
            removed.append(str(target.relative_to(paths.ROOT)))

    intake = trip_dir / "intake"
    if intake.exists():
        import shutil
        shutil.rmtree(intake)
        removed.append(str(intake.relative_to(paths.ROOT)) + "/")

    print("clean: removed " + (", ".join(removed) if removed else "nothing"))
    print("       raw/ and input.json left alone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
