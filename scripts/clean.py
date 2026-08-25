#!/usr/bin/env python3
"""`make clean` — remove build artifacts only.

Never touches raw/, intake/ or input/: those are the irreplaceable parts.
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

    # intake/ used to be deleted here, on the reasoning that it could always be
    # regenerated from raw/. That stopped being true when intake started
    # accumulating: a file the traveller has since filed away out of raw/ has
    # its extract and nothing else, so removing intake/ destroys the only copy
    # of what that document said. Build artefacts are replaceable; this is not.

    print("clean: removed " + (", ".join(removed) if removed else "nothing"))
    print("       raw/, intake/ and input/ left alone — none of those can be rebuilt.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
