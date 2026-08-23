"""Repo paths. Everything resolves from the repo root so a script works the
same whether it is run from `make`, `make shell`, or a subdirectory."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

SRC = ROOT / "src"
CSS = SRC / "css"
JS = SRC / "js"
TEMPLATES = SRC / "templates"
FONTS = SRC / "fonts"
SKILLS = ROOT / "skills"
RAW = ROOT / "raw"
TRIPS = ROOT / "trips"
DOCS = ROOT / "docs"


def trip_dir(slug: str) -> Path:
    return TRIPS / slug
