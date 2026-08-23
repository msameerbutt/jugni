"""Repo paths. Everything resolves from the repo root so a script works the
same whether it is run from `make`, `make shell`, or a subdirectory.

A trip owns its whole working set, so nothing is shared between trips and
nothing lives at the repo root:

    trips/<slug>/
      raw/                 inbox — you drop booking PDFs, photos, notes here
      intake/              extracts, accumulated; survives raw/ being emptied
      input/
        default.json       the trip (what `make generate` writes)
        input1.json        an export dropped back in to rebuild from
      jugni.html           the built app
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

SRC = ROOT / "src"
CSS = SRC / "css"
JS = SRC / "js"
TEMPLATES = SRC / "templates"
FONTS = SRC / "fonts"
SKILLS = ROOT / "skills"
TRIPS = ROOT / "trips"
DOCS = ROOT / "docs"

# Trip data used to live in trips/<slug>/input.json, and `raw/` at the repo
# root. Both moved into the trip folder; these are kept only so an existing
# trip can be migrated rather than stranded.
LEGACY_RAW = ROOT / "raw"
INPUT_DIR_NAME = "input"
DEFAULT_INPUT = "default"


def trip_dir(slug: str) -> Path:
    return TRIPS / slug


def trip_raw(slug: str) -> Path:
    return trip_dir(slug) / "raw"


def trip_intake(slug: str) -> Path:
    return trip_dir(slug) / "intake"


def trip_input_dir(slug: str) -> Path:
    return trip_dir(slug) / INPUT_DIR_NAME


def trip_input(slug: str, name: str = DEFAULT_INPUT) -> Path:
    """`trips/<slug>/input/<name>.json`. A name may be given with or without
    the suffix, so `NAME=input1` and `NAME=input1.json` both work."""
    stem = (name or DEFAULT_INPUT).strip() or DEFAULT_INPUT
    if stem.endswith(".json"):
        stem = stem[: -len(".json")]
    return trip_input_dir(slug) / f"{stem}.json"


def legacy_input(slug: str) -> Path:
    return trip_dir(slug) / "input.json"


def scaffold(slug: str) -> list[Path]:
    """Create a trip's folders. Returns the ones that did not already exist,
    so the caller can tell a first run from a re-run."""
    made = []
    for d in (trip_raw(slug), trip_intake(slug), trip_input_dir(slug)):
        if not d.exists():
            d.mkdir(parents=True, exist_ok=True)
            made.append(d)
    return made


def migrate_legacy_input(slug: str) -> Path | None:
    """Move a pre-`input/` trip file into place. Returns the new path if
    anything moved. Never overwrites: if both exist the old one is left where
    it is for a human to reconcile, because picking one would silently discard
    a trip's worth of edits."""
    old, new = legacy_input(slug), trip_input(slug)
    if not old.exists() or new.exists():
        return None
    new.parent.mkdir(parents=True, exist_ok=True)
    old.rename(new)
    return new


def resolve_input(slug: str, name: str = DEFAULT_INPUT, explicit: str = "") -> Path:
    """Which file a build or validate should read.

    An explicit path always wins. Otherwise it is `input/<name>.json`, falling
    back to the pre-`input/` location so an un-migrated trip still builds
    instead of quietly producing an empty shell.
    """
    if explicit:
        p = Path(explicit)
        return p if p.is_absolute() else ROOT / p
    chosen = trip_input(slug, name)
    if not chosen.exists() and (name or DEFAULT_INPUT) in (DEFAULT_INPUT, ""):
        old = legacy_input(slug)
        if old.exists():
            return old
    return chosen
