#!/usr/bin/env python3
"""`make validate` — check a trip's input.json against the schema (spec §4).

Runs before `make build` in the generate flow so schema drift is caught
mechanically instead of only showing up when the rendered app breaks.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib import paths
from scripts.lib.schema import validate


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--trip", default="", help="trip slug under trips/")
    ap.add_argument("--name", default=paths.DEFAULT_INPUT,
                    help="which file under the trip's input/ to check (default: default)")
    ap.add_argument("--input", default="", help="explicit path (overrides --trip/--name)")
    ap.add_argument("--strict", action="store_true", help="treat warnings as failures too")
    args = ap.parse_args()

    if not args.input and not args.trip:
        ap.error("give --trip <slug> or --input <path>")
    path = paths.resolve_input(args.trip, args.name, args.input)
    shown = path.relative_to(paths.ROOT) if path.is_relative_to(paths.ROOT) else path

    if not path.exists():
        print(f"validate: no file at {shown} — nothing to check yet.")
        print("  (`make build` alone still produces the empty shell — that's build path (b).)")
        return 0

    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"FAIL {shown}: not valid JSON — {exc}")
        return 1

    errors, warnings = validate(doc)

    rel = path.relative_to(paths.ROOT) if path.is_relative_to(paths.ROOT) else path
    print(f"validate {rel}")

    for w in warnings:
        print(f"  warn  {w}")
    for e in errors:
        print(f"  ERROR {e}")

    counts = {k: len(v) for k, v in doc.items() if isinstance(v, list)}
    print("  records: " + ", ".join(f"{k}={n}" for k, n in counts.items() if n))

    if errors:
        print(f"\nFAILED — {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    if warnings and args.strict:
        print(f"\nFAILED (strict) — {len(warnings)} warning(s)")
        return 1

    print(f"\nOK — schema {doc.get('trip', {}).get('schemaVersion')}, "
          f"{len(warnings)} warning(s), 0 errors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
