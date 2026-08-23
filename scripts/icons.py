#!/usr/bin/env python3
"""`make icons` — vendor icon and flag SVGs from the image into src/icons/.

Why vendor rather than read straight from node_modules at build time: a built
Jugni is meant to still build identically in five years. Icons that live only
in an image are icons that disappear when the image is rebuilt against newer
packages. Vendoring the *subset actually listed* keeps the repo small, the
diffs readable, and the build reproducible with no network at all.

Sources (installed in the image, pinned — see Dockerfile):
  lucide-static  ISC   https://lucide.dev
  circle-flags   MIT   https://github.com/HatScripts/circle-flags
"""

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib import paths

NODE_MODULES = Path("/usr/local/lib/node_modules")
LUCIDE_SRC = NODE_MODULES / "lucide-static" / "icons"
FLAGS_SRC = NODE_MODULES / "circle-flags" / "flags"

ICONS_DIR = paths.SRC / "icons"


def read_manifest(path: Path) -> list[str]:
    """One entry per line; `#` starts a comment, inline or whole-line."""
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        entry = line.split("#", 1)[0].strip()
        if entry:
            out.append(entry)
    return out


def vendor(names, src_dir: Path, dest_dir: Path, label: str, take_all=False) -> int:
    if not src_dir.exists():
        print(f"  ! {label} source not found at {src_dir}")
        print(f"    The image predates this target — run `make rebuild`.")
        return 0

    available = {p.stem: p for p in src_dir.glob("*.svg")}
    if take_all:
        names = sorted(available)

    dest_dir.mkdir(parents=True, exist_ok=True)
    # Drop anything no longer listed, so the manifest stays the single source
    # of truth rather than an append-only pile.
    listed = set(names)
    for existing in dest_dir.glob("*.svg"):
        if existing.stem not in listed:
            existing.unlink()
            print(f"  -  {label}: removed {existing.stem} (no longer listed)")

    copied, missing = 0, []
    for name in names:
        source = available.get(name)
        if not source:
            missing.append(name)
            continue
        shutil.copyfile(source, dest_dir / f"{name}.svg")
        copied += 1

    total_kb = sum(p.stat().st_size for p in dest_dir.glob("*.svg")) / 1024
    print(f"  ok {label}: {copied} vendored to "
          f"{dest_dir.relative_to(paths.ROOT)} ({total_kb:.0f} KB)")

    if missing:
        print(f"  !  {label}: {len(missing)} not found in the set: {', '.join(missing)}")
        print(f"     Check the spelling against the upstream names.")
    return len(missing)


def write_licences() -> None:
    """Vendored assets carry their licence. Both permit redistribution; both
    require the licence text to travel with the files."""
    notes = {
        "lucide": ("Lucide", "ISC", "https://lucide.dev",
                   NODE_MODULES / "lucide-static" / "LICENSE"),
        "flags": ("circle-flags", "MIT", "https://github.com/HatScripts/circle-flags",
                  NODE_MODULES / "circle-flags" / "LICENSE"),
    }
    for folder, (name, licence, url, src) in notes.items():
        dest_dir = ICONS_DIR / folder
        if not dest_dir.exists():
            continue
        body = f"{name}\n{'=' * len(name)}\n\nLicence: {licence}\nSource:  {url}\n\n"
        if src.exists():
            body += src.read_text(encoding="utf-8", errors="replace")
        else:
            body += f"Licence text not found in the package; see {url}.\n"
        (dest_dir / "LICENCE.txt").write_text(body, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--flags", default="", help='"all" to vendor every flag rather than the manifest')
    args = ap.parse_args()

    print("vendoring icons from the tooling image")

    icon_names = read_manifest(ICONS_DIR / "icons.txt")
    flag_names = [n.lower() for n in read_manifest(ICONS_DIR / "flags.txt")]

    if not icon_names:
        print(f"  ! no names in {(ICONS_DIR / 'icons.txt')} — nothing to do")

    missing = 0
    missing += vendor(icon_names, LUCIDE_SRC, ICONS_DIR / "lucide", "lucide")
    missing += vendor(flag_names, FLAGS_SRC, ICONS_DIR / "flags", "flags",
                      take_all=(args.flags.lower() == "all"))
    write_licences()

    print("\nVendored files are committed to the repo on purpose: the build then "
          "needs no network,\nand an icon set shifting upstream can never change a "
          "built app without a visible diff.")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
